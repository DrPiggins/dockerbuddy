// Fire-and-forget emit of CommandEvent records to the local DockerBuddy
// installer's telemetry HTTP listener (default 127.0.0.1:47761), so the
// Command flow + Frequency panes light up in real time when Claude drives
// a `dock` tool.
//
// Silent by design: if the installer isn't running, the config file is
// missing, the port is closed, or the POST fails, the tool call still
// succeeds. Telemetry is observability, not part of the contract.

import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import http from "node:http";

// Production builds use productName "DockerBuddy"; `npm run dev` uses the
// package.json name "dockerbuddy". Either may be the live install — try both.
const PRODUCT_NAMES = ["DockerBuddy", "dockerbuddy"];

function userDataCandidates() {
  const home = os.homedir();
  if (process.platform === "darwin") {
    return PRODUCT_NAMES.map((n) =>
      path.join(home, "Library", "Application Support", n),
    );
  }
  if (process.platform === "win32") {
    const appdata =
      process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return PRODUCT_NAMES.map((n) => path.join(appdata, n));
  }
  const xdg =
    process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  return PRODUCT_NAMES.map((n) => path.join(xdg, n));
}

let configCache = null;
let configCacheAt = 0;
const CONFIG_TTL_MS = 5_000;

function loadConfig() {
  const now = Date.now();
  if (configCache && now - configCacheAt < CONFIG_TTL_MS) return configCache;
  for (const dir of userDataCandidates()) {
    const p = path.join(dir, "config.json");
    try {
      const raw = fs.readFileSync(p, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed?.telemetryToken && parsed?.listenPort) {
        configCache = parsed;
        configCacheAt = now;
        return parsed;
      }
    } catch {
      // try next candidate
    }
  }
  configCache = null;
  configCacheAt = now;
  return null;
}

const MAX_STR = 240;
const MAX_DEPTH = 4;
const MAX_ARR = 16;
const MAX_KEYS = 24;

// Trim args so a giant `exec` command argv or a 10kB heredoc doesn't blow up
// the 200-entry ring buffer or the renderer's command-log row layout.
function scrub(value, depth = 0) {
  if (value == null || depth > MAX_DEPTH) return value;
  if (typeof value === "string") {
    return value.length > MAX_STR
      ? value.slice(0, MAX_STR) + `… [+${value.length - MAX_STR}b]`
      : value;
  }
  if (Array.isArray(value)) {
    const head = value.slice(0, MAX_ARR).map((v) => scrub(v, depth + 1));
    if (value.length > MAX_ARR) head.push(`… [+${value.length - MAX_ARR}]`);
    return head;
  }
  if (typeof value === "object") {
    const out = {};
    const keys = Object.keys(value);
    for (let i = 0; i < Math.min(keys.length, MAX_KEYS); i++) {
      out[keys[i]] = scrub(value[keys[i]], depth + 1);
    }
    if (keys.length > MAX_KEYS) out["…"] = `+${keys.length - MAX_KEYS} more`;
    return out;
  }
  return value;
}

function postEvent(evt) {
  const cfg = loadConfig();
  if (!cfg) return;
  const body = JSON.stringify(evt);
  try {
    const req = http.request({
      host: "127.0.0.1",
      port: cfg.listenPort,
      path: "/events/cmd",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "X-DockerBuddy-Token": cfg.telemetryToken,
      },
      timeout: 1500,
    });
    req.on("error", () => {});
    req.on("timeout", () => req.destroy());
    req.write(body);
    req.end();
  } catch {
    // request() throws synchronously on bad config; swallow.
  }
}

// Monkey-patch server.registerTool once; every subsequent registration is
// transparently wrapped with timing + emit. Keeps bin/dock.js's tool list
// readable instead of forcing a `withTelemetry(handler)` wrapper at each call.
export function instrument(server) {
  const original = server.registerTool.bind(server);
  server.registerTool = (name, schema, handler) => {
    return original(name, schema, async (args, extra) => {
      const start = Date.now();
      let ok = true;
      let error;
      try {
        const result = await handler(args, extra);
        if (result?.isError) {
          ok = false;
          const txt = result?.content?.[0]?.text;
          if (typeof txt === "string") error = txt;
        }
        return result;
      } catch (e) {
        ok = false;
        error = e?.message ?? String(e);
        throw e;
      } finally {
        postEvent({
          tool: name,
          args: args ? scrub(args) : undefined,
          durationMs: Date.now() - start,
          ok,
          error: error ? scrub(error) : undefined,
          timestamp: new Date().toISOString(),
          machine: os.hostname(),
        });
      }
    });
  };
}

// Exported for unit tests / one-shot manual probes.
export { postEvent, loadConfig };
