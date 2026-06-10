import path from "node:path";
import os from "node:os";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  chmodSync,
} from "node:fs";
import { app } from "electron";
import { run, which } from "./exec.js";
import { patchConfig, loadConfig } from "./config.js";
import type {
  ActionResult,
  RemoteArch,
  RemoteConfig,
  RemotePlatform,
  RemoteTestResult,
  SetupScriptResult,
  SetupInstallerResult,
} from "../shared.js";
import { buildWindowsInstaller, buildLinuxScript } from "./installerBuilder.js";

const HOME = process.env.HOME || os.homedir();
const SSH_DIR = path.join(HOME, ".ssh");
const SSH_CONFIG = path.join(SSH_DIR, "config");
const DOWNLOADS = path.join(HOME, "Downloads");

function dockerBuddyKeyPath(contextName: string) {
  const safe = contextName.replace(/[^a-zA-Z0-9_-]/g, "") || "homelab";
  return path.join(SSH_DIR, `dockerbuddy_${safe}_ed25519`);
}

function scriptTemplatePath() {
  const dev = path.join(app.getAppPath(), "scripts", "windows-setup.ps1.tpl");
  if (existsSync(dev)) return dev;
  return path.join(process.resourcesPath, "scripts", "windows-setup.ps1.tpl");
}

async function ensureSshKey(
  contextName: string,
): Promise<{ pubkey: string; privPath: string }> {
  if (!existsSync(SSH_DIR)) {
    mkdirSync(SSH_DIR, { recursive: true, mode: 0o700 });
  }
  const privPath = dockerBuddyKeyPath(contextName);
  const pubPath = `${privPath}.pub`;

  if (!existsSync(privPath)) {
    const sshKeygen = (await which("ssh-keygen")) || "/usr/bin/ssh-keygen";
    const gen = await run(sshKeygen, [
      "-t",
      "ed25519",
      "-f",
      privPath,
      "-N",
      "",
      "-C",
      `dockerbuddy:${contextName}@${os.hostname()}`,
    ]);
    if (!gen.ok || !existsSync(pubPath)) {
      throw new Error(`ssh-keygen failed: ${gen.stderr.slice(-300)}`);
    }
    chmodSync(privPath, 0o600);
  }

  return {
    pubkey: readFileSync(pubPath, "utf8").trim(),
    privPath,
  };
}

function normalizeSshPort(p: number | undefined): number {
  const n = Math.trunc(Number(p));
  if (!Number.isFinite(n) || n < 1 || n > 65535) return 22;
  return n;
}

// Docker context names must match ^[a-zA-Z0-9][a-zA-Z0-9_.+-]+$ — no spaces or
// other punctuation. Convert anything illegal to a hyphen, collapse runs, and
// ensure the leading char is alphanumeric.
function sanitizeContextName(name: string): string {
  let s = name.replace(/[^a-zA-Z0-9_.+-]+/g, "-").replace(/-+/g, "-");
  s = s.replace(/^[^a-zA-Z0-9]+/, "");
  if (s.length < 2) s = (s + "homelab").slice(0, 16);
  return s;
}

export async function generateSshKeyAndInstaller(
  contextName: string,
  platform: RemotePlatform = "windows",
  arch: RemoteArch = "x64",
  sshPort: number = 22,
): Promise<SetupInstallerResult> {
  const port = normalizeSshPort(sshPort);
  try {
    const { pubkey } = await ensureSshKey(contextName);
    const built =
      platform === "linux"
        ? await buildLinuxScript({ contextName, pubkey, arch, sshPort: port })
        : await buildWindowsInstaller({
            contextName,
            pubkey,
            arch,
            sshPort: port,
          });
    if (!built.ok) {
      return {
        ok: false,
        installerPath: "",
        platform,
        pubkey: "",
        contextName,
        sshPort: port,
        message: built.message,
        detail: built.detail,
      };
    }
    return {
      ok: true,
      installerPath: built.installerPath!,
      platform,
      pubkey,
      contextName,
      sshPort: port,
    };
  } catch (e: any) {
    return {
      ok: false,
      installerPath: "",
      platform,
      pubkey: "",
      contextName,
      sshPort: port,
      message: e.message,
    };
  }
}

export async function generateSshKeyAndScript(
  contextName: string,
): Promise<SetupScriptResult> {
  try {
    const { pubkey } = await ensureSshKey(contextName);
    const tplPath = scriptTemplatePath();
    if (!existsSync(tplPath)) {
      return {
        ok: false,
        scriptPath: "",
        pubkey: "",
        contextName,
        message: `Missing setup template at ${tplPath}`,
      };
    }
    const tpl = readFileSync(tplPath, "utf8");
    const keyComment = pubkey.split(/\s+/).slice(2).join(" ") || "dockerbuddy";
    const rendered = tpl
      .replace(/\{\{CONTEXT_NAME\}\}/g, contextName)
      .replace(/\{\{KEY_COMMENT\}\}/g, keyComment)
      .replace(/\{\{PUBKEY\}\}/g, pubkey);

    if (!existsSync(DOWNLOADS)) mkdirSync(DOWNLOADS, { recursive: true });
    const outPath = path.join(DOWNLOADS, `dockerbuddy-setup-${contextName}.ps1`);
    writeFileSync(outPath, rendered, "utf8");

    return {
      ok: true,
      scriptPath: outPath,
      pubkey,
      contextName,
    };
  } catch (e: any) {
    return {
      ok: false,
      scriptPath: "",
      pubkey: "",
      contextName,
      message: e.message,
    };
  }
}

function readSshConfig(): string {
  if (!existsSync(SSH_CONFIG)) return "";
  return readFileSync(SSH_CONFIG, "utf8");
}

function quoteIfSpaces(s: string) {
  return /\s/.test(s) ? `"${s}"` : s;
}

function buildSshConfigBlock(
  cfg: RemoteConfig,
  keyPath: string,
  aliasName: string,
): string {
  // SSH config requires the user value to be quoted if it contains spaces.
  const port = normalizeSshPort(cfg.sshPort);
  const portLine = port !== 22 ? `  Port ${port}\n` : "";
  return `
Host ${aliasName}
  HostName ${cfg.ip}
  User ${quoteIfSpaces(cfg.username)}
${portLine}  IdentityFile ${keyPath}
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
`.replace(/\n{2,}/g, "\n").trim();
}

function upsertSshConfigBlock(
  cfg: RemoteConfig,
  keyPath: string,
  aliasName: string,
): void {
  if (!existsSync(SSH_DIR)) mkdirSync(SSH_DIR, { recursive: true, mode: 0o700 });
  const existing = readSshConfig();
  const block = buildSshConfigBlock(cfg, keyPath, aliasName);

  // Drop any prior block for this Host name, then append the new one. Also
  // strip a stale block keyed by the un-sanitized contextName so we don't
  // leave duplicate or invalid entries lying around when names get cleaned.
  const aliasesToStrip = Array.from(new Set([aliasName, cfg.contextName]));
  let stripped = existing;
  for (const alias of aliasesToStrip) {
    const safe = alias.replace(/[.+\-?^${}()|[\]\\]/g, "\\$&");
    const headerRegex = new RegExp(
      `(^|\\n)Host\\s+${safe}\\b[\\s\\S]*?(?=(\\nHost\\s+|$))`,
      "g",
    );
    stripped = stripped.replace(headerRegex, "");
  }
  stripped = stripped.replace(/\n{3,}/g, "\n\n");
  const joined =
    (stripped.endsWith("\n") || stripped.length === 0 ? stripped : stripped + "\n") +
    block +
    "\n";
  writeFileSync(SSH_CONFIG, joined, "utf8");
  chmodSync(SSH_CONFIG, 0o600);
}

export async function testRemote(cfg: RemoteConfig): Promise<RemoteTestResult> {
  const sshPath = (await which("ssh")) || "/usr/bin/ssh";
  const keyPath = dockerBuddyKeyPath(cfg.contextName);
  if (!existsSync(keyPath)) {
    return {
      ok: false,
      error: "SSH key for this context is missing — generate it on the previous step.",
    };
  }

  // Don't permanently update ~/.ssh/config yet — we don't want to leave a
  // stale entry on failed tests. Use explicit -i + -l for the probe.
  const port = normalizeSshPort(cfg.sshPort);
  const sshArgs = [
    "-i",
    keyPath,
    "-p",
    String(port),
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=10",
    "-o",
    "IdentitiesOnly=yes",
    "-l",
    cfg.username,
    cfg.ip,
    // Use double quotes so Windows cmd.exe treats the format value as a single
    // arg (it doesn't honor single quotes), and a '|' separator so we don't
    // need any whitespace inside the quoted block.
    'docker version --format "{{.Server.Version}}|{{.Server.Os}}"',
  ];
  const r = await run(sshPath, sshArgs);

  if (!r.ok) {
    return {
      ok: false,
      error:
        (r.stderr || r.stdout)
          .split("\n")
          .filter((l) => l.trim() && !l.startsWith("Warning:"))
          .slice(-4)
          .join("\n") || "SSH connection failed",
    };
  }

  const out = (r.stdout || "").trim();
  const [version, osName] = out.split("|");
  if (!version) {
    return {
      ok: false,
      error:
        "Connected, but Docker isn't reachable. Make sure Docker Desktop is running on Windows.",
    };
  }
  return { ok: true, dockerVersion: version, os: osName || "unknown" };
}

export async function createRemoteContext(
  cfg: RemoteConfig,
): Promise<ActionResult> {
  const keyPath = dockerBuddyKeyPath(cfg.contextName);
  if (!existsSync(keyPath)) {
    return { ok: false, message: "SSH key is missing — re-run setup." };
  }

  // Docker context names can't contain spaces — sanitize for both the docker
  // context AND the matching ssh_config Host alias so they line up.
  const dockerName = sanitizeContextName(cfg.contextName);

  // 1. Make sure ~/.ssh/config has an alias that lets `docker --context`
  //    resolve the Mac→remote SSH hop with the right key + quoted username.
  try {
    upsertSshConfigBlock(cfg, keyPath, dockerName);
  } catch (e: any) {
    return { ok: false, message: `Couldn't write ~/.ssh/config: ${e.message}` };
  }

  // 2. (Re-)create the Docker context that points at that alias.
  const dockerPath = await which("docker");
  if (!dockerPath) {
    return {
      ok: false,
      message: "docker CLI missing — go back to the install step.",
    };
  }

  // Remove existing context (under either name) so we can recreate cleanly.
  await run(dockerPath, ["context", "rm", dockerName, "-f"]);
  if (dockerName !== cfg.contextName) {
    await run(dockerPath, ["context", "rm", cfg.contextName, "-f"]);
  }

  const create = await run(dockerPath, [
    "context",
    "create",
    dockerName,
    "--docker",
    `host=ssh://${dockerName}`,
    "--description",
    `DockerBuddy remote: ${cfg.username}@${cfg.ip}`,
  ]);

  if (!create.ok) {
    return {
      ok: false,
      message: `docker context create failed: ${(create.stderr || create.stdout).slice(-300)}`,
    };
  }

  const existing = loadConfig().contexts ?? [];
  const without = existing.filter(
    (c) => c.name !== cfg.contextName && c.name !== dockerName,
  );
  patchConfig({
    contexts: [
      ...without,
      {
        name: dockerName,
        ip: cfg.ip,
        username: cfg.username,
        sshPort: normalizeSshPort(cfg.sshPort),
        createdAt: new Date().toISOString(),
      },
    ],
  });

  const renamed = dockerName !== cfg.contextName
    ? ` (cleaned from "${cfg.contextName}")`
    : "";
  return {
    ok: true,
    message: `Context "${dockerName}" created${renamed}`,
    detail: `ssh://${dockerName} → ${cfg.username}@${cfg.ip}`,
  };
}
