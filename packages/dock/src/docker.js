import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { join } from "node:path";

const execFileP = promisify(execFile);

const MAX_BUFFER = 16 * 1024 * 1024;

export async function docker(args, opts = {}) {
  const fullArgs = opts.context
    ? ["--context", opts.context, ...args]
    : args;
  try {
    const { stdout, stderr } = await execFileP("docker", fullArgs, {
      maxBuffer: MAX_BUFFER,
      cwd: opts.cwd,
    });
    return { ok: true, stdout, stderr };
  } catch (e) {
    return {
      ok: false,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? e.message,
    };
  }
}

// Collect stdout/stderr from a spawn(). Optional stdin can be either a Buffer
// or another stream (it will be piped). Used by the ephemeral sync flow to
// stream a tar through `docker exec -i` without buffering the whole archive
// in memory.
export function spawnCollect(cmd, args, opts = {}) {
  const { stdinStream, stdinData, cwd, timeoutMs } = opts;
  return new Promise((resolve) => {
    const start = Date.now();
    const proc = spawn(cmd, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    proc.stdout.on("data", (c) => {
      stdoutChunks.push(c);
      stdoutBytes += c.length;
    });
    proc.stderr.on("data", (c) => {
      stderrChunks.push(c);
      stderrBytes += c.length;
    });
    let timer;
    if (timeoutMs) {
      timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
    }
    proc.on("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({
        code,
        signal,
        stdout: Buffer.concat(stdoutChunks, stdoutBytes),
        stderr: Buffer.concat(stderrChunks, stderrBytes),
        durationMs: Date.now() - start,
      });
    });
    proc.on("error", (e) => {
      if (timer) clearTimeout(timer);
      resolve({
        code: -1,
        signal: null,
        stdout: Buffer.concat(stdoutChunks, stdoutBytes),
        stderr: Buffer.from(String(e)),
        durationMs: Date.now() - start,
      });
    });
    if (stdinStream) {
      stdinStream.pipe(proc.stdin);
    } else if (stdinData) {
      proc.stdin.end(stdinData);
    } else {
      proc.stdin.end();
    }
  });
}

// tar the host path → pipe through `docker exec -i container tar -x`. Avoids
// buffering the whole archive in this process.
export async function pipeHostTarToContainer({
  hostPath,
  exclude,
  container,
  context,
  remotePath,
}) {
  const tarArgs = [];
  for (const x of exclude) tarArgs.push(`--exclude=${x}`);
  tarArgs.push("-cf", "-", "-C", hostPath, ".");
  const tarProc = spawn("tar", tarArgs, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const dockArgs = [];
  if (context) dockArgs.push("--context", context);
  dockArgs.push("exec", "-i", container, "tar", "-xf", "-", "-C", remotePath);
  const dockProc = spawn("docker", dockArgs, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  tarProc.stdout.pipe(dockProc.stdin);

  const tarErrChunks = [];
  const dockErrChunks = [];
  tarProc.stderr.on("data", (c) => tarErrChunks.push(c));
  dockProc.stderr.on("data", (c) => dockErrChunks.push(c));

  const [tarExit, dockExit] = await Promise.all([
    new Promise((r) => tarProc.on("close", (code) => r(code))),
    new Promise((r) => dockProc.on("close", (code) => r(code))),
  ]);

  return {
    ok: tarExit === 0 && dockExit === 0,
    tarExit,
    dockExit,
    tarStderr: Buffer.concat(tarErrChunks).toString("utf8"),
    dockStderr: Buffer.concat(dockErrChunks).toString("utf8"),
  };
}

// Mirror of the above in the other direction: `docker exec container tar -c`
// → host tar -x. Used to bring back build artifacts / changed files after the
// ephemeral run.
export async function pipeContainerTarToHost({
  container,
  context,
  remotePath,
  sourcePath,
  hostPath,
}) {
  const dockArgs = [];
  if (context) dockArgs.push("--context", context);
  dockArgs.push(
    "exec",
    container,
    "tar",
    "-cf",
    "-",
    "-C",
    remotePath,
    sourcePath,
  );
  const dockProc = spawn("docker", dockArgs, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const tarProc = spawn("tar", ["-xf", "-", "-C", hostPath], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  dockProc.stdout.pipe(tarProc.stdin);

  const dockErrChunks = [];
  const tarErrChunks = [];
  dockProc.stderr.on("data", (c) => dockErrChunks.push(c));
  tarProc.stderr.on("data", (c) => tarErrChunks.push(c));

  const [dockExit, tarExit] = await Promise.all([
    new Promise((r) => dockProc.on("close", (code) => r(code))),
    new Promise((r) => tarProc.on("close", (code) => r(code))),
  ]);

  return {
    ok: dockExit === 0 && tarExit === 0,
    dockExit,
    tarExit,
    dockStderr: Buffer.concat(dockErrChunks).toString("utf8"),
    tarStderr: Buffer.concat(tarErrChunks).toString("utf8"),
  };
}

export function parseJsonLines(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function findComposeFile(cwd = process.cwd()) {
  const candidates = [
    "compose.yaml",
    "compose.yml",
    "docker-compose.yaml",
    "docker-compose.yml",
  ];
  for (const c of candidates) {
    const p = join(cwd, c);
    if (existsSync(p)) return p;
  }
  return null;
}

const INSPECT_KEEP = [
  "Id",
  "Name",
  "Image",
  "State.Status",
  "State.Running",
  "State.Health.Status",
  "State.ExitCode",
  "State.StartedAt",
  "State.FinishedAt",
  "Config.Cmd",
  "Config.Env",
  "Config.WorkingDir",
  "Config.Labels",
  "HostConfig.RestartPolicy.Name",
  "HostConfig.NetworkMode",
  "HostConfig.Binds",
  "HostConfig.PortBindings",
  "Mounts",
  "NetworkSettings.Ports",
  "NetworkSettings.Networks",
];

function pluck(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(target, path, value) {
  const keys = path.split(".");
  let cur = target;
  for (let i = 0; i < keys.length - 1; i++) {
    cur[keys[i]] ??= {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

export function summarizeInspect(raw) {
  const out = {};
  for (const path of INSPECT_KEEP) {
    const v = pluck(raw, path);
    if (v !== undefined) setPath(out, path, v);
  }
  return out;
}
