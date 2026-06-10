import { useState } from "react";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Mascot } from "../components/Mascot";

export function Done({
  includeRemote,
  remoteVerified,
  contextName,
}: {
  includeRemote: boolean;
  remoteVerified: boolean;
  contextName: string;
}) {
  const [ctxStatus, setCtxStatus] = useState<
    "idle" | "working" | "ok" | "err"
  >("idle");
  const [ctxDetail, setCtxDetail] = useState<string>("");

  async function reinstallContext() {
    setCtxStatus("working");
    const r = await window.api.installClaudeContext();
    setCtxStatus(r.ok ? "ok" : "err");
    setCtxDetail(r.detail || r.message || "");
  }

  return (
    <Card className="p-10 text-center">
      <div className="flex justify-center mb-6">
        <Mascot size={120} />
      </div>
      <h1 className="text-4xl font-semibold tracking-tight mb-3">
        You're all set!
      </h1>
      <p className="text-whale-100/80 text-base mb-8 max-w-md mx-auto">
        Open <span className="font-mono text-whale-300">claude</span> in a new
        terminal and try one of these:
      </p>

      <div className="space-y-2 mb-8 text-left max-w-md mx-auto">
        <Prompt text='"what containers are running"' />
        <Prompt text='"tail the api container logs since 10m"' />
        {includeRemote && remoteVerified && (
          <>
            <Prompt text={`"what's running on ${contextName}"`} />
            <Prompt text={`"list every compose stack on ${contextName}"`} />
          </>
        )}
      </div>

      <div className="text-left max-w-md mx-auto mb-8 rounded-2xl border border-navy-700/50 bg-navy-800/40 p-4">
        <div className="text-sm font-semibold text-white mb-1">
          Claude knows what this is
        </div>
        <p className="text-[13px] text-whale-100/70 leading-relaxed">
          A DockerBuddy block was written to your user-level{" "}
          <span className="font-mono text-whale-300">CLAUDE.md</span> so any
          Claude Code session on this machine picks up dock tooling and the
          topology automatically. It lives between markers, so anything you've
          added to that file is preserved.
        </p>
        <div className="flex items-center gap-2 mt-3">
          <Button
            onClick={reinstallContext}
            className="px-3 py-1.5 text-xs"
            disabled={ctxStatus === "working"}
          >
            {ctxStatus === "working" ? "Working..." : "Reinstall context"}
          </Button>
          <Button
            onClick={() => window.api.revealClaudeContext()}
            className="px-3 py-1.5 text-xs"
          >
            Reveal in Finder
          </Button>
          {ctxStatus === "ok" && (
            <span className="text-[11px] text-emerald-300 font-mono truncate">
              {ctxDetail}
            </span>
          )}
          {ctxStatus === "err" && (
            <span className="text-[11px] text-rose-300 font-mono truncate">
              {ctxDetail}
            </span>
          )}
        </div>
      </div>

      <Button
        onClick={() => window.close()}
        className="px-8 py-3 text-base"
      >
        Close DockerBuddy
      </Button>
    </Card>
  );
}

function Prompt({ text }: { text: string }) {
  return (
    <div className="rounded-2xl bg-navy-800/60 border border-navy-700/50 px-4 py-3 font-mono text-sm text-whale-100">
      <span className="text-buddy-400 mr-2">›</span>
      {text}
    </div>
  );
}
