import { execFile, ExecFileOptions } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const execFileP = promisify(execFile);

const IS_WIN = process.platform === "win32";
const PATH_SEP = IS_WIN ? ";" : ":";

// Electron launched from the GUI doesn't inherit a login shell's PATH, so we
// pre-seed the common install dirs per-OS. On Windows we cover Docker Desktop,
// system32, and the npm-global "claude.cmd" location.
function buildExtraPath(): string[] {
  const home = os.homedir();
  if (IS_WIN) {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    const localAppData =
      process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    const programFiles =
      process.env["ProgramFiles"] || "C:\\Program Files";
    return [
      path.join(programFiles, "Docker", "Docker", "resources", "bin"),
      path.join(appData, "npm"),
      path.join(localAppData, "Programs", "claude"),
      path.join(home, ".local", "bin"),
    ];
  }
  return [
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/local/sbin",
    path.join(home, ".local", "bin"),
    path.join(home, ".cargo", "bin"),
  ];
}

const EXTRA_PATH = buildExtraPath();

export function augmentedPath() {
  const existing = process.env.PATH || "";
  return [...EXTRA_PATH, ...existing.split(PATH_SEP)].join(PATH_SEP);
}

export async function which(bin: string): Promise<string | null> {
  // On Windows, callers pass "docker" / "claude" without an extension; resolve
  // via PATHEXT so we find docker.exe, claude.cmd, etc.
  const exts = IS_WIN
    ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];
  const dirs = EXTRA_PATH.concat((process.env.PATH || "").split(PATH_SEP));
  for (const dir of dirs) {
    if (!dir) continue;
    for (const ext of exts) {
      const p = path.join(dir, bin + ext.toLowerCase());
      if (existsSync(p)) return p;
      if (IS_WIN) {
        const pUpper = path.join(dir, bin + ext);
        if (existsSync(pUpper)) return pUpper;
      }
    }
  }
  return null;
}

export interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

export async function run(
  cmd: string,
  args: string[],
  opts: ExecFileOptions = {},
): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileP(cmd, args, {
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, PATH: augmentedPath() },
      ...opts,
    });
    return {
      ok: true,
      stdout: stdout.toString(),
      stderr: stderr.toString(),
      code: 0,
    };
  } catch (e: any) {
    return {
      ok: false,
      stdout: (e.stdout ?? "").toString(),
      stderr: (e.stderr ?? e.message ?? "").toString(),
      code: e.code ?? null,
    };
  }
}
