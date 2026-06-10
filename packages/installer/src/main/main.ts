import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkPrereqs } from "./prereqs.js";
import {
  installDockerCli,
  installDockResource,
  registerDockMcp,
  installClaudeContext,
  claudeMdPath,
  autoRefreshDockIfNeeded,
} from "./install.js";
import {
  generateSshKeyAndScript,
  generateSshKeyAndInstaller,
  testRemote,
  createRemoteContext,
} from "./remote.js";
import {
  loadConfig,
  removeContextByName,
  rotateTelemetryToken,
} from "./config.js";
import {
  startTelemetryServer,
  stopTelemetryServer,
  getRecentEvents,
} from "./telemetryServer.js";
import {
  startDockerWatcher,
  stopDockerWatcher,
  restartDockerWatcher,
} from "./dockerWatcher.js";
import { startHostMetrics, stopHostMetrics } from "./hostMetrics.js";
import { startRemoteMetrics, stopRemoteMetrics } from "./remoteMetrics.js";
import {
  startPairedTelemetryPoller,
  stopPairedTelemetryPoller,
} from "./pairedTelemetryPoller.js";
import { backfillContextsOnce } from "./backfillContexts.js";
import { loadPaired, unpair } from "./pairing.js";
import { changeServerSshPort, getServerSshPort } from "./serverConfig.js";
import { run, which } from "./exec.js";
import { startAutoUpdater } from "./updater.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV_URL = process.env.VITE_DEV_SERVER_URL;

async function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 920,
    minHeight: 640,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#070d1c",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.once("ready-to-show", () => win.show());

  if (DEV_URL) {
    await win.loadURL(DEV_URL);
  } else {
    await win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

function registerIpc() {
  ipcMain.handle("checkPrereqs", () => checkPrereqs());
  ipcMain.handle("installDockerCli", () => installDockerCli());
  ipcMain.handle("installDockResource", () => installDockResource());
  ipcMain.handle("registerDockMcp", () => registerDockMcp());
  ipcMain.handle("installClaudeContext", () => installClaudeContext());
  ipcMain.handle("revealClaudeContext", () =>
    shell.showItemInFolder(claudeMdPath()),
  );
  ipcMain.handle(
    "generateSshKeyAndScript",
    (_e, ctxName: string) => generateSshKeyAndScript(ctxName),
  );
  ipcMain.handle(
    "generateSshKeyAndInstaller",
    (
      _e,
      ctxName: string,
      platform: "windows" | "linux",
      arch: "x64" | "arm64",
      sshPort: number,
    ) => generateSshKeyAndInstaller(ctxName, platform, arch, sshPort),
  );
  ipcMain.handle("revealScript", (_e, p: string) => shell.showItemInFolder(p));
  ipcMain.handle("testRemote", (_e, cfg) => testRemote(cfg));
  ipcMain.handle("createRemoteContext", async (_e, cfg) => {
    const r = await createRemoteContext(cfg);
    if (r.ok) restartDockerWatcher();
    return r;
  });
  ipcMain.handle("openExternal", (_e, url: string) => shell.openExternal(url));
  ipcMain.handle("getServerSshPort", () => getServerSshPort());
  ipcMain.handle(
    "changeServerSshPort",
    (_e, port: number) => changeServerSshPort(port),
  );

  ipcMain.handle("dashboardSnapshot", () => {
    const cfg = loadConfig();
    const paired = loadPaired();
    return {
      recentEvents: getRecentEvents(),
      configured: !!cfg.installedDockPath || !!paired,
      telemetryToken: cfg.telemetryToken,
      listenPort: cfg.listenPort,
      platform: process.platform,
      contexts: (cfg.contexts ?? []).map((c) => ({
        name: c.name,
        ip: c.ip,
        username: c.username,
        sshPort: c.sshPort ?? 22,
        createdAt: c.createdAt,
      })),
      paired: paired
        ? {
            contextName: paired.contextName,
            macHost: paired.mac.host,
            macIp: paired.mac.ip,
            pairedAt: paired.pairedAt,
          }
        : null,
    };
  });

  ipcMain.handle("rotateTelemetryToken", async () => {
    const token = rotateTelemetryToken();
    // Re-register dock so Claude Code picks up the new env var. The
    // telemetry server itself reads cfg per-request, so existing dock
    // processes will lose auth until the new MCP env reaches them on next
    // Claude session.
    const re = await registerDockMcp();
    return {
      ok: true,
      message: re.ok
        ? "Rotated. Dock re-registered with the new token."
        : "Rotated, but couldn't re-register dock automatically.",
      detail: re.ok ? token : re.message,
    };
  });

  ipcMain.handle("removeRemoteContext", async (_e, name: string) => {
    if (!name || typeof name !== "string") {
      return { ok: false, message: "Missing context name" };
    }
    const removed = removeContextByName(name);
    if (!removed) {
      return { ok: false, message: `No context named "${name}"` };
    }
    const docker = await which("docker");
    let detail = "";
    if (docker) {
      const r = await run(docker, ["context", "rm", "-f", name]);
      if (!r.ok) detail = (r.stderr || r.stdout).slice(-300);
    }
    restartDockerWatcher();
    return {
      ok: true,
      message: `Removed "${name}"`,
      detail: detail || undefined,
    };
  });

  ipcMain.handle("unpairFromController", async () => {
    const ok = unpair();
    if (!ok) {
      return { ok: false, message: "Not paired" };
    }
    stopPairedTelemetryPoller();
    return {
      ok: true,
      message: "Unpaired. Restart DockerBuddy to switch back to controller mode.",
    };
  });
}

app.whenReady().then(async () => {
  loadConfig();
  await backfillContextsOnce().catch(() => {});

  // Bring the installed dock in sync with this build's bundled dock before
  // anything else touches Claude Code's MCP registration or the telemetry
  // server. Skip on paired hosts — they have no Claude-Code MCP registration
  // to update; dock lives only on the controller.
  if (!loadPaired()) {
    try {
      const r = await autoRefreshDockIfNeeded();
      if (r.upgraded) {
        console.log(
          `[dock] auto-upgraded ${r.from ?? "(none)"} → ${r.to} at ${r.dir}`,
        );
      } else {
        console.log(`[dock] auto-refresh skipped: ${r.reason}`);
      }
    } catch (e: any) {
      console.warn(`[dock] auto-refresh threw: ${e?.message ?? e}`);
    }
  }

  registerIpc();
  startTelemetryServer();
  startDockerWatcher();
  startHostMetrics();
  startRemoteMetrics();
  startPairedTelemetryPoller();
  startAutoUpdater();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  stopTelemetryServer();
  stopDockerWatcher();
  stopHostMetrics();
  stopRemoteMetrics();
  stopPairedTelemetryPoller();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
