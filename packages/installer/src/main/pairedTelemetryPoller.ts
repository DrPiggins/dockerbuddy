import { BrowserWindow } from "electron";
import { loadPaired } from "./pairing.js";
import type { CommandEvent } from "./telemetryServer.js";

// On a paired (remote-role) DockerBuddy, poll the controller's
// /events/recent endpoint so Command flow + frequency mirror what's happening
// on the Mac. Dedupes by (timestamp, tool) — events are append-only and the
// ring buffer is small, so a Set tracked client-side is fine.
const POLL_MS = 2000;
let timer: NodeJS.Timeout | null = null;
const seen = new Set<string>();

function broadcast(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function key(e: CommandEvent): string {
  return `${e.timestamp}|${e.tool}|${e.durationMs}|${e.ok ? 1 : 0}`;
}

async function tick(): Promise<void> {
  const paired = loadPaired();
  if (!paired) return;
  const url = `http://${paired.mac.ip}:${paired.mac.telemetryPort}/events/recent`;
  try {
    const r = await fetch(url, {
      headers: { "X-DockerBuddy-Token": paired.mac.telemetryToken },
      signal: AbortSignal.timeout(POLL_MS - 200),
    });
    if (!r.ok) return;
    const body = (await r.json()) as { events?: CommandEvent[] };
    const events = body.events ?? [];
    for (const evt of events) {
      const k = key(evt);
      if (seen.has(k)) continue;
      seen.add(k);
      broadcast("telemetry:cmd", evt);
    }
    // Keep the dedupe set bounded; controller's buffer is 200.
    if (seen.size > 1000) {
      const drop = seen.size - 500;
      let i = 0;
      for (const k of seen) {
        if (i++ >= drop) break;
        seen.delete(k);
      }
    }
  } catch {
    // Mac sleeping, network blip, etc. — try again next tick.
  }
}

export function startPairedTelemetryPoller(): void {
  if (timer) return;
  if (!loadPaired()) return;
  tick().catch(() => {});
  timer = setInterval(() => tick().catch(() => {}), POLL_MS);
}

export function stopPairedTelemetryPoller(): void {
  if (timer) clearInterval(timer);
  timer = null;
  seen.clear();
}
