import si from "systeminformation";
import { BrowserWindow } from "electron";
import { run } from "./exec.js";

export interface HostMetrics {
  cpu: {
    percent: number;
    cores: number;
  };
  memory: {
    used: number;
    total: number;
    percent: number;
  };
  disk: {
    busyPercent: number;
    iops: number;
  } | null;
  network: {
    rx: number;
    tx: number;
    iface: string;
  } | null;
  uptime: number;
}

let timer: NodeJS.Timeout | null = null;

// systeminformation's disksIO() doesn't support Windows. Fall back to Get-Counter
// for `% Disk Time` and `Disk Transfers/sec`, mirroring the remote PS probe.
// Cached so we don't spawn powershell.exe on every 2s tick — refreshed every
// other tick is plenty for an at-a-glance gauge.
let lastWinDisk: { busyPercent: number; iops: number } | null = null;
let winDiskInFlight = false;
async function refreshWindowsDisk(): Promise<void> {
  if (winDiskInFlight) return;
  winDiskInFlight = true;
  try {
    const r = await run("powershell", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "try{$b=(Get-Counter '\\PhysicalDisk(_Total)\\% Disk Time' -EA Stop).CounterSamples[0].CookedValue}catch{$b=0};try{$i=(Get-Counter '\\PhysicalDisk(_Total)\\Disk Transfers/sec' -EA Stop).CounterSamples[0].CookedValue}catch{$i=0};Write-Output \"$b,$i\"",
    ]);
    if (r.ok) {
      const [b, i] = r.stdout.trim().split(",").map(Number);
      lastWinDisk = {
        busyPercent: Math.min(100, Number.isFinite(b) ? b : 0),
        iops: Number.isFinite(i) ? i : 0,
      };
    }
  } catch {
    // keep previous sample on failure
  } finally {
    winDiskInFlight = false;
  }
}

function broadcast(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

async function tick() {
  try {
    // Kick off the Windows disk probe in the background; result lands in
    // lastWinDisk for the next tick. First tick after launch shows null until
    // the first probe finishes (~500ms).
    if (process.platform === "win32") refreshWindowsDisk();

    const [load, mem, diskIO, nets, time] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.disksIO().catch(() => null),
      si.networkStats().catch(() => []),
      si.time(),
    ]);

    // Pick the active interface with the most cumulative traffic.
    const activeNet = nets
      .filter((n: any) => n.operstate === "up" || n.iface)
      .sort(
        (a: any, b: any) =>
          (b.rx_bytes ?? 0) + (b.tx_bytes ?? 0) - ((a.rx_bytes ?? 0) + (a.tx_bytes ?? 0)),
      )[0];

    const metrics: HostMetrics = {
      cpu: {
        percent: load.currentLoad || 0,
        cores: load.cpus?.length || 0,
      },
      memory: {
        used: mem.active || 0,
        total: mem.total || 0,
        percent: mem.total ? ((mem.active || 0) / mem.total) * 100 : 0,
      },
      // Windows: real perf counters via cached PowerShell probe (lastWinDisk).
      // macOS/Linux: systeminformation's iostat-backed disksIO(); no clean
      // %util so we approximate from IOPS (100 transfers/sec ≈ full bar).
      disk:
        process.platform === "win32"
          ? lastWinDisk
          : diskIO
            ? {
                iops: diskIO.tIO_sec ?? 0,
                busyPercent: Math.min(100, diskIO.tIO_sec ?? 0),
              }
            : null,
      network: activeNet
        ? {
            rx: activeNet.rx_sec || 0,
            tx: activeNet.tx_sec || 0,
            iface: activeNet.iface || "",
          }
        : null,
      uptime: time.uptime || 0,
    };
    broadcast("host:metrics", metrics);
  } catch (e) {
    console.error("[hostMetrics] tick failed:", e);
  }
}

export function startHostMetrics(): void {
  // Warm up systeminformation; first call is throwaway since deltas are zero.
  si.currentLoad().catch(() => {});
  si.networkStats().catch(() => {});
  setTimeout(() => {
    tick();
    timer = setInterval(tick, 2000);
  }, 1500);
}

export function stopHostMetrics(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
