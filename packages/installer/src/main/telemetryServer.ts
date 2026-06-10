import http from "node:http";
import { BrowserWindow } from "electron";
import { loadConfig } from "./config.js";

export interface CommandEvent {
  tool: string;
  args?: Record<string, unknown>;
  durationMs: number;
  ok: boolean;
  error?: string;
  timestamp: string;
  machine: string;
}

const BUFFER_LIMIT = 200;
const buffer: CommandEvent[] = [];
let server: http.Server | null = null;

export function getRecentEvents(): CommandEvent[] {
  return buffer.slice();
}

function broadcast(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function pushEvent(evt: CommandEvent) {
  buffer.push(evt);
  if (buffer.length > BUFFER_LIMIT) buffer.shift();
  broadcast("telemetry:cmd", evt);
}

function reply(
  res: http.ServerResponse,
  status: number,
  body: object | string,
) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

export function startTelemetryServer(): void {
  if (server) return;
  const cfg = loadConfig();

  server = http.createServer((req, res) => {
    // CORS preflight (useful if Mac-side later wants to send from a browser)
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-DockerBuddy-Token");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.statusCode = 204;
      res.end();
      return;
    }

    const token = req.headers["x-dockerbuddy-token"];
    // Read fresh per-request so token rotation takes effect immediately —
    // capturing cfg at server start would force a restart on every rotation.
    if (!token || token !== loadConfig().telemetryToken) {
      return reply(res, 401, { error: "invalid token" });
    }

    // Paired devices poll this to mirror the controller's Command flow + freq
    // graph. Returns the in-memory ring buffer; caller filters by `since`
    // timestamp client-side to dedupe.
    if (req.method === "GET" && req.url?.startsWith("/events/recent")) {
      return reply(res, 200, { events: buffer.slice() });
    }

    if (req.method !== "POST" || req.url !== "/events/cmd") {
      return reply(res, 404, { error: "not found" });
    }

    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (c: Buffer) => {
      total += c.length;
      if (total > 64 * 1024) {
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf8");
        const evt = JSON.parse(body) as CommandEvent;
        if (typeof evt.tool !== "string" || typeof evt.timestamp !== "string") {
          return reply(res, 400, { error: "malformed event" });
        }
        // Reject unparseable timestamps at ingress so a bad event can't NaN
        // out renderer math (Math.floor(NaN) → NaN → stacks[NaN] crash).
        if (!Number.isFinite(new Date(evt.timestamp).getTime())) {
          return reply(res, 400, { error: "bad timestamp" });
        }
        pushEvent(evt);
        reply(res, 200, { ok: true });
      } catch {
        reply(res, 400, { error: "bad json" });
      }
    });
    req.on("error", () => reply(res, 500, { error: "stream error" }));
  });

  server.listen(cfg.listenPort, cfg.listenHost, () => {
    console.log(
      `[telemetry] listening on ${cfg.listenHost}:${cfg.listenPort}`,
    );
  });

  server.on("error", (e) => {
    console.error("[telemetry] server error:", e);
  });
}

export function stopTelemetryServer(): void {
  if (server) {
    server.close();
    server = null;
  }
}
