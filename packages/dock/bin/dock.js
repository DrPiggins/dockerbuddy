#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import path from "node:path";
import { existsSync, statSync } from "node:fs";
import {
  docker,
  parseJsonLines,
  findComposeFile,
  summarizeInspect,
  spawnCollect,
  pipeHostTarToContainer,
  pipeContainerTarToHost,
} from "../src/docker.js";
import { instrument } from "../src/telemetry.js";

const server = new McpServer(
  { name: "dock", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

// Wrap server.registerTool to fire-and-forget a CommandEvent at the local
// DockerBuddy installer's telemetry listener for every tool invocation.
// Must run before any registerTool() call below.
instrument(server);

function text(s) {
  return { content: [{ type: "text", text: s }] };
}
function json(obj) {
  return text(JSON.stringify(obj, null, 2));
}
function errText(s) {
  return { content: [{ type: "text", text: s }], isError: true };
}

function composeErr(r) {
  const s = `${r.stderr || ""}\n${r.stdout || ""}`;
  if (
    /unknown command:\s*docker compose/i.test(s) ||
    /'compose' is not a docker command/i.test(s) ||
    /^unknown flag: --format/m.test(s)
  ) {
    return errText(
      "Docker Compose plugin is not installed on the local client. " +
        "Install Docker Desktop, or the docker-compose-plugin package " +
        "(`brew install docker-compose` on macOS; " +
        "`apt install docker-compose-plugin` on Debian/Ubuntu). " +
        "Note: `docker compose` runs client-side, so a `--context` to a remote daemon does not help.",
    );
  }
  return errText(r.stderr || r.stdout);
}

const ctxField = z
  .string()
  .optional()
  .describe(
    "Docker context name (e.g. 'homelab'). Omit for the local default context. List available with the `contexts` tool.",
  );

// ---------- contexts ----------

server.registerTool(
  "contexts",
  {
    description:
      "List available Docker contexts and which one is current. Contexts let dock target remote Docker daemons (e.g. a home lab over SSH).",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  async () => {
    const r = await docker(["context", "ls", "--format", "{{json .}}"]);
    if (!r.ok) return errText(r.stderr);
    return json(parseJsonLines(r.stdout));
  },
);

// ---------- read-only ----------

server.registerTool(
  "ps",
  {
    description:
      "List Docker containers as structured JSON. Includes stopped containers by default. Way more useful than parsing `docker ps` text output.",
    inputSchema: {
      all: z
        .boolean()
        .optional()
        .describe("Include stopped containers (default: true)"),
      filter: z
        .string()
        .optional()
        .describe(
          'Docker filter expression, e.g. "status=running" or "label=app=api"',
        ),
      context: ctxField,
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  async ({ all = true, filter, context }) => {
    const args = ["ps", "--format", "{{json .}}", "--no-trunc"];
    if (all) args.push("-a");
    if (filter) args.push("--filter", filter);
    const r = await docker(args, { context });
    if (!r.ok) return errText(r.stderr);
    return json(parseJsonLines(r.stdout));
  },
);

server.registerTool(
  "logs",
  {
    description:
      "Tail container logs with built-in tail + grep + since filtering. Avoids round-tripping huge log dumps.",
    inputSchema: {
      container: z.string().describe("Container name or ID"),
      tail: z.number().int().positive().optional().describe("Lines from end (default 200)"),
      since: z
        .string()
        .optional()
        .describe('Relative or absolute, e.g. "10m", "1h", "2026-01-01"'),
      grep: z
        .string()
        .optional()
        .describe("Case-insensitive substring filter applied to each line"),
      context: ctxField,
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  async ({ container, tail = 200, since, grep, context }) => {
    const args = ["logs", "--tail", String(tail)];
    if (since) args.push("--since", since);
    args.push(container);
    const r = await docker(args, { context });
    const combined = r.stdout + r.stderr;
    if (!combined && !r.ok) return errText(r.stderr || "no output");
    let lines = combined.split("\n");
    if (grep) {
      const needle = grep.toLowerCase();
      lines = lines.filter((l) => l.toLowerCase().includes(needle));
    }
    return text(lines.join("\n") || "(empty)");
  },
);

server.registerTool(
  "stats",
  {
    description:
      "Single snapshot of CPU / memory / net / block I/O for every running container. Returns structured JSON, no streaming.",
    inputSchema: { context: ctxField },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  async ({ context }) => {
    const r = await docker(
      ["stats", "--no-stream", "--format", "{{json .}}"],
      { context },
    );
    if (!r.ok) return errText(r.stderr);
    return json(parseJsonLines(r.stdout));
  },
);

server.registerTool(
  "inspect",
  {
    description:
      "Inspect a container, returning only the ~20 fields that actually matter (state, image, ports, mounts, env, restart policy). Skips the 800-line raw blob.",
    inputSchema: {
      container: z.string().describe("Container name or ID"),
      full: z
        .boolean()
        .optional()
        .describe("Return full unsummarized inspect output"),
      context: ctxField,
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  async ({ container, full = false, context }) => {
    const r = await docker(["inspect", container], { context });
    if (!r.ok) return errText(r.stderr);
    const parsed = JSON.parse(r.stdout);
    const raw = parsed[0];
    if (!raw) return errText("not found");
    return json(full ? raw : summarizeInspect(raw));
  },
);

server.registerTool(
  "images",
  {
    description: "List local Docker images with size, tags, and dangling flag.",
    inputSchema: {
      dangling: z
        .boolean()
        .optional()
        .describe("Only show dangling images"),
      context: ctxField,
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  async ({ dangling, context }) => {
    const args = ["images", "--format", "{{json .}}"];
    if (dangling) args.push("--filter", "dangling=true");
    const r = await docker(args, { context });
    if (!r.ok) return errText(r.stderr);
    return json(parseJsonLines(r.stdout));
  },
);

server.registerTool(
  "system_df",
  {
    description:
      "Disk usage breakdown: images, containers, volumes, build cache. Shows reclaimable bytes.",
    inputSchema: { context: ctxField },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  async ({ context }) => {
    const r = await docker(["system", "df", "--format", "{{json .}}"], {
      context,
    });
    if (!r.ok) return errText(r.stderr);
    return json(parseJsonLines(r.stdout));
  },
);

server.registerTool(
  "compose_ls",
  {
    description:
      "List all running Docker Compose projects on a daemon. Perfect for remote contexts (home lab): see every compose stack without needing the YAML files locally.",
    inputSchema: {
      all: z.boolean().optional().describe("Include stopped projects"),
      context: ctxField,
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  async ({ all, context }) => {
    const r = await docker(
      [
        "ps",
        "-a",
        "--filter",
        "label=com.docker.compose.project",
        "--format",
        '{{.State}}\t{{.Label "com.docker.compose.project"}}\t{{.Label "com.docker.compose.project.config_files"}}',
      ],
      { context },
    );
    if (!r.ok) return errText(r.stderr);
    const projects = new Map();
    for (const line of r.stdout.split("\n")) {
      if (!line.trim()) continue;
      const [state, name, configFiles] = line.split("\t");
      if (!name) continue;
      const p = projects.get(name) ?? {
        Name: name,
        ConfigFiles: configFiles || "",
        states: {},
      };
      p.states[state] = (p.states[state] ?? 0) + 1;
      projects.set(name, p);
    }
    const out = [...projects.values()]
      .filter((p) => all || p.states.running)
      .map((p) => ({
        Name: p.Name,
        Status: Object.entries(p.states)
          .map(([s, n]) => `${s}(${n})`)
          .join(", "),
        ConfigFiles: p.ConfigFiles,
      }));
    return json(out);
  },
);

server.registerTool(
  "compose_ps",
  {
    description:
      "List services for a compose project. Either auto-discovers compose.yaml in `cwd`, or targets a named running project via `project` (useful for remote contexts).",
    inputSchema: {
      cwd: z
        .string()
        .optional()
        .describe("Project directory (default: current working dir)"),
      project: z
        .string()
        .optional()
        .describe(
          "Compose project name. Use this for remote daemons where the YAML isn't local. Get names from `compose_ls`.",
        ),
      context: ctxField,
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  async ({ cwd = process.cwd(), project, context }) => {
    const baseArgs = ["compose"];
    let composeFile = null;
    if (project) {
      baseArgs.push("-p", project);
    } else {
      composeFile = findComposeFile(cwd);
      if (!composeFile)
        return errText(
          `No compose file in ${cwd}. Pass \`project\` for remote daemons.`,
        );
    }
    baseArgs.push("ps", "-a", "--format", "{{json .}}");
    const r = await docker(baseArgs, { cwd: project ? undefined : cwd, context });
    if (!r.ok) return composeErr(r);
    return json({
      project: project ?? null,
      composeFile,
      services: parseJsonLines(r.stdout),
    });
  },
);

server.registerTool(
  "compose_logs",
  {
    description:
      "Interleaved logs from one or more compose services with service-name prefixes. Pass `project` for remote daemons, or omit for auto-discovery in `cwd`.",
    inputSchema: {
      services: z
        .array(z.string())
        .optional()
        .describe("Service names. Empty = all."),
      tail: z.number().int().positive().optional(),
      since: z.string().optional(),
      grep: z.string().optional(),
      cwd: z.string().optional(),
      project: z
        .string()
        .optional()
        .describe("Compose project name (alternative to local file). Use for remote contexts."),
      context: ctxField,
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  async ({
    services = [],
    tail = 200,
    since,
    grep,
    cwd = process.cwd(),
    project,
    context,
  }) => {
    const args = ["compose"];
    if (project) {
      args.push("-p", project);
    } else {
      const file = findComposeFile(cwd);
      if (!file)
        return errText(
          `No compose file in ${cwd}. Pass \`project\` for remote daemons.`,
        );
    }
    args.push("logs", "--no-color", "--tail", String(tail));
    if (since) args.push("--since", since);
    args.push(...services);
    const r = await docker(args, {
      cwd: project ? undefined : cwd,
      context,
    });
    if (!r.ok) return composeErr(r);
    let combined = r.stdout + r.stderr;
    if (grep) {
      const needle = grep.toLowerCase();
      combined = combined
        .split("\n")
        .filter((l) => l.toLowerCase().includes(needle))
        .join("\n");
    }
    return text(combined || "(empty)");
  },
);

// ---------- destructive ----------

server.registerTool(
  "lifecycle",
  {
    description:
      "Start / stop / restart / remove a container. Destructive — Claude Code will gate this with the user.",
    inputSchema: {
      action: z.enum(["start", "stop", "restart", "remove", "kill"]),
      container: z.string(),
      force: z.boolean().optional().describe("Force removal of running container"),
      context: ctxField,
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
  },
  async ({ action, container, force, context }) => {
    const verb = action === "remove" ? "rm" : action;
    const args = [verb];
    if (action === "remove" && force) args.push("-f");
    args.push(container);
    const r = await docker(args, { context });
    if (!r.ok) return errText(r.stderr || r.stdout);
    return text(r.stdout.trim() || `${action} ok`);
  },
);

server.registerTool(
  "exec",
  {
    description:
      "Run a command inside a running container. Returns combined stdout+stderr. Destructive: arbitrary command execution.",
    inputSchema: {
      container: z.string(),
      command: z
        .array(z.string())
        .describe('argv form, e.g. ["sh", "-lc", "ls /app"]'),
      workdir: z.string().optional(),
      user: z.string().optional(),
      context: ctxField,
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
  },
  async ({ container, command, workdir, user, context }) => {
    const args = ["exec"];
    if (workdir) args.push("-w", workdir);
    if (user) args.push("-u", user);
    args.push(container, ...command);
    const r = await docker(args, { context });
    if (!r.ok) return errText(r.stderr || r.stdout);
    return text(r.stdout + (r.stderr ? `\n[stderr]\n${r.stderr}` : ""));
  },
);

server.registerTool(
  "prune",
  {
    description:
      "Reclaim disk by removing unused containers / images / volumes / networks. Destructive and irreversible.",
    inputSchema: {
      target: z.enum(["containers", "images", "volumes", "networks", "all"]),
      includeUntagged: z
        .boolean()
        .optional()
        .describe("For images target: also remove all unused (-a)"),
      context: ctxField,
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
  },
  async ({ target, includeUntagged, context }) => {
    let args;
    if (target === "all") {
      args = ["system", "prune", "-f"];
      if (includeUntagged) args.push("-a");
    } else {
      const noun = target.slice(0, -1);
      args = [noun, "prune", "-f"];
      if (target === "images" && includeUntagged) args.push("-a");
    }
    const r = await docker(args, { context });
    if (!r.ok) return errText(r.stderr || r.stdout);
    return text(r.stdout.trim() || "pruned");
  },
);

server.registerTool(
  "compose_action",
  {
    description:
      "Bring compose services up, down, or restart. Auto-discovers compose file in cwd. Destructive (changes running state).",
    inputSchema: {
      action: z.enum(["up", "down", "restart", "build"]),
      services: z.array(z.string()).optional(),
      detach: z.boolean().optional().describe("Default true for up"),
      removeOrphans: z.boolean().optional(),
      cwd: z.string().optional(),
      project: z
        .string()
        .optional()
        .describe(
          "Compose project name (alternative to local file). Use for remote daemons.",
        ),
      context: ctxField,
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
  },
  async ({
    action,
    services = [],
    detach,
    removeOrphans,
    cwd = process.cwd(),
    project,
    context,
  }) => {
    const args = ["compose"];
    if (project) {
      args.push("-p", project);
    } else {
      const file = findComposeFile(cwd);
      if (!file)
        return errText(
          `No compose file in ${cwd}. Pass \`project\` for remote daemons.`,
        );
    }
    args.push(action);
    if (action === "up") {
      if (detach !== false) args.push("-d");
    }
    if (removeOrphans) args.push("--remove-orphans");
    args.push(...services);
    const r = await docker(args, {
      cwd: project ? undefined : cwd,
      context,
    });
    if (!r.ok) return composeErr(r);
    return text(
      (r.stdout + (r.stderr ? `\n${r.stderr}` : "")).trim() || `${action} ok`,
    );
  },
);

import { createHash } from "node:crypto";

// Cache layout under <cacheRoot>:
//   <hash>/meta.json   — { hostPath, lastUsedMs, byteSize }
//   <hash>/work/       — staged project copy
// Across runs, top-level entries in work/ whose names are in `preserveBetweenRuns`
// (node_modules, .next, target, etc.) are kept so incremental builds are fast.
// Everything else is wiped before each sync so deletions on the host propagate.
const DEFAULT_CACHE_ROOT = "/workspace/.cache/dock";
const DEFAULT_HIGH_WATERMARK = 20 * 1024 ** 3; // 20 GiB
const DEFAULT_LOW_WATERMARK = 16 * 1024 ** 3; // 16 GiB
const DEFAULT_EXCLUDE = [
  "node_modules",
  ".next",
  ".git",
  ".vercel",
  "dist",
  "build",
  ".turbo",
  ".cache",
  "target",
  "vendor",
  ".DS_Store",
];
const DEFAULT_PRESERVE = [
  "node_modules",
  ".next",
  ".turbo",
  ".cache",
  "target",
  "vendor",
  "dist",
  "build",
];

function hashPath(p) {
  return createHash("sha256").update(p).digest("hex").slice(0, 16);
}

// Shell-escape a single argument by single-quoting (POSIX).
function shq(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

server.registerTool(
  "run_cached",
  {
    description:
      "Sync a host directory into a per-project cache slot inside a container, run a command in it, optionally tar specified outputs back to the host, then evict old slots if the cache exceeds its size limit. " +
      "Designed for offloading heavy `next build` / `cargo build` / test suites onto a remote dev-runner. " +
      "First call for a project pays the full sync cost; subsequent calls reuse the cached `node_modules`, `.next`, etc. (configurable via `preserveBetweenRuns`) and only re-ship the source. " +
      "Cache eviction is LRU on `lastUsedMs`: when total cache size crosses the high watermark, oldest slots are deleted until it falls under the low watermark. " +
      "No SSH, rsync, sshd, NFS, or bind-mount required — only `docker exec` and a host-side `tar`. " +
      "Returned stdout/stderr is tail-capped at 1 MB each; for huge build logs use returnPaths to bring back a log file.",
    inputSchema: {
      container: z.string().describe("Name or ID of a running container to stage into."),
      hostPath: z
        .string()
        .describe(
          "Absolute path on this host to send. The directory contents (not the dir itself) are extracted into the slot's work/ dir on the container.",
        ),
      command: z
        .array(z.string())
        .describe(
          'argv to run inside the staged work/ dir. Example: ["sh", "-lc", "npm ci && npm run build"]',
        ),
      exclude: z
        .array(z.string())
        .optional()
        .describe(
          `tar --exclude patterns for the host-to-container sync. Defaults to ${DEFAULT_EXCLUDE.join(", ")}. Pass [] to send everything from the host (rare — node_modules in particular should almost always be excluded and rebuilt in-container).`,
        ),
      preserveBetweenRuns: z
        .array(z.string())
        .optional()
        .describe(
          `Top-level names in work/ that survive the pre-sync wipe between runs (incremental build artifacts). Defaults to ${DEFAULT_PRESERVE.join(", ")}. Anything not in this list is rm -rf'd before the host source is freshly tar'd in.`,
        ),
      returnPaths: z
        .array(z.string())
        .optional()
        .describe(
          "Paths inside the staged work/ dir to copy back to hostPath after the command finishes (e.g. ['dist', 'coverage', 'build.log']). Each is `tar -c`'d on the container and `tar -x`'d into hostPath, overwriting local copies.",
        ),
      cacheRoot: z
        .string()
        .optional()
        .describe(
          `Absolute path in the container holding all cache slots. Default ${DEFAULT_CACHE_ROOT}.`,
        ),
      cacheHighWatermarkBytes: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          `Trigger LRU eviction once total cache size exceeds this. Default ${DEFAULT_HIGH_WATERMARK} (20 GiB).`,
        ),
      cacheLowWatermarkBytes: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          `When evicting, delete oldest slots until total cache size falls below this. Default ${DEFAULT_LOW_WATERMARK} (16 GiB). Must be ≤ high watermark.`,
        ),
      timeoutMs: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "Hard wall-clock cap on the in-container command (sync/eviction excluded). Default 600000 (10 min).",
        ),
      context: ctxField,
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
  },
  async ({
    container,
    hostPath,
    command,
    exclude,
    preserveBetweenRuns,
    returnPaths = [],
    cacheRoot,
    cacheHighWatermarkBytes,
    cacheLowWatermarkBytes,
    timeoutMs = 600_000,
    context,
  }) => {
    if (!path.isAbsolute(hostPath)) {
      return errText(`hostPath must be absolute, got: ${hostPath}`);
    }
    if (!existsSync(hostPath) || !statSync(hostPath).isDirectory()) {
      return errText(
        `hostPath does not exist or is not a directory: ${hostPath}`,
      );
    }
    if (!command || command.length === 0) {
      return errText("command is required and must be non-empty");
    }

    const excludes = exclude ?? DEFAULT_EXCLUDE;
    const preserve = preserveBetweenRuns ?? DEFAULT_PRESERVE;
    const root = cacheRoot || DEFAULT_CACHE_ROOT;
    const high = cacheHighWatermarkBytes || DEFAULT_HIGH_WATERMARK;
    const low = cacheLowWatermarkBytes || DEFAULT_LOW_WATERMARK;
    if (low > high) {
      return errText(
        `cacheLowWatermarkBytes (${low}) must be ≤ cacheHighWatermarkBytes (${high})`,
      );
    }

    const slot = hashPath(hostPath);
    const slotDir = `${root}/${slot}`;
    const workDir = `${slotDir}/work`;
    const metaPath = `${slotDir}/meta.json`;

    // 1. ensure slot exists
    const mk = await docker(
      ["exec", container, "mkdir", "-p", workDir],
      { context },
    );
    if (!mk.ok) {
      return errText(`mkdir on container failed: ${mk.stderr || mk.stdout}`);
    }

    // 2. wipe work/ contents except preserveBetweenRuns top-level names so
    //    deletions on the host propagate while build artifacts survive.
    const preserveTests = preserve
      .map((n) => `! -name ${shq(n)}`)
      .join(" ");
    const wipeCmd = `find ${shq(workDir)} -mindepth 1 -maxdepth 1 ${preserveTests} -exec rm -rf {} +`;
    const wipe = await docker(
      ["exec", container, "sh", "-lc", wipeCmd],
      { context },
    );
    if (!wipe.ok) {
      return errText(`pre-sync wipe failed: ${wipe.stderr || wipe.stdout}`);
    }

    // 3. host tar | docker exec -i tar -x
    const sync = await pipeHostTarToContainer({
      hostPath,
      exclude: excludes,
      container,
      context,
      remotePath: workDir,
    });
    if (!sync.ok) {
      return errText(
        `sync failed (host-tar exit ${sync.tarExit}, docker-exec exit ${sync.dockExit}). ` +
          `host-tar stderr: ${sync.tarStderr.trim() || "(empty)"}; ` +
          `docker stderr: ${sync.dockStderr.trim() || "(empty)"}`,
      );
    }

    // 4. write meta with current lastUsedMs (byteSize filled in after run)
    const lastUsedMs = Date.now();
    const writeMetaCmd =
      `cat > ${shq(metaPath)} <<'EOF'\n` +
      JSON.stringify({ hostPath, lastUsedMs, byteSize: 0 }) +
      `\nEOF`;
    await docker(
      ["exec", container, "sh", "-lc", writeMetaCmd],
      { context },
    );

    // 5. run the command in work/
    const runArgs = [];
    if (context) runArgs.push("--context", context);
    runArgs.push("exec", "-w", workDir, container, ...command);
    const run = await spawnCollect("docker", runArgs, { timeoutMs });

    // 6. return paths (best-effort)
    const returned = [];
    for (const p of returnPaths) {
      const back = await pipeContainerTarToHost({
        container,
        context,
        remotePath: workDir,
        sourcePath: p,
        hostPath,
      });
      returned.push(
        back.ok
          ? { path: p, ok: true }
          : {
              path: p,
              ok: false,
              error:
                back.dockStderr.trim() ||
                back.tarStderr.trim() ||
                "unknown tar failure",
            },
      );
    }

    // 7. measure this slot's size and persist into meta
    const sizeRes = await docker(
      ["exec", container, "sh", "-lc", `du -sb ${shq(slotDir)} | awk '{print $1}'`],
      { context },
    );
    const slotBytes = parseInt(sizeRes.stdout.trim(), 10) || 0;
    const finalMeta = JSON.stringify({
      hostPath,
      lastUsedMs,
      byteSize: slotBytes,
    });
    const finalMetaCmd = `cat > ${shq(metaPath)} <<'EOF'\n${finalMeta}\nEOF`;
    await docker(["exec", container, "sh", "-lc", finalMetaCmd], { context });

    // 8. LRU eviction if over high watermark
    const evictions = [];
    let totalBefore = 0;
    let totalAfter = 0;
    {
      const totRes = await docker(
        [
          "exec",
          container,
          "sh",
          "-lc",
          `du -sb ${shq(root)} 2>/dev/null | awk '{print $1}'`,
        ],
        { context },
      );
      totalBefore = parseInt(totRes.stdout.trim(), 10) || 0;
      totalAfter = totalBefore;
      if (totalBefore > high) {
        // Collect every slot's meta to pick LRU order.
        const listCmd =
          `for f in ${shq(root)}/*/meta.json; do ` +
          `  [ -f "$f" ] && cat "$f" && echo; ` +
          `done`;
        const listRes = await docker(
          ["exec", container, "sh", "-lc", listCmd],
          { context },
        );
        const entries = listRes.stdout
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => {
            try {
              return JSON.parse(l);
            } catch {
              return null;
            }
          })
          .filter(
            (e) => e && typeof e.lastUsedMs === "number" && e.hostPath,
          );
        // Don't evict the slot we just used.
        entries.sort((a, b) => a.lastUsedMs - b.lastUsedMs);
        let running = totalBefore;
        for (const e of entries) {
          if (running <= low) break;
          if (e.hostPath === hostPath) continue;
          const evictSlot = hashPath(e.hostPath);
          const evictDir = `${root}/${evictSlot}`;
          const rm = await docker(
            ["exec", container, "rm", "-rf", evictDir],
            { context },
          );
          if (rm.ok) {
            running -= e.byteSize || 0;
            evictions.push({
              hostPath: e.hostPath,
              freedBytes: e.byteSize || 0,
              lastUsedMs: e.lastUsedMs,
            });
          }
        }
        totalAfter = running;
      }
    }

    const TAIL = 1024 * 1024;
    const stdoutStr = run.stdout.toString("utf8");
    const stderrStr = run.stderr.toString("utf8");

    return json({
      slot,
      slotDir,
      workDir,
      command,
      exitCode: run.code,
      signal: run.signal,
      ok: run.code === 0,
      durationMs: run.durationMs,
      timedOut:
        run.signal === "SIGKILL" && run.durationMs >= timeoutMs - 500,
      stdout: stdoutStr.length > TAIL ? stdoutStr.slice(-TAIL) : stdoutStr,
      stderr: stderrStr.length > TAIL ? stderrStr.slice(-TAIL) : stderrStr,
      stdoutTruncated: stdoutStr.length > TAIL,
      stderrTruncated: stderrStr.length > TAIL,
      returned,
      cache: {
        slotBytes,
        totalBytesBefore: totalBefore,
        totalBytesAfter: totalAfter,
        highWatermarkBytes: high,
        lowWatermarkBytes: low,
        evictions,
      },
    });
  },
);

server.registerTool(
  "cache_list",
  {
    description:
      "List every cache slot under run_cached's cache root with hostPath, last-used timestamp, and current byte size. Useful for seeing what's currently cached and what eviction would hit next.",
    inputSchema: {
      container: z.string(),
      cacheRoot: z.string().optional(),
      context: ctxField,
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  async ({ container, cacheRoot, context }) => {
    const root = cacheRoot || DEFAULT_CACHE_ROOT;
    const listCmd =
      `for d in ${shq(root)}/*/; do ` +
      `  m="$d/meta.json"; ` +
      `  [ -f "$m" ] || continue; ` +
      `  size=$(du -sb "$d" 2>/dev/null | awk '{print $1}'); ` +
      `  meta=$(cat "$m"); ` +
      `  echo "{\\"liveSizeBytes\\":$size,\\"meta\\":$meta}"; ` +
      `done`;
    const r = await docker(
      ["exec", container, "sh", "-lc", listCmd],
      { context },
    );
    if (!r.ok && !r.stdout) return errText(r.stderr || "no output");
    const entries = r.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    const totalBytes = entries.reduce(
      (sum, e) => sum + (e.liveSizeBytes || 0),
      0,
    );
    return json({
      cacheRoot: root,
      totalBytes,
      entries: entries
        .sort((a, b) => (a.meta?.lastUsedMs || 0) - (b.meta?.lastUsedMs || 0))
        .map((e) => ({
          hostPath: e.meta?.hostPath,
          lastUsedMs: e.meta?.lastUsedMs,
          recordedSizeBytes: e.meta?.byteSize,
          liveSizeBytes: e.liveSizeBytes,
        })),
    });
  },
);

server.registerTool(
  "cache_clear",
  {
    description:
      "Delete cache slots under run_cached's cache root. By default deletes every slot; pass `hostPath` to delete just one project's slot. Destructive.",
    inputSchema: {
      container: z.string(),
      hostPath: z.string().optional().describe("If set, only delete this project's slot."),
      cacheRoot: z.string().optional(),
      context: ctxField,
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
  },
  async ({ container, hostPath, cacheRoot, context }) => {
    const root = cacheRoot || DEFAULT_CACHE_ROOT;
    if (hostPath) {
      const slot = hashPath(hostPath);
      const r = await docker(
        ["exec", container, "rm", "-rf", `${root}/${slot}`],
        { context },
      );
      if (!r.ok) return errText(r.stderr || r.stdout);
      return json({ cleared: hostPath, slot });
    }
    const r = await docker(
      ["exec", container, "sh", "-lc", `rm -rf ${shq(root)}/*`],
      { context },
    );
    if (!r.ok) return errText(r.stderr || r.stdout);
    return json({ cleared: "all", cacheRoot: root });
  },
);

// ---------- start ----------

const transport = new StdioServerTransport();
await server.connect(transport);
