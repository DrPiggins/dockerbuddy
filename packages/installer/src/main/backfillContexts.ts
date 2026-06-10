import path from "node:path";
import os from "node:os";
import { existsSync, readFileSync } from "node:fs";
import { run, which } from "./exec.js";
import { loadConfig, patchConfig } from "./config.js";

const SSH_CONFIG = path.join(os.homedir(), ".ssh", "config");

interface ParsedHost {
  host: string;
  hostName?: string;
  user?: string;
}

function parseSshConfig(): ParsedHost[] {
  if (!existsSync(SSH_CONFIG)) return [];
  const lines = readFileSync(SSH_CONFIG, "utf8").split("\n");
  const hosts: ParsedHost[] = [];
  let current: ParsedHost | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(\S+)\s+(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].replace(/^"(.*)"$/, "$1").trim();
    if (key === "host") {
      if (current) hosts.push(current);
      current = { host: val };
    } else if (current) {
      if (key === "hostname") current.hostName = val;
      else if (key === "user") current.user = val;
    }
  }
  if (current) hosts.push(current);
  return hosts;
}

export async function backfillContextsOnce(): Promise<void> {
  const cfg = loadConfig();
  if ((cfg.contexts ?? []).length > 0) return;

  const dockerPath = await which("docker");
  if (!dockerPath) return;

  const ls = await run(dockerPath, ["context", "ls", "--format", "{{json .}}"]);
  if (!ls.ok) return;

  const sshHosts = parseSshConfig();
  const added: NonNullable<typeof cfg.contexts> = [];

  for (const line of ls.stdout.split("\n")) {
    if (!line.trim()) continue;
    let row: any;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const name = row.Name as string;
    const endpoint = row.DockerEndpoint as string;
    if (!name || name === "default" || !endpoint?.startsWith("ssh://")) continue;
    const aliasOrHost = endpoint.replace(/^ssh:\/\//, "").replace(/\/$/, "");
    const m = aliasOrHost.match(/^(?:([^@]+)@)?([^:]+)/);
    if (!m) continue;
    const userFromUrl = m[1];
    const hostFromUrl = m[2];
    const ssh = sshHosts.find((h) => h.host === hostFromUrl);
    const ip = ssh?.hostName ?? hostFromUrl;
    const username = ssh?.user ?? userFromUrl;
    if (!ip || !username) continue;
    added.push({
      name,
      ip,
      username,
      createdAt: new Date().toISOString(),
    });
  }

  if (added.length > 0) patchConfig({ contexts: added });
}
