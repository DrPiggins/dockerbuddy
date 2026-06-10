# dock

A Docker MCP server for Claude Code. You run `claude` in your terminal, ask it to do Docker things, and Claude Code talks to `dock` over MCP. **No separate API key** — uses your existing Claude Code subscription.

The point isn't just "Claude can run `docker` commands" — Claude Code can already shell out. The point is that `dock` exposes Docker as **structured tools** with summarization, filtering, and auto-discovery baked in.

## Cool features (vs. raw shell access)

- **Remote daemons.** Every tool takes an optional `context` arg, so Claude on your Mac can drive Docker on your home lab over SSH. (See *Remote setup* below.)
- **`inspect`** returns ~20 fields that matter, not the 800-line raw blob
- **`logs`** has `tail` + `since` + `grep` in one call, no pipes
- **`stats`** is a snapshot, not a stream — one JSON dump of every container's CPU/mem
- **`compose_ls`** lists every running compose project on a daemon, even when you don't have the YAML locally (perfect for remote servers)
- **`compose_ps` / `compose_logs`** auto-discover `compose.yaml` in your cwd, OR accept a `project` name (for remote stacks you don't have files for)
- **All read-only tools** return structured JSON (parsed from `--format '{{json .}}'`)
- **Destructive tools** are tagged `destructiveHint: true` so Claude Code prompts the user before running

## Install

Requires Docker (Desktop / OrbStack / colima) and Claude Code.

```bash
claude mcp add dock node /Users/parkerlabonte/dock/bin/dock.js
```

Or edit `~/.claude.json` manually:

```json
{
  "mcpServers": {
    "dock": {
      "command": "node",
      "args": ["/Users/parkerlabonte/dock/bin/dock.js"]
    }
  }
}
```

Restart Claude Code. Verify with `/mcp` — you should see `dock` connected with 14 tools.

## Remote setup (home lab / any other Docker host)

You drive remote Docker hosts via standard Docker contexts over SSH. One-time setup on your Mac:

```bash
# requires passwordless SSH to your homelab and docker installed there
docker context create homelab --docker "host=ssh://parker@homelab.local"

# verify
docker --context homelab ps
```

Now in Claude Code:

> what's running on homelab

> tail the jellyfin container's logs on homelab, last 50 lines, since 1h

> list every compose stack on homelab

> restart the nextcloud-app service on homelab

Claude calls dock tools with `context: "homelab"`. Local containers still work as before (omit `context`).

If you don't pass `context`, dock uses whatever `docker context use` is set to (typically `default` = local Docker).

## Use

Just talk to Claude Code:

> what containers are running

> tail the api container's logs since 10m, grep for ERROR

> give me a memory snapshot of every running container

> the postgres container has a weird mount — inspect it

> bring my compose stack up, then tail logs from web and worker

> nuke dangling images and unused volumes

Read-only tools run silently. Destructive ones (`lifecycle`, `exec`, `prune`, `compose_action`) prompt you before executing — that's Claude Code's permission system reading the `destructiveHint` annotations on each tool.

## Tools

| Tool | Kind | What it does |
| --- | --- | --- |
| `contexts` | read | List Docker contexts + which is current |
| `ps` | read | Structured container list, all states, optional filter |
| `logs` | read | tail + since + grep on one container |
| `stats` | read | One-shot CPU/mem/IO snapshot of all containers |
| `inspect` | read | Summarized container inspect (or `full: true`) |
| `images` | read | Image list with sizes, dangling filter |
| `system_df` | read | Disk usage breakdown |
| `compose_ls` | read | Every running compose project on a daemon (great for remote) |
| `compose_ps` | read | Services of a project (local YAML or `project` name) |
| `compose_logs` | read | Multiplexed logs across services |
| `lifecycle` | destructive | start / stop / restart / remove / kill a container |
| `exec` | destructive | Run argv inside a container |
| `prune` | destructive | Clean containers / images / volumes / networks / all |
| `compose_action` | destructive | up / down / restart / build compose services |

All tools (except `contexts`) take an optional `context: "<name>"` to target a remote daemon.

## How it works

- Single Node entry point: `bin/dock.js`
- MCP server over stdio using `@modelcontextprotocol/sdk`
- Each tool shells out to `docker` via `execFile` and returns structured output
- Schemas defined with zod, so Claude Code sees rich tool docs
