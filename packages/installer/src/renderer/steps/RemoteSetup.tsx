import { useState } from "react";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { StepHeader } from "../components/StepHeader";
import type { SetupScriptResult } from "../../shared";

export function RemoteSetup({
  defaultContextName,
  onComplete,
}: {
  defaultContextName: string;
  onComplete: (s: SetupScriptResult) => void;
}) {
  const [contextName, setContextName] = useState(defaultContextName);
  const [result, setResult] = useState<SetupScriptResult | null>(null);
  const [working, setWorking] = useState(false);

  async function generate() {
    setWorking(true);
    const r = await window.api.generateSshKeyAndScript(contextName);
    setResult(r);
    setWorking(false);
  }

  return (
    <Card className="p-8">
      <StepHeader
        title="Generate the setup script"
        subtitle="I'll make an SSH key for this Mac and bake the public half into a one-shot PowerShell script. You'll right-click → 'Run with PowerShell' on the remote machine, and it does everything in one go."
      />

      <label className="block mb-6">
        <span className="text-sm text-whale-200/80 mb-2 block">
          Name this remote host
        </span>
        <input
          value={contextName}
          onChange={(e) =>
            setContextName(
              e.target.value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 30),
            )
          }
          placeholder="homelab"
          className="w-full bg-navy-800 border border-navy-600 rounded-2xl px-4 py-2.5 font-mono text-white focus:outline-none focus:border-whale-400 focus:ring-2 focus:ring-whale-500/30"
        />
        <span className="text-xs text-whale-200/40 mt-1.5 block">
          You'll use this name when talking to Claude:{" "}
          <span className="font-mono text-whale-300">
            "what's running on {contextName || "homelab"}"
          </span>
        </span>
      </label>

      {!result ? (
        <div className="flex justify-end">
          <Button
            onClick={generate}
            disabled={working || !contextName}
          >
            {working ? "Generating…" : "Generate setup script"}
          </Button>
        </div>
      ) : (
        <ScriptInstructions
          result={result}
          onContinue={() => onComplete(result)}
        />
      )}
    </Card>
  );
}

function ScriptInstructions({
  result,
  onContinue,
}: {
  result: SetupScriptResult;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-whale-500/10 border border-whale-500/30 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-white font-medium">Script ready</div>
            <div className="font-mono text-xs text-whale-200/60 mt-0.5 truncate">
              {result.scriptPath}
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={() => window.api.revealScript(result.scriptPath)}
          >
            Show in Finder
          </Button>
        </div>
      </div>

      <ol className="space-y-3 text-sm text-whale-100/90">
        <li className="flex gap-3">
          <span className="shrink-0 w-6 h-6 rounded-full bg-buddy-500/30 text-buddy-400 flex items-center justify-center text-xs font-mono">
            1
          </span>
          <span>
            Get the <span className="font-mono">.ps1</span> file onto the remote
            machine — AirDrop, USB, email, whatever you've got.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="shrink-0 w-6 h-6 rounded-full bg-buddy-500/30 text-buddy-400 flex items-center justify-center text-xs font-mono">
            2
          </span>
          <span>
            On Windows: right-click the file →{" "}
            <span className="font-mono">Run with PowerShell</span> (or open
            PowerShell as Administrator and run it).
          </span>
        </li>
        <li className="flex gap-3">
          <span className="shrink-0 w-6 h-6 rounded-full bg-buddy-500/30 text-buddy-400 flex items-center justify-center text-xs font-mono">
            3
          </span>
          <span>
            When it finishes, it'll print the machine's IP address — keep that
            handy.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="shrink-0 w-6 h-6 rounded-full bg-buddy-500/30 text-buddy-400 flex items-center justify-center text-xs font-mono">
            4
          </span>
          <span>
            Make sure Docker Desktop is installed and running on Windows. If
            not, grab it from{" "}
            <a
              onClick={(e) => {
                e.preventDefault();
                window.api.openExternal("https://www.docker.com/products/docker-desktop");
              }}
              className="text-whale-300 underline cursor-pointer"
            >
              docker.com
            </a>
            .
          </span>
        </li>
      </ol>

      <div className="flex justify-end pt-2">
        <Button onClick={onContinue}>I ran it →</Button>
      </div>
    </div>
  );
}
