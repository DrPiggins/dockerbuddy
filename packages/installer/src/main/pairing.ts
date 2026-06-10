import path from "node:path";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { app } from "electron";

export interface PairedConfig {
  role: "remote";
  contextName: string;
  mac: {
    host: string;
    ip: string;
    telemetryPort: number;
    telemetryToken: string;
  };
  pairedAt: string;
}

export function pairedConfigPath(): string {
  return path.join(app.getPath("userData"), "paired.json");
}

export function loadPaired(): PairedConfig | null {
  const p = pairedConfigPath();
  if (!existsSync(p)) return null;
  try {
    const raw = readFileSync(p, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && parsed.role === "remote" && parsed.mac?.ip) {
      return parsed as PairedConfig;
    }
    return null;
  } catch {
    return null;
  }
}

export function unpair(): boolean {
  const p = pairedConfigPath();
  if (!existsSync(p)) return false;
  try {
    unlinkSync(p);
    return true;
  } catch {
    return false;
  }
}
