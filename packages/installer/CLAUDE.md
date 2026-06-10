# DockerBuddy — Claude Code orientation

You're working in DockerBuddy, an Electron + React desktop app that wraps the [`dock`](https://github.com/parkerlabonte/dock) MCP server (Docker tools for Claude Code) and adds a guided setup wizard, remote-host onboarding, and a live dashboard.

Read this whole file before you change anything. The architecture has a few non-obvious shapes that will bite you if you skip it.

## What this app actually is

**One binary, two roles.** The same DockerBuddy build runs on both the controller (the Mac that runs Claude Code) and any remote host being controlled. Role is determined at runtime by whether `paired.json` exists in `userData`:

- **No `paired.json`** → controller mode. Wizard offers local setup + remote host enrollment. Dashboard shows local Docker + any remote contexts the user added.
- **`paired.json` present** → remote mode. The app runs as a telemetry/control surface for an upstream controller. Dashboard mirrors the controller's Command flow + Frequency via HTTP polling.

> Never use the word "companion" in code, copy, or commits. It's not a separate companion app. It's one app that flips role.

## Tech stack

- Electron 42, Vite 8, `vite-plugin-electron` (auto-restarts main process on save).
- React 18 + TypeScript + Tailwind v4 (`@tailwindcss/vite`).
- `systeminformation` for local metrics. Be careful: several methods are **Mac/Linux only** (`disksIO()`, `fsStats()`). Windows paths use PowerShell `Get-Counter` instead. See `src/main/hostMetrics.ts`.
- **The controller is not always a Mac.** DockerBuddy ships for macOS, Windows, and Linux. Anywhere you'd reach for `process.env.HOME` or a hardcoded `~/Library/...` path, use `os.homedir()` or `app.getPath("userData")` instead. Anywhere you'd auto-install with `brew`, gate on `process.platform === "darwin"`. `exec.ts` already handles PATH and binary resolution cross-platform; use `which()` from there, don't reimplement.
- Remote host metrics over SSH using `docker context` (Mac-side) or `Get-Counter -EncodedCommand` (Windows-side).

## Repo layout

```
src/
  main/                Electron main process
    main.ts            IPC registration + lifecycle
    config.ts          BuddyConfig in userData (token, listenPort, contexts[])
    pairing.ts         loadPaired() — single source of truth for "am I remote?"
    install.ts         dock MCP install + Claude Code registration
    prereqs.ts         Docker / node / Claude Code detection
    remote.ts          SSH key gen, remote host test, `docker context create`
    installerBuilder.ts Generates the one-shot Windows .ps1 enrollment script
    serverConfig.ts    SSH port management
    dockerWatcher.ts   `docker stats|events|info` against the active context
    hostMetrics.ts     Local CPU/mem/disk/net/uptime (Mac + Windows branches)
    remoteMetrics.ts   Same, but over SSH to each configured context
    telemetryServer.ts HTTP :47761, token-auth, POST /events/cmd + GET /events/recent
    pairedTelemetryPoller.ts  Remote-mode poller that mirrors the controller's events
    backfillContexts.ts One-time migration for older configs
  renderer/
    App.tsx              Top-level routing: Setup vs Dashboard
    views/
      Dashboard.tsx      Composed of HostTiles + RemoteTiles + DockerSummary + ContainerList + CommandLog + FrequencyGraph
      (Setup steps live in steps/)
    dashboard/           Tiles, charts, log row components
    components/          Generic UI primitives
  shared.ts            Types shared between main and renderer (HostMetrics, RemoteHostMetrics, CommandEvent, DockerInfoSnapshot, etc.)
  preload/preload.ts   Bridge — exposes window.api with subscribe/invoke helpers
```

## How the telemetry pipeline works

Three sources feed `CommandEvent[]` into the renderer:

1. **Local `dock` MCP** on the controller posts events to `http://127.0.0.1:47761/events/cmd` with header `X-DockerBuddy-Token`. They land in a 200-entry ring buffer (`telemetryServer.ts`) and are broadcast on IPC `telemetry:cmd`.
2. **Remote `dock` instances** (paired hosts) POST to the controller's `:47761` over the LAN using the same token.
3. **Remote-mode DockerBuddy** (the role-flipped app on a paired host) does *not* receive POSTs. Instead, `pairedTelemetryPoller.ts` GETs `/events/recent` from the controller every 2s and dedupes by `${timestamp}|${tool}|${durationMs}|${ok}`. This is how Command flow + Frequency mirror across both apps.

Token comes from `cfg.telemetryToken` in `~/Library/Application Support/dockerbuddy/config.json` (macOS) or the equivalent on Windows.

## Dev workflow

```bash
npm install
npm run dev        # vite + electron, auto-restart on main/renderer changes
npm run typecheck  # tsc --noEmit
npm run dist:mac   # build a signed .dmg
npm run dist:win   # build NSIS installer for the role-flipped Windows variant
```

When you edit anything in `src/main/`, vite-plugin-electron rebuilds and re-spawns the main process automatically. **Don't `pkill electron` between edits** unless you actually need a hard reset. If multiple Electron processes pile up, kill all of them and restart `npm run dev`.

## Gotchas we've already paid for

These are *load-bearing*. If you don't see them documented in code, that's because they were learned the hard way. Don't unwind them.

### Watcher must target the user's context, not the default

`dockerWatcher.ts` injects `--context <name>` from `cfg.contexts[0]` for every `docker stats|events|info` call. Without it, a Mac with no local Docker Desktop shows the dashboard as "Docker offline" even when a remote context is reachable. The first configured context wins until per-remote watching exists.

### `docker stats` is a silent stream

`docker stats` only emits when containers exist. When the last container is removed, the stream goes quiet *but does not emit an empty frame*. The 5s `pollDockerInfo` loop publishes an empty `docker:stats` snapshot when `ContainersRunning === 0` to clear stale cards.

### Windows `systeminformation` gaps

- `si.disksIO()` returns nothing on Windows.
- `si.fsStats()` returns nothing on Windows.
- Use PowerShell `Get-Counter` instead. The Windows branch in `hostMetrics.ts` caches probes (`lastWinDisk`, `winDiskInFlight`) because Get-Counter is slow (~600ms).
- Counter paths used: `\PhysicalDisk(_Total)\% Disk Time`, `\PhysicalDisk(_Total)\Disk Transfers/sec`, `\Network Interface(*)\Bytes Received/sec`, `\Network Interface(*)\Bytes Sent/sec` (excluding `Loopback`, `isatap`).
- For SSH-safe execution, encode the PowerShell with `-EncodedCommand` (base64 UTF-16LE). See `remoteMetrics.ts`.

### macOS `date` does not support `%N`

Subsecond format specifiers (`%3N`, `%N`) on macOS BSD `date` silently produce the literal string. If you generate ISO timestamps from bash, use `node -e 'console.log(new Date().toISOString())'` or `python3 -c 'import datetime; ...'` instead. A single malformed timestamp will NaN-out the FrequencyGraph bucket index. The renderer now guards with `Number.isFinite(t)` and `telemetryServer.ts` rejects unparseable timestamps at ingress, but don't rely on those backstops — write valid timestamps.

### `docker stats` ANSI codes

`docker stats --format '{{json .}}'` still prints `\x1b[2J` clear-screen sequences. The stats reader strips them via regex before JSON.parse. Don't remove that strip.

### Header dock summary placement

When zero remotes are configured, `<DockerSummary>` renders globally above the grid. When one or more remotes exist, the dock summary is *attached to the first remote's tile row* via the `dockerInfo` prop, because that's the host the watcher is actually targeting. Don't render both.

## Conventions

- **No "companion" anywhere.** One app, two roles.
- **Never end UI text in an ellipsis** (`…`, `truncate`). Shorten the format or shrink the font instead. A user-visible `9.1 GiB / 24.0 …` is a bug.
- **No personal info in defaults.** No hardcoded IPs, usernames, or paths from the author's machine. Distribution-bound; assume the user is a stranger.
- **No `// removed` / `// unused` comments.** Just delete dead code.
- **No comments that restate the code.** Comments must explain *why* — a constraint, a workaround, a hidden invariant.
- **Don't add backwards-compat shims** for code paths you control. Change the call sites.

## Running things

Pre-existing user state lives at:

- macOS: `~/Library/Application Support/dockerbuddy/`
  - `config.json` — token, listen port, contexts
  - `paired.json` — present only in remote-role installs
  - `dock/` — installed `dock` MCP server (if user accepted that step)
- Windows: `%APPDATA%\dockerbuddy\` (same layout)

To manually inspect Mac config:
```bash
cat ~/Library/Application\ Support/dockerbuddy/config.json
```

## What to do when the user reports "X is blank"

In rough order of likelihood:

1. **Renderer crashed.** Check the Electron console (`Cmd+Opt+I`). Look for the last component that mounted. Most blank-window crashes have been malformed data crashing one tile and React unmounting the tree.
2. **`docker stats` stream died** and snapshot is stale. Restart the watcher (saving any main-process file triggers it) or check `dockerWatcher.ts`.
3. **Remote SSH unreachable.** Look at the Electron main process log for `[remoteMetrics]` errors.
4. **Token mismatch** between controller and remote. Compare `config.json` on both sides — they should match for the paired pair. Re-run the wizard if not.

When in doubt, the source of truth is:
- `loadConfig()` for what the controller thinks it knows.
- `loadPaired()` for whether this install is in remote mode.
- `docker --context <name> info` for whether the engine is actually reachable.
