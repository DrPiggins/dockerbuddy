import { run, which } from "./exec.js";
import type { PrereqReport } from "../shared.js";

export async function checkPrereqs(): Promise<PrereqReport[]> {
  const results: PrereqReport[] = [];

  // Homebrew
  const brewPath = await which("brew");
  if (brewPath) {
    const v = await run(brewPath, ["--version"]);
    results.push({
      key: "brew",
      label: "Homebrew",
      detail: v.ok ? v.stdout.split("\n")[0] : undefined,
      state: v.ok ? "ok" : "missing",
    });
  } else {
    results.push({
      key: "brew",
      label: "Homebrew",
      detail: "Required to install Docker CLI",
      state: "missing",
    });
  }

  // Node
  const nodePath = await which("node");
  if (nodePath) {
    const v = await run(nodePath, ["--version"]);
    results.push({
      key: "node",
      label: "Node.js",
      detail: v.ok ? v.stdout.trim() : undefined,
      state: v.ok ? "ok" : "missing",
    });
  } else {
    results.push({
      key: "node",
      label: "Node.js",
      detail: "Required to run the dock MCP server",
      state: "missing",
    });
  }

  // Docker CLI
  const dockerPath = await which("docker");
  if (dockerPath) {
    const v = await run(dockerPath, ["--version"]);
    results.push({
      key: "docker",
      label: "Docker CLI",
      detail: v.ok ? v.stdout.trim() : undefined,
      state: v.ok ? "ok" : "missing",
    });
  } else {
    results.push({
      key: "docker",
      label: "Docker CLI",
      detail: "I'll install this for you next",
      state: "missing",
    });
  }

  // Claude Code
  const claudePath = await which("claude");
  if (claudePath) {
    const v = await run(claudePath, ["--version"]);
    results.push({
      key: "claudeCode",
      label: "Claude Code",
      detail: v.ok ? v.stdout.trim() : undefined,
      state: v.ok ? "ok" : "missing",
    });
  } else {
    results.push({
      key: "claudeCode",
      label: "Claude Code",
      detail:
        "Not found — install from claude.ai/code, then re-run DockerBuddy",
      state: "missing",
    });
  }

  // dock MCP server registered
  if (claudePath) {
    const list = await run(claudePath, ["mcp", "list"]);
    const installed =
      list.ok && /\bdock:\s+node\s+/.test(list.stdout + list.stderr);
    results.push({
      key: "dockMcp",
      label: "dock MCP server",
      detail: installed
        ? "Registered with Claude Code"
        : "Will be registered in the next step",
      state: installed ? "ok" : "missing",
    });
  } else {
    results.push({
      key: "dockMcp",
      label: "dock MCP server",
      detail: "Waiting on Claude Code",
      state: "missing",
    });
  }

  return results;
}
