import { useState } from "react";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { StepHeader } from "../components/StepHeader";
import type { RemoteConfig, RemoteTestResult } from "../../shared";

export function RemoteTest({
  initial,
  onVerified,
  onSkip,
}: {
  initial: RemoteConfig;
  onVerified: (cfg: RemoteConfig) => void;
  onSkip: () => void;
}) {
  const [cfg, setCfg] = useState<RemoteConfig>(initial);
  const [testing, setTesting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [testResult, setTestResult] = useState<RemoteTestResult | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  async function test() {
    setTesting(true);
    setTestResult(null);
    setCreateError(null);
    const r = await window.api.testRemote(cfg);
    setTestResult(r);
    setTesting(false);
  }

  async function finalize() {
    setCreating(true);
    setCreateError(null);
    const r = await window.api.createRemoteContext(cfg);
    setCreating(false);
    if (r.ok) {
      onVerified(cfg);
    } else {
      setCreateError(r.message);
    }
  }

  const canTest = cfg.ip.length > 0 && cfg.username.length > 0;

  return (
    <Card className="p-8">
      <StepHeader
        title="Connect to the remote host"
        subtitle="Type in the IP and username the setup script printed. I'll test that I can SSH in and reach Docker over there."
      />

      <div className="grid grid-cols-[140px,1fr] gap-3 mb-6">
        <label className="text-sm text-whale-200/80 self-center">IP address</label>
        <input
          value={cfg.ip}
          onChange={(e) => setCfg({ ...cfg, ip: e.target.value.trim() })}
          placeholder="192.168.0.133"
          className="bg-navy-800 border border-navy-600 rounded-2xl px-4 py-2.5 font-mono text-white focus:outline-none focus:border-whale-400 focus:ring-2 focus:ring-whale-500/30"
        />
        <label className="text-sm text-whale-200/80 self-center">Username</label>
        <input
          value={cfg.username}
          onChange={(e) => setCfg({ ...cfg, username: e.target.value })}
          placeholder="parker"
          className="bg-navy-800 border border-navy-600 rounded-2xl px-4 py-2.5 font-mono text-white focus:outline-none focus:border-whale-400 focus:ring-2 focus:ring-whale-500/30"
        />
        <label className="text-sm text-whale-200/80 self-center">Context name</label>
        <input
          value={cfg.contextName}
          onChange={(e) =>
            setCfg({
              ...cfg,
              contextName: e.target.value
                .replace(/[^a-zA-Z0-9_-]/g, "")
                .slice(0, 30),
            })
          }
          className="bg-navy-800 border border-navy-600 rounded-2xl px-4 py-2.5 font-mono text-white focus:outline-none focus:border-whale-400 focus:ring-2 focus:ring-whale-500/30"
        />
      </div>

      {testResult && (
        <div
          className={`rounded-2xl p-4 mb-6 border ${
            testResult.ok
              ? "bg-emerald-500/10 border-emerald-500/30"
              : "bg-rose-500/10 border-rose-500/30"
          }`}
        >
          {testResult.ok ? (
            <div className="text-emerald-200 text-sm">
              ✅ Connected — Docker{" "}
              <span className="font-mono">{testResult.dockerVersion}</span> on{" "}
              <span className="font-mono">{testResult.os}</span>
            </div>
          ) : (
            <div className="text-rose-200 text-sm font-mono whitespace-pre-wrap break-words">
              ❌ {testResult.error}
            </div>
          )}
        </div>
      )}

      {createError && (
        <div className="rounded-2xl bg-rose-500/10 border border-rose-500/30 p-4 mb-6 text-rose-200 text-sm font-mono whitespace-pre-wrap break-words">
          ❌ {createError}
        </div>
      )}

      <div className="flex justify-between items-center">
        <Button variant="ghost" onClick={onSkip}>
          Skip for now
        </Button>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={test}
            disabled={!canTest || testing}
          >
            {testing ? "Testing…" : "Test connection"}
          </Button>
          <Button
            onClick={finalize}
            disabled={!testResult?.ok || creating}
          >
            {creating ? "Saving…" : "Save & continue →"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
