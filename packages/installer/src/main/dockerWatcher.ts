import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { BrowserWindow } from "electron";
import { which, augmentedPath, run } from "./exec.js";
import { loadConfig } from "./config.js";

export interface ContainerStat {
  id: string;
  name: string;
  image?: string;
  cpuPerc: string;
  memUsage: string;
  memPerc: string;
  netIO: string;
  blockIO: string;
  pids: string;
}

export interface DockerEvent {
  type: string;
  action: string;
  actor?: { id?: string; attributes?: Record<string, string> };
  time?: number;
  timeNano?: number;
  scope?: string;
  status?: string;
  id?: string;
  from?: string;
}

let statsProc: ChildProcessWithoutNullStreams | null = null;
let eventsProc: ChildProcessWithoutNullStreams | null = null;
let statsRetry: NodeJS.Timeout | null = null;
let eventsRetry: NodeJS.Timeout | null = null;
let dockerInfoTimer: NodeJS.Timeout | null = null;
let stopped = true;

function broadcast(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

async function dockerPath(): Promise<string | null> {
  // Mac/Linux: brew, /usr/local/bin, etc.
  const found = await which("docker");
  if (found) return found;
  // Windows: Docker Desktop installs CLI here
  const winPath = "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe";
  return winPath;
}

// If the user has paired a remote context, target it explicitly instead of the
// active local context. Otherwise the dashboard's Docker row shows "offline"
// when Docker Desktop isn't running on the Mac, even though the remote engine
// is reachable. First context wins for now — multi-remote UI comes later.
function activeContextName(): string | null {
  const ctxs = loadConfig().contexts ?? [];
  return ctxs[0]?.name ?? null;
}

function spawnDocker(args: string[]): ChildProcessWithoutNullStreams | null {
  const ctx = activeContextName();
  const full = ctx ? ["--context", ctx, ...args] : args;
  return spawn("docker", full, {
    env: { ...process.env, PATH: augmentedPath() },
    windowsHide: true,
  }) as ChildProcessWithoutNullStreams;
}

function startStatsLoop() {
  if (stopped) return;
  const p = spawnDocker([
    "stats",
    "--format",
    "{{json .}}",
    "--no-trunc",
  ]);
  if (!p) {
    scheduleStatsRetry();
    return;
  }
  statsProc = p;

  let snapshot: ContainerStat[] = [];
  let buf = "";

  p.stdout.on("data", (chunk: Buffer) => {
    buf += chunk.toString();
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    // `docker stats` re-emits each container every refresh; flush a snapshot
    // after each batch of lines.
    const batch: ContainerStat[] = [];
    for (const line of lines) {
      const t = line.trim();
      // Strip ANSI escapes (docker stats prints clear-screen codes)
      const clean = t.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
      if (!clean) continue;
      try {
        const j = JSON.parse(clean);
        batch.push({
          id: j.ID || j.Container || "",
          name: j.Name || "",
          cpuPerc: j.CPUPerc || "0%",
          memUsage: j.MemUsage || "",
          memPerc: j.MemPerc || "0%",
          netIO: j.NetIO || "",
          blockIO: j.BlockIO || "",
          pids: j.PIDs || "0",
        });
      } catch {
        // ignore garbage lines
      }
    }
    if (batch.length > 0) {
      // De-dup by container id within the batch (latest wins)
      const map = new Map<string, ContainerStat>();
      for (const c of batch) map.set(c.id, c);
      snapshot = Array.from(map.values());
      broadcast("docker:stats", snapshot);
    }
  });

  p.stderr.on("data", () => {});
  p.on("exit", () => {
    statsProc = null;
    scheduleStatsRetry();
  });
  p.on("error", () => {
    statsProc = null;
    scheduleStatsRetry();
  });
}

function scheduleStatsRetry() {
  if (stopped || statsRetry) return;
  statsRetry = setTimeout(() => {
    statsRetry = null;
    startStatsLoop();
  }, 5000);
}

function startEventsLoop() {
  if (stopped) return;
  const p = spawnDocker(["events", "--format", "{{json .}}"]);
  if (!p) {
    scheduleEventsRetry();
    return;
  }
  eventsProc = p;

  let buf = "";
  p.stdout.on("data", (chunk: Buffer) => {
    buf += chunk.toString();
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      try {
        const j = JSON.parse(t) as DockerEvent;
        broadcast("docker:event", j);
      } catch {
        // ignore
      }
    }
  });
  p.stderr.on("data", () => {});
  p.on("exit", () => {
    eventsProc = null;
    scheduleEventsRetry();
  });
  p.on("error", () => {
    eventsProc = null;
    scheduleEventsRetry();
  });
}

function scheduleEventsRetry() {
  if (stopped || eventsRetry) return;
  eventsRetry = setTimeout(() => {
    eventsRetry = null;
    startEventsLoop();
  }, 5000);
}

async function pollDockerInfo() {
  const docker = await dockerPath();
  if (!docker) {
    broadcast("docker:info", { ok: false, error: "docker CLI not found" });
    return;
  }
  const ctx = activeContextName();
  const infoArgs = ctx
    ? ["--context", ctx, "info", "--format", "{{json .}}"]
    : ["info", "--format", "{{json .}}"];
  // `docker --context <ssh-ctx> info` shells out over SSH and will hang
  // indefinitely if the remote host is asleep or auth stalls. Cap the call so
  // a dead remote can't accumulate zombie docker/ssh processes every 5s.
  const r = await run(docker, infoArgs, { timeout: 15000 });
  if (!r.ok) {
    broadcast("docker:info", {
      ok: false,
      error: r.stderr.split("\n")[0] || "docker info failed",
    });
    return;
  }
  try {
    const j = JSON.parse(r.stdout);
    broadcast("docker:info", {
      ok: true,
      serverVersion: j.ServerVersion,
      operatingSystem: j.OperatingSystem,
      containers: j.Containers,
      containersRunning: j.ContainersRunning,
      containersPaused: j.ContainersPaused,
      containersStopped: j.ContainersStopped,
      images: j.Images,
      ncpu: j.NCPU,
      memTotal: j.MemTotal,
      kernelVersion: j.KernelVersion,
    });
    // `docker stats` only emits when containers exist; when the last one is
    // removed the stream goes silent and the renderer keeps a stale snapshot.
    // Info polls every 5s, so use it as the authoritative "empty" signal.
    if (j.ContainersRunning === 0) broadcast("docker:stats", []);
  } catch {
    broadcast("docker:info", { ok: false, error: "couldn't parse docker info" });
  }
}

// Self-rescheduling instead of setInterval: if pollDockerInfo stalls (e.g. a
// slow SSH context taking the full 15s timeout), the next tick waits rather
// than firing on top and stacking docker subprocesses.
async function pollDockerInfoLoop(): Promise<void> {
  if (stopped) return;
  try {
    await pollDockerInfo();
  } catch {}
  if (stopped) return;
  dockerInfoTimer = setTimeout(pollDockerInfoLoop, 5000);
}

export function startDockerWatcher(): void {
  stopped = false;
  startStatsLoop();
  startEventsLoop();
  pollDockerInfoLoop();
}

// Re-spawn stats/events against whatever context is currently configured.
// Called after the wizard creates a remote context so the dashboard switches
// from the (offline) local socket to the freshly-paired host without an app
// restart.
export function restartDockerWatcher(): void {
  if (stopped) return;
  if (statsProc) statsProc.kill();
  if (eventsProc) eventsProc.kill();
  if (statsRetry) clearTimeout(statsRetry);
  if (eventsRetry) clearTimeout(eventsRetry);
  statsProc = null;
  eventsProc = null;
  statsRetry = null;
  eventsRetry = null;
  startStatsLoop();
  startEventsLoop();
  pollDockerInfo();
}

export function stopDockerWatcher(): void {
  stopped = true;
  if (statsProc) statsProc.kill();
  if (eventsProc) eventsProc.kill();
  if (statsRetry) clearTimeout(statsRetry);
  if (eventsRetry) clearTimeout(eventsRetry);
  if (dockerInfoTimer) clearTimeout(dockerInfoTimer);
  statsProc = null;
  eventsProc = null;
  statsRetry = null;
  eventsRetry = null;
  dockerInfoTimer = null;
}
