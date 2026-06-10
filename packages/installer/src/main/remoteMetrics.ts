import { BrowserWindow } from "electron";
import { run, which } from "./exec.js";
import { loadConfig } from "./config.js";
import type { HostMetrics, RemoteHostMetrics } from "../shared.js";

const POLL_MS = 5000;
// Hard cap on a single ssh probe. ConnectTimeout=8 only covers TCP handshake;
// once auth/IO starts, ssh can hang indefinitely. Without this cap, ticks
// fired by setInterval pile up against an unreachable host and the LAN sees a
// growing fleet of half-open SSH attempts (which on macOS chokes mDNSResponder
// and looks like the whole machine has lost the internet).
const PROBE_TIMEOUT_MS = 12000;
let timer: NodeJS.Timeout | null = null;
let running = false;

const PS_PROBE = [
  "$ErrorActionPreference='Stop';",
  "$os=Get-CimInstance Win32_OperatingSystem;",
  "$c=(Get-CimInstance Win32_Processor|Measure-Object LoadPercentage -Average).Average;",
  "$mt=[double]$os.TotalVisibleMemorySize*1024;",
  "$mf=[double]$os.FreePhysicalMemory*1024;",
  "$ut=(Get-Date)-$os.LastBootUpTime;",
  // Disk activity from perfmon. % Disk Time can overshoot 100 on multi-spindle
  // systems so we clamp. Suppress Get-Counter's locale headers via -ErrorAction.
  "try{$db=(Get-Counter '\\PhysicalDisk(_Total)\\% Disk Time' -ErrorAction Stop).CounterSamples[0].CookedValue}catch{$db=0};",
  "try{$di=(Get-Counter '\\PhysicalDisk(_Total)\\Disk Transfers/sec' -ErrorAction Stop).CounterSamples[0].CookedValue}catch{$di=0};",
  // Sum bytes/sec across non-loopback interfaces. Get-Counter exposes each
  // adapter as a separate instance; filter out the local loopbacks so we
  // don't double-count Hyper-V/WSL virtual switches.
  "try{$nr=((Get-Counter '\\Network Interface(*)\\Bytes Received/sec' -ErrorAction Stop).CounterSamples|Where-Object{$_.InstanceName -notmatch 'Loopback|isatap'}|Measure-Object -Property CookedValue -Sum).Sum}catch{$nr=0};",
  "try{$ns=((Get-Counter '\\Network Interface(*)\\Bytes Sent/sec' -ErrorAction Stop).CounterSamples|Where-Object{$_.InstanceName -notmatch 'Loopback|isatap'}|Measure-Object -Property CookedValue -Sum).Sum}catch{$ns=0};",
  "[pscustomobject]@{cpu=$c;cores=[Environment]::ProcessorCount;mem_total=$mt;mem_used=($mt-$mf);disk_busy=[math]::Min(100,$db);disk_iops=$di;net_rx=$nr;net_tx=$ns;uptime=[int]$ut.TotalSeconds}|ConvertTo-Json -Compress",
].join("");

// PowerShell -EncodedCommand expects UTF-16LE base64. This sidesteps cmd/ssh
// quoting entirely — nested double quotes in the script (e.g. `DeviceID='C:'`
// inside a WMI filter) would otherwise terminate the outer -Command string and
// produce HRESULT 0x80041017 (WMI invalid query) on the remote host.
const PS_ENCODED = Buffer.from(PS_PROBE, "utf16le").toString("base64");

function broadcast(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

async function probeOne(ctx: {
  name: string;
}): Promise<RemoteHostMetrics> {
  const sshPath = (await which("ssh")) || "/usr/bin/ssh";
  // Use the SSH host alias — ssh_config already has HostName/User/IdentityFile
  // for both wizard-created and user-managed hosts. This keeps us out of the
  // business of guessing keys.
  const args = [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=8",
    "-o",
    "StrictHostKeyChecking=accept-new",
    ctx.name,
    `powershell -NoProfile -NonInteractive -EncodedCommand ${PS_ENCODED}`,
  ];
  const r = await run(sshPath, args, { timeout: PROBE_TIMEOUT_MS });
  if (!r.ok) {
    return {
      name: ctx.name,
      ok: false,
      error:
        (r.stderr || r.stdout)
          .split("\n")
          .filter((l) => l.trim() && !l.startsWith("Warning:"))
          .slice(-1)[0] || "ssh failed",
    };
  }
  try {
    const parsed = JSON.parse((r.stdout || "").trim());
    const memTotal = Number(parsed.mem_total) || 0;
    const memUsed = Number(parsed.mem_used) || 0;
    const metrics: HostMetrics = {
      cpu: { percent: Number(parsed.cpu) || 0, cores: Number(parsed.cores) || 0 },
      memory: {
        used: memUsed,
        total: memTotal,
        percent: memTotal ? (memUsed / memTotal) * 100 : 0,
      },
      disk: {
        busyPercent: Math.min(100, Number(parsed.disk_busy) || 0),
        iops: Number(parsed.disk_iops) || 0,
      },
      network: {
        rx: Number(parsed.net_rx) || 0,
        tx: Number(parsed.net_tx) || 0,
        iface: "all",
      },
      uptime: Number(parsed.uptime) || 0,
    };
    return { name: ctx.name, ok: true, metrics };
  } catch (e: any) {
    return {
      name: ctx.name,
      ok: false,
      error: `parse: ${e.message} — ${(r.stdout || "").slice(0, 80)}`,
    };
  }
}

async function tick() {
  const ctxs = loadConfig().contexts ?? [];
  if (ctxs.length === 0) return;
  const results = await Promise.allSettled(ctxs.map(probeOne));
  for (const r of results) {
    if (r.status === "fulfilled") broadcast("remote:metrics", r.value);
  }
}

// Self-rescheduling chain (vs setInterval) so a slow tick can't let the next
// one fire on top of it. With multiple unreachable contexts, an interval-based
// poller piles up concurrent ssh processes; this guarantees at most one probe
// fleet in flight per cycle.
async function loop(): Promise<void> {
  if (!running) return;
  try {
    await tick();
  } catch {
    // tick already swallows per-probe errors; this is belt-and-suspenders
  }
  if (!running) return;
  timer = setTimeout(loop, POLL_MS);
}

export function startRemoteMetrics(): void {
  if (running) return;
  running = true;
  loop();
}

export function stopRemoteMetrics(): void {
  running = false;
  if (timer) clearTimeout(timer);
  timer = null;
}
