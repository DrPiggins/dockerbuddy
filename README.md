# DockerBuddy

Docker × Claude Code. Drive Docker from Claude Code, and offload heavy builds to a paired machine on your network.

**[Download at dockerbuddy.com →](https://dockerbuddy.com)**

## What it does

- **Plugs Docker into Claude Code.** Ships an MCP server (`dock`) that Claude can call to list containers, stream logs, exec into shells, drive Compose, and more.
- **Offloads heavy work to any machine.** Pair a desktop, homelab box, or basement PC. DockerBuddy routes builds, dev servers, and tests there over SSH so your laptop stays cool.
- **Shows you everything.** Live dashboard with host metrics, container state, and a Command flow pane that surfaces every Docker call Claude makes.

One app, two roles. Same binary runs as controller (on your daily-driver) or paired host (on the machine doing the work). Role is decided by a single file.

## Install

Grab the right build for your OS from **[dockerbuddy.com](https://dockerbuddy.com)** or the [Releases page](https://github.com/parkerlabonte/dockerbuddy/releases).

Requires:
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine on Linux)
- [Claude Code](https://claude.com/claude-code) — only needed on the controller

## Repo layout

This is a monorepo (npm workspaces). Three packages:

```
packages/
  installer/   Electron + React desktop app (the wizard + dashboard)
  dock/        MCP server that exposes Docker tools to Claude Code
  website/     dockerbuddy.com (Next.js)
```

Each package has its own README and `CLAUDE.md` with package-specific orientation.

## Build from source

```bash
npm install
npm run dev          # run the Electron app in dev mode
npm run dist:mac     # build a Mac .dmg
npm run dist:win     # build a Windows installer (cross-compile from Mac)
npm run dist:linux   # build a Linux AppImage
npm run web          # run dockerbuddy.com locally
```

Releases get cut from `main` via `npm run dist:mac:release` / `dist:win:release` / `dist:linux:release`, which publish to GitHub Releases.

## Contributing

See [`packages/installer/CLAUDE.md`](packages/installer/CLAUDE.md) for the architecture orientation. There are a few load-bearing gotchas documented there that will bite you if you skip them.

## License

[MIT](LICENSE).
