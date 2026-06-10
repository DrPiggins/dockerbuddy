import path from "node:path";
import os from "node:os";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { networkInterfaces } from "node:os";
import { app } from "electron";
import { run, which } from "./exec.js";
import { loadConfig } from "./config.js";

const HOME = process.env.HOME || os.homedir();
const DOWNLOADS = path.join(HOME, "Downloads");

function resolveTemplate(name: string) {
  const dev = path.join(app.getAppPath(), "scripts", name);
  if (existsSync(dev)) return dev;
  return path.join(process.resourcesPath, "scripts", name);
}

function resolveWindowsExe(arch: "x64" | "arm64"): string {
  const name = `DockerBuddy-Windows-${arch}.exe`;
  // Prefer the stable resources/win/ location since vite's emptyOutDir
  // wipes dist/ on every renderer build.
  const stable = path.join(app.getAppPath(), "resources", "win", name);
  if (existsSync(stable)) return stable;
  const distPath = path.join(app.getAppPath(), "dist", name);
  if (existsSync(distPath)) return distPath;
  return path.join(process.resourcesPath, "win", name);
}

const ps1TemplatePath = () => resolveTemplate("windows-setup.ps1.tpl");
const nsiTemplatePath = () => resolveTemplate("windows-installer.nsi.tpl");
const shTemplatePath = () => resolveTemplate("linux-setup.sh.tpl");

export type RemoteArch = "x64" | "arm64";

export interface BuildInstallerArgs {
  contextName: string;
  pubkey: string;
  arch?: RemoteArch;
  sshPort?: number;
}

export interface BuildInstallerResult {
  ok: boolean;
  installerPath?: string;
  message?: string;
  detail?: string;
}

function renderPubkeyComment(pubkey: string) {
  return pubkey.split(/\s+/).slice(2).join(" ") || "dockerbuddy";
}

function detectMacLanIp(): string {
  const ifaces = networkInterfaces();
  for (const [, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    for (const a of addrs) {
      if (a.family === "IPv4" && !a.internal && !a.address.startsWith("169.")) {
        return a.address;
      }
    }
  }
  return "127.0.0.1";
}

function escapeNsisString(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function buildWindowsInstaller(
  args: BuildInstallerArgs,
): Promise<BuildInstallerResult> {
  const arch: RemoteArch = args.arch ?? "x64";
  const ps1Tpl = ps1TemplatePath();
  const nsiTpl = nsiTemplatePath();
  if (!existsSync(ps1Tpl)) {
    return { ok: false, message: `Missing PS1 template at ${ps1Tpl}` };
  }
  if (!existsSync(nsiTpl)) {
    return { ok: false, message: `Missing NSIS template at ${nsiTpl}` };
  }

  const windowsExe = resolveWindowsExe(arch);
  if (!existsSync(windowsExe)) {
    return {
      ok: false,
      message: `Missing Windows build for ${arch}.`,
      detail: `Expected: ${windowsExe}\nRun: npm run dist:win`,
    };
  }

  const makensisPath =
    (await which("makensis")) || "/opt/homebrew/bin/makensis";
  if (!existsSync(makensisPath)) {
    return {
      ok: false,
      message: "makensis not installed. Run: brew install makensis",
    };
  }

  if (!existsSync(DOWNLOADS)) mkdirSync(DOWNLOADS, { recursive: true });

  const safe = args.contextName.replace(/[^a-zA-Z0-9_-]/g, "") || "homelab";
  const buildDir = path.join(
    app.getPath("temp"),
    `dockerbuddy-installer-${safe}-${Date.now()}`,
  );
  mkdirSync(buildDir, { recursive: true });

  const ps1Out = path.join(buildDir, "dockerbuddy-setup.ps1");
  const nsiOut = path.join(buildDir, "installer.nsi");
  const pairedOut = path.join(buildDir, "paired.json");
  const exeOut = path.join(
    DOWNLOADS,
    `DockerBuddy-Setup-${safe}-${arch}.exe`,
  );

  const cfg = loadConfig();
  const paired = {
    role: "remote",
    contextName: args.contextName,
    mac: {
      host: os.hostname(),
      ip: detectMacLanIp(),
      telemetryPort: cfg.listenPort,
      telemetryToken: cfg.telemetryToken,
    },
    pairedAt: new Date().toISOString(),
  };
  writeFileSync(pairedOut, JSON.stringify(paired, null, 2), "utf8");

  const keyComment = renderPubkeyComment(args.pubkey);

  const sshPort = args.sshPort && args.sshPort >= 1 && args.sshPort <= 65535
    ? Math.trunc(args.sshPort)
    : 22;

  const ps1Rendered = readFileSync(ps1Tpl, "utf8")
    .replace(/\{\{CONTEXT_NAME\}\}/g, args.contextName)
    .replace(/\{\{KEY_COMMENT\}\}/g, keyComment)
    .replace(/\{\{SSH_PORT\}\}/g, String(sshPort))
    .replace(/\{\{PUBKEY\}\}/g, args.pubkey);
  writeFileSync(ps1Out, ps1Rendered, "utf8");

  const nsiRendered = readFileSync(nsiTpl, "utf8")
    .replace(/\{\{CONTEXT_NAME\}\}/g, args.contextName)
    .replace(/\{\{SSH_PORT\}\}/g, String(sshPort))
    .replace(/\{\{OUTPUT_EXE\}\}/g, escapeNsisString(exeOut))
    .replace(/\{\{PS1_PATH\}\}/g, escapeNsisString(ps1Out))
    .replace(/\{\{WIN_EXE\}\}/g, escapeNsisString(windowsExe))
    .replace(/\{\{PAIRED_JSON\}\}/g, escapeNsisString(pairedOut))
    .replace(/\{\{NSI_NAME\}\}/g, `DockerBuddy Setup — ${args.contextName}`);
  writeFileSync(nsiOut, nsiRendered, "utf8");

  const build = await run(makensisPath, ["-V2", nsiOut]);
  if (!build.ok || !existsSync(exeOut)) {
    return {
      ok: false,
      message: "makensis failed",
      detail: (build.stderr || build.stdout).slice(-600),
    };
  }

  return { ok: true, installerPath: exeOut };
}

export async function buildLinuxScript(
  args: BuildInstallerArgs,
): Promise<BuildInstallerResult> {
  const shTpl = shTemplatePath();
  if (!existsSync(shTpl)) {
    return { ok: false, message: `Missing shell template at ${shTpl}` };
  }

  if (!existsSync(DOWNLOADS)) mkdirSync(DOWNLOADS, { recursive: true });

  const safe = args.contextName.replace(/[^a-zA-Z0-9_-]/g, "") || "homelab";
  const outPath = path.join(DOWNLOADS, `dockerbuddy-setup-${safe}.sh`);

  const sshPort = args.sshPort && args.sshPort >= 1 && args.sshPort <= 65535
    ? Math.trunc(args.sshPort)
    : 22;

  const rendered = readFileSync(shTpl, "utf8")
    .replace(/\{\{CONTEXT_NAME\}\}/g, args.contextName)
    .replace(/\{\{KEY_COMMENT\}\}/g, renderPubkeyComment(args.pubkey))
    .replace(/\{\{SSH_PORT\}\}/g, String(sshPort))
    .replace(/\{\{PUBKEY\}\}/g, args.pubkey);

  writeFileSync(outPath, rendered, "utf8");
  chmodSync(outPath, 0o755);

  return { ok: true, installerPath: outPath };
}
