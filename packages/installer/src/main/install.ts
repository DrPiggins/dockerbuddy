import path from "node:path";
import os from "node:os";
import { app } from "electron";
import {
  existsSync,
  cpSync,
  rmSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { run, which } from "./exec.js";
import { loadConfig, patchConfig, telemetryUrlForLocalhost } from "./config.js";
import type { ActionResult } from "../shared.js";

const CLAUDE_MD_BEGIN = "<!-- DOCKERBUDDY:BEGIN -- managed block, edits will be overwritten -->";
const CLAUDE_MD_END = "<!-- DOCKERBUDDY:END -->";

// Sit next to config.json / paired.json in Electron's userData dir so paths
// resolve correctly on macOS, Windows, and Linux without per-OS branches.
function dockInstallDir(): string {
  return path.join(app.getPath("userData"), "dock");
}

function bundledDockPath(): string {
  // In dev, dock is a sibling workspace at ../dock. When packaged, electron-builder
  // copies it to process.resourcesPath/dock per package.json extraResources.
  const devPath = path.join(app.getAppPath(), "..", "dock");
  if (existsSync(devPath)) return devPath;
  return path.join(process.resourcesPath, "dock");
}

function bundledClaudeContextPath(): string {
  const devPath = path.join(app.getAppPath(), "resources", "claude-context.md");
  if (existsSync(devPath)) return devPath;
  return path.join(process.resourcesPath, "claude-context.md");
}

export function claudeMdPath(): string {
  return path.join(os.homedir(), ".claude", "CLAUDE.md");
}

export async function installDockerCli(): Promise<ActionResult> {
  const existing = await which("docker");
  if (existing) {
    const v = await run(existing, ["--version"]);
    return {
      ok: true,
      message: `Already installed`,
      detail: v.stdout.trim(),
    };
  }

  // Only macOS gets an automated brew install. Windows + Linux require the
  // user to grab Docker Desktop / Engine themselves — auto-installing a daemon
  // on someone else's OS is too invasive.
  if (process.platform === "darwin") {
    const brewPath = await which("brew");
    if (!brewPath) {
      return {
        ok: false,
        message:
          "Homebrew is required to install Docker CLI. Install brew from brew.sh then retry.",
      };
    }
    const inst = await run(brewPath, ["install", "docker"]);
    if (!inst.ok) {
      return {
        ok: false,
        message: "brew install docker failed",
        detail: inst.stderr.slice(-500),
      };
    }
    const post = await which("docker");
    if (!post) {
      return {
        ok: false,
        message: "Installed but couldn't find `docker` on PATH",
      };
    }
    const v = await run(post, ["--version"]);
    return { ok: true, message: "Installed", detail: v.stdout.trim() };
  }

  if (process.platform === "win32") {
    return {
      ok: false,
      message:
        "Install Docker Desktop from docker.com/products/docker-desktop, then re-open DockerBuddy.",
    };
  }

  return {
    ok: false,
    message:
      "Install Docker Engine from docs.docker.com/engine/install, then re-open DockerBuddy.",
  };
}

export async function installDockResource(): Promise<ActionResult> {
  const src = bundledDockPath();
  if (!existsSync(src)) {
    return {
      ok: false,
      message: "Bundled dock resource is missing — reinstall DockerBuddy",
    };
  }

  mkdirSync(path.dirname(dockInstallDir()), { recursive: true });

  // Wipe-then-copy. cpSync({force: true}) returns EEXIST when overlaying
  // onto a tree that already contains symlinks (e.g. node_modules/.bin),
  // so we can't just copy on top. The dock dir is owned entirely by the
  // installer; nothing else writes here, so rmSync is safe.
  try {
    rmSync(dockInstallDir(), { recursive: true, force: true });
    cpSync(src, dockInstallDir(), { recursive: true, force: true });
  } catch (e: any) {
    return {
      ok: false,
      message: "Couldn't copy dock into place",
      detail: e.message,
    };
  }

  return {
    ok: true,
    message: "Installed",
    detail: dockInstallDir(),
  };
}

export interface DockVersionCheck {
  bundled: string;
  installed: string | null;
  stale: boolean;
}

function readPkgVersion(dir: string): string | null {
  try {
    const raw = readFileSync(path.join(dir, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}

export function compareDockVersions(): DockVersionCheck {
  const bundled = readPkgVersion(bundledDockPath()) ?? "0.0.0";
  const installed = readPkgVersion(dockInstallDir());
  return { bundled, installed, stale: installed !== bundled };
}

export type DockRefreshResult =
  | { upgraded: false; reason: string }
  | { upgraded: true; from: string | null; to: string; dir: string };

// Bring the installed dock at userData/dock/ in sync with the bundle that
// shipped with this build of DockerBuddy whenever their package.json versions
// differ. Lets users who installed an older DockerBuddy pick up dock patches
// without re-running the setup wizard, and protects against version skew
// between the in-process telemetry server and the MCP server it expects to
// hear from.
//
// Best-effort: never throws, never blocks app boot. First-run users (no
// `installedDockPath` yet) are deferred to the wizard. Paired hosts have no
// Claude Code MCP registration, so the caller should also gate on !paired.
export async function autoRefreshDockIfNeeded(): Promise<DockRefreshResult> {
  const cfg = loadConfig();
  if (!cfg.installedDockPath) {
    return { upgraded: false, reason: "first-run — wizard owns initial install" };
  }
  if (!existsSync(bundledDockPath())) {
    return { upgraded: false, reason: "bundled dock missing from build" };
  }
  const check = compareDockVersions();
  if (!check.stale) {
    return { upgraded: false, reason: `up to date (${check.installed})` };
  }
  const result = await installDockResource();
  if (!result.ok) {
    const detail = result.detail ? ` — ${result.detail}` : "";
    return { upgraded: false, reason: `install failed: ${result.message}${detail}` };
  }
  return {
    upgraded: true,
    from: check.installed,
    to: check.bundled,
    dir: dockInstallDir(),
  };
}

export async function registerDockMcp(): Promise<ActionResult> {
  const claude = await which("claude");
  if (!claude) {
    return {
      ok: false,
      message:
        "Claude Code CLI not found. Install it from claude.ai/code and re-open DockerBuddy.",
    };
  }

  const entryPoint = path.join(dockInstallDir(), "bin", "dock.js");
  if (!existsSync(entryPoint)) {
    return {
      ok: false,
      message: `dock entry point missing at ${entryPoint}. Run the previous step first.`,
    };
  }

  // Remove any existing 'dock' registration so we can re-register against the
  // DockerBuddy-managed copy. `claude mcp remove` returns non-zero if it
  // doesn't exist; ignore that.
  await run(claude, ["mcp", "remove", "dock"]);

  const cfg = loadConfig();
  const add = await run(claude, [
    "mcp",
    "add",
    "dock",
    "--env",
    `DOCKERBUDDY_TELEMETRY_URL=${telemetryUrlForLocalhost()}`,
    "--env",
    `DOCKERBUDDY_TELEMETRY_TOKEN=${cfg.telemetryToken}`,
    "--",
    "node",
    entryPoint,
  ]);
  if (!add.ok) {
    return {
      ok: false,
      message: "claude mcp add failed",
      detail: (add.stderr || add.stdout).slice(-500),
    };
  }

  patchConfig({ installedDockPath: entryPoint });

  // Drop Claude's user-global CLAUDE.md context so any future Claude Code
  // session on this machine knows to use dock + understands the topology.
  // Best-effort: failure here shouldn't block dock registration succeeding.
  const ctx = await installClaudeContext();
  const ctxDetail = ctx.ok ? ` · context → ${ctx.detail}` : "";

  return {
    ok: true,
    message: "Registered with Claude Code",
    detail: `dock → node ${entryPoint}${ctxDetail}`,
  };
}

// Write/refresh the DockerBuddy block in ~/.claude/CLAUDE.md so any Claude
// Code session on this machine picks it up automatically. Idempotent via
// BEGIN/END markers: existing block is replaced, surrounding user content is
// preserved, missing file is created.
export async function installClaudeContext(): Promise<ActionResult> {
  const src = bundledClaudeContextPath();
  if (!existsSync(src)) {
    return { ok: false, message: "Bundled Claude context is missing" };
  }
  let template: string;
  try {
    template = readFileSync(src, "utf8");
  } catch (e: any) {
    return { ok: false, message: "Couldn't read Claude context template", detail: e.message };
  }

  const block = `${CLAUDE_MD_BEGIN}\n${template.trim()}\n${CLAUDE_MD_END}\n`;
  const target = claudeMdPath();
  try {
    mkdirSync(path.dirname(target), { recursive: true });
    let existing = "";
    try {
      existing = readFileSync(target, "utf8");
    } catch {
      // file doesn't exist yet — that's fine
    }
    let next: string;
    const beginIdx = existing.indexOf(CLAUDE_MD_BEGIN);
    const endIdx = existing.indexOf(CLAUDE_MD_END);
    if (beginIdx >= 0 && endIdx > beginIdx) {
      // Replace the managed block, keep everything else.
      const before = existing.slice(0, beginIdx);
      const after = existing.slice(endIdx + CLAUDE_MD_END.length);
      next = `${before}${block}${after.replace(/^\n+/, "\n")}`;
    } else if (existing.trim().length === 0) {
      next = block;
    } else {
      next = `${existing.replace(/\n*$/, "\n\n")}${block}`;
    }
    writeFileSync(target, next, "utf8");
    return { ok: true, message: "Installed", detail: target };
  } catch (e: any) {
    return {
      ok: false,
      message: `Couldn't write ${target}`,
      detail: e.message,
    };
  }
}
