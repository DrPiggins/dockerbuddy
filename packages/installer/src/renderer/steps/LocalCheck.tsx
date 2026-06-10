import { useEffect, useState } from "react";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { StepHeader } from "../components/StepHeader";
import { StatusRow } from "../components/StatusRow";
import type { PrereqReport } from "../../shared";

export function LocalCheck({ onNext }: { onNext: () => void }) {
  const [reports, setReports] = useState<PrereqReport[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await window.api.checkPrereqs();
      if (!cancelled) {
        setReports(res);
        setDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="p-8">
      <StepHeader
        title="Looking around your Mac"
        subtitle="Checking what's already installed so I only do work that's actually needed."
      />

      <div className="space-y-2 mb-8">
        {!done && reports.length === 0 && (
          <>
            <StatusRow label="Homebrew" status="checking" />
            <StatusRow label="Node.js" status="checking" />
            <StatusRow label="Docker CLI" status="checking" />
            <StatusRow label="Claude Code" status="checking" />
            <StatusRow label="dock MCP server" status="checking" />
          </>
        )}
        {reports.map((r) => (
          <StatusRow
            key={r.key}
            label={r.label}
            detail={r.detail}
            status={r.state}
          />
        ))}
      </div>

      <div className="flex justify-between items-center">
        <div className="text-whale-200/60 text-xs">
          {done && "Don't worry about anything marked 'missing' — I'll handle them next."}
        </div>
        <Button onClick={onNext} disabled={!done}>
          Continue →
        </Button>
      </div>
    </Card>
  );
}
