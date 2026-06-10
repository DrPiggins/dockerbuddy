import { app, BrowserWindow, dialog } from "electron";
import pkg from "electron-updater";
import { loadPaired } from "./pairing.js";

const { autoUpdater } = pkg;

// Tunables. Re-check every 4h while running so users who leave the app open
// pick up patches without restarting.
const RECHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let started = false;

export function startAutoUpdater(): void {
  if (started) return;
  started = true;

  // Skip entirely in dev — electron-updater reads package.json metadata that
  // the dev server doesn't have on disk in the right shape.
  if (!app.isPackaged) {
    console.log("[updater] dev build, skipping");
    return;
  }

  // Paired hosts run in remote mode; they don't need their own update flow
  // (controller drives the experience). They still get version bumps when
  // the human reinstalls.
  if (loadPaired()) {
    console.log("[updater] paired host, skipping");
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on("update-available", (info) => {
    console.log(`[updater] new version available: ${info.version}`);
    broadcastUpdateState({ state: "downloading", version: info.version });
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[updater] up to date");
  });

  autoUpdater.on("download-progress", (p) => {
    broadcastUpdateState({
      state: "downloading",
      percent: Math.round(p.percent),
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log(`[updater] downloaded ${info.version}, will install on quit`);
    broadcastUpdateState({ state: "ready", version: info.version });
    promptRestart(info.version).catch(() => {});
  });

  autoUpdater.on("error", (err) => {
    console.warn(`[updater] error: ${err?.message ?? err}`);
    broadcastUpdateState({ state: "error", message: String(err?.message ?? err) });
  });

  autoUpdater.checkForUpdates().catch((e) => {
    console.warn(`[updater] initial check failed: ${e?.message ?? e}`);
  });

  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, RECHECK_INTERVAL_MS);
}

async function promptRestart(version: string): Promise<void> {
  const win = BrowserWindow.getAllWindows()[0];
  const res = await dialog.showMessageBox(win ?? null!, {
    type: "info",
    buttons: ["Restart now", "Later"],
    defaultId: 0,
    cancelId: 1,
    title: "DockerBuddy update ready",
    message: `Version ${version} is ready to install.`,
    detail: "Restart DockerBuddy to apply the update.",
  });
  if (res.response === 0) {
    autoUpdater.quitAndInstall();
  }
}

type UpdateState =
  | { state: "downloading"; version?: string; percent?: number }
  | { state: "ready"; version: string }
  | { state: "error"; message: string };

function broadcastUpdateState(s: UpdateState): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send("updater:state", s);
  }
}
