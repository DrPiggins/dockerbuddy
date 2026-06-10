import { useEffect, useState } from "react";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { StepHeader } from "../components/StepHeader";
import { StatusRow } from "../components/StatusRow";
import type { PrereqState } from "../../shared";

type StepRow = {
  key: string;
  label: string;
  state: PrereqState | "pending";
  detail?: string;
};

export function LocalInstall({ onNext }: { onNext: () => void }) {
  const [rows, setRows] = useState<StepRow[]>([
    { key: "docker", label: "Install Docker CLI (if needed)", state: "pending" },
    { key: "dock", label: "Install the dock MCP server", state: "pending" },
    { key: "register", label: "Register dock with Claude Code", state: "pending" },
  ]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  function update(key: string, patch: Partial<StepRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function run() {
    setRunning(true);
    setErrors([]);
    const errs: string[] = [];

    update("docker", { state: "checking" });
    const dockerRes = await window.api.installDockerCli();
    update("docker", {
      state: dockerRes.ok ? "ok" : "error",
      detail: dockerRes.message,
    });
    if (!dockerRes.ok) errs.push(`Docker CLI: ${dockerRes.message}`);

    update("dock", { state: "checking" });
    const dockRes = await window.api.installDockResource();
    update("dock", {
      state: dockRes.ok ? "ok" : "error",
      detail: dockRes.message,
    });
    if (!dockRes.ok) errs.push(`dock: ${dockRes.message}`);

    update("register", { state: "checking" });
    const regRes = await window.api.registerDockMcp();
    update("register", {
      state: regRes.ok ? "ok" : "error",
      detail: regRes.message,
    });
    if (!regRes.ok) errs.push(`Claude Code MCP: ${regRes.message}`);

    setErrors(errs);
    setRunning(false);
    setDone(true);
  }

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card className="p-8">
      <StepHeader
        title="Setting up the local side"
        subtitle="Installing only what's missing. Anything already in place is left alone."
      />

      <div className="space-y-2 mb-6">
        {rows.map((r) => (
          <StatusRow
            key={r.key}
            label={r.label}
            detail={r.detail}
            status={r.state === "pending" ? "pending" : r.state}
          />
        ))}
      </div>

      {errors.length > 0 && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 mb-6">
          <div className="text-rose-300 font-medium text-sm mb-2">
            Some steps need attention:
          </div>
          <ul className="text-rose-200/80 text-xs space-y-1 font-mono">
            {errors.map((e, i) => (
              <li key={i}>• {e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-between items-center">
        <Button variant="ghost" onClick={run} disabled={running}>
          Retry
        </Button>
        <Button onClick={onNext} disabled={!done || errors.length > 0}>
          Continue →
        </Button>
      </div>
    </Card>
  );
}
