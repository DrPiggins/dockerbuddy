import { useEffect, useState } from "react";
import type { ActionResult } from "../../shared";
import { Button } from "./Button";

export function ServerSshPortPanel({ compact = false }: { compact?: boolean }) {
  const [currentPort, setCurrentPort] = useState<number | null>(null);
  const [draft, setDraft] = useState("22");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await window.api.getServerSshPort();
      if (cancelled) return;
      setCurrentPort(p);
      setDraft(String(p));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const draftNum = parseInt(draft, 10);
  const draftValid =
    Number.isFinite(draftNum) && draftNum >= 1 && draftNum <= 65535;
  const dirty = currentPort !== null && draftValid && draftNum !== currentPort;

  async function apply() {
    if (!draftValid) return;
    setBusy(true);
    setResult(null);
    const r = await window.api.changeServerSshPort(draftNum);
    setResult(r);
    if (r.ok) {
      const next = await window.api.getServerSshPort();
      setCurrentPort(next);
      setDraft(String(next));
    }
    setBusy(false);
  }

  return (
    <div
      className={`rounded-2xl border border-navy-700/50 bg-navy-800/40 ${
        compact ? "px-4 py-3" : "p-4"
      }`}
    >
      <div className="text-whale-200/70 text-[11px] uppercase tracking-wider mb-2">
        SSH port (this PC)
      </div>
      <div className="flex items-end gap-3">
        <div className="w-32">
          <input
            value={draft}
            onChange={(e) =>
              setDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))
            }
            className="w-full bg-navy-800 border border-navy-700 rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-whale-500"
          />
          <div className="text-whale-200/50 text-[11px] mt-1 font-mono">
            current: {currentPort ?? "…"}
          </div>
        </div>
        <Button variant="secondary" onClick={apply} disabled={!dirty || busy}>
          {busy ? "Applying…" : "Apply"}
        </Button>
      </div>
      <div className="text-whale-200/60 text-xs mt-3 leading-relaxed">
        Edits <span className="font-mono">sshd_config</span>, reshuffles
        firewall rules, and restarts the sshd service. Windows will prompt for
        admin rights. After this changes, update your controller Mac's{" "}
        <span className="font-mono">~/.ssh/config</span> Port line to match.
      </div>
      {result && (
        <div
          className={`mt-3 rounded-xl border px-3 py-2 text-sm ${
            result.ok
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
              : "border-rose-500/40 bg-rose-500/10 text-rose-200"
          }`}
        >
          {result.message}
          {result.detail && (
            <div className="font-mono text-xs mt-1 opacity-80">
              {result.detail}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
