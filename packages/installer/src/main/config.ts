import path from "node:path";
import { app } from "electron";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";

export interface BuddyConfig {
  telemetryToken: string;
  listenPort: number;
  listenHost: string;
  createdAt: string;
  installedDockPath?: string;
  contexts?: Array<{
    name: string;
    ip: string;
    username: string;
    createdAt: string;
    sshPort?: number;
  }>;
}

let cached: BuddyConfig | null = null;

function configDir(): string {
  return app.getPath("userData");
}

function configPath(): string {
  return path.join(configDir(), "config.json");
}

function defaultConfig(): BuddyConfig {
  return {
    telemetryToken: randomBytes(32).toString("hex"),
    listenPort: 47761,
    listenHost: "0.0.0.0",
    createdAt: new Date().toISOString(),
  };
}

export function loadConfig(): BuddyConfig {
  if (cached) return cached;
  const p = configPath();
  if (!existsSync(p)) {
    const def = defaultConfig();
    saveConfig(def);
    cached = def;
    return def;
  }
  try {
    const raw = readFileSync(p, "utf8");
    const parsed = JSON.parse(raw) as Partial<BuddyConfig>;
    const merged: BuddyConfig = { ...defaultConfig(), ...parsed };
    cached = merged;
    return merged;
  } catch {
    const def = defaultConfig();
    saveConfig(def);
    cached = def;
    return def;
  }
}

export function saveConfig(c: BuddyConfig): void {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(c, null, 2), "utf8");
  cached = c;
}

export function patchConfig(patch: Partial<BuddyConfig>): BuddyConfig {
  const current = loadConfig();
  const next = { ...current, ...patch };
  saveConfig(next);
  return next;
}

export function telemetryUrlForLocalhost(): string {
  const cfg = loadConfig();
  return `http://127.0.0.1:${cfg.listenPort}/events/cmd`;
}

export function removeContextByName(name: string): boolean {
  const cfg = loadConfig();
  const ctxs = cfg.contexts ?? [];
  const next = ctxs.filter((c) => c.name !== name);
  if (next.length === ctxs.length) return false;
  saveConfig({ ...cfg, contexts: next });
  return true;
}

export function rotateTelemetryToken(): string {
  const cfg = loadConfig();
  const token = randomBytes(32).toString("hex");
  saveConfig({ ...cfg, telemetryToken: token });
  return token;
}
