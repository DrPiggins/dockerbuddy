import type { CommandEvent } from "../../shared";
import { Card } from "../components/Card";

const LOCAL_KEY = "__local__";
const WINDOW = 10;

export function LatencyStrip({ events }: { events: CommandEvent[] }) {
  const groups = groupByDestination(events);
  const entries = Object.entries(groups);

  return (
    <Card className="px-4 py-2.5 flex items-center gap-4 shrink-0">
      <div className="text-[10px] uppercase tracking-wider text-whale-200/50 shrink-0">
        Latency
      </div>
      {entries.length === 0 ? (
        <div className="text-[12px] text-whale-200/40 font-mono">
          waiting for activity…
        </div>
      ) : (
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          {entries.map(([key, list]) => (
            <Chip key={key} dest={key} list={list} />
          ))}
        </div>
      )}
    </Card>
  );
}

function Chip({ dest, list }: { dest: string; list: CommandEvent[] }) {
  const recent = list.slice(-WINDOW);
  const avg = recent.reduce((s, e) => s + e.durationMs, 0) / recent.length;
  const isLocal = dest === LOCAL_KEY;
  const label = isLocal ? "Local Docker" : dest;
  const dotClass = isLocal ? "bg-emerald-400" : "bg-buddy-400";
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass} shadow-[0_0_6px_currentColor]`}
      />
      <span className="text-[11px] text-whale-200/70 shrink-0">{label}</span>
      <span className="text-[12px] text-white font-mono tabular-nums shrink-0">
        {fmtMs(avg)}
      </span>
      <span className="text-[10px] text-whale-200/40 font-mono shrink-0">
        n={recent.length}
      </span>
    </div>
  );
}

function groupByDestination(events: CommandEvent[]): Record<string, CommandEvent[]> {
  const out: Record<string, CommandEvent[]> = {};
  for (const e of events) {
    const ctx = (e.args?.context as string | undefined)?.trim();
    const key = ctx && ctx.length > 0 ? ctx : LOCAL_KEY;
    (out[key] ??= []).push(e);
  }
  return out;
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 10_000) return `${(ms / 1000).toFixed(2)}s`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}
