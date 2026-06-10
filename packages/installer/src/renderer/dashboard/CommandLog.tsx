import { useEffect, useRef } from "react";
import type { CommandEvent } from "../../shared";
import { Card } from "../components/Card";

export function CommandLog({ events }: { events: CommandEvent[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);

  useEffect(() => {
    if (!ref.current || !stuck.current) return;
    ref.current.scrollTop = ref.current.scrollHeight;
  }, [events]);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  }

  return (
    <Card className="p-4 h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="text-sm font-semibold text-white">Command flow</div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <div className="text-[11px] text-whale-200/60 font-mono">
            live · {events.length}
          </div>
        </div>
      </div>
      <div
        ref={ref}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto font-mono text-[12px] leading-relaxed bg-navy-950/60 rounded-2xl border border-navy-800 p-3"
      >
        {events.length === 0 ? (
          <div className="text-whale-200/40 text-center mt-8">
            Waiting for Claude to run a dock tool…
          </div>
        ) : (
          events.map((e, i) => <LogLine key={i} ev={e} />)
        )}
      </div>
    </Card>
  );
}

function LogLine({ ev }: { ev: CommandEvent }) {
  const t = new Date(ev.timestamp);
  const time = t.toLocaleTimeString("en-US", { hour12: false });
  const ms = ev.durationMs.toString().padStart(4, " ");
  const argSummary = summarizeArgs(ev.args);
  return (
    <div className="flex gap-2 py-0.5 border-b border-navy-800/40 last:border-0">
      <span className="text-whale-200/40 shrink-0">{time}</span>
      <span
        className={`shrink-0 w-2 ${
          ev.ok ? "text-emerald-400" : "text-rose-400"
        }`}
      >
        {ev.ok ? "✓" : "✗"}
      </span>
      <span className="text-whale-300 shrink-0">{ev.tool}</span>
      {argSummary && (
        <span className="text-whale-200/50 truncate">{argSummary}</span>
      )}
      <span className="ml-auto text-whale-200/40 shrink-0 tabular-nums">
        {ms}ms
      </span>
      {ev.machine && (
        <span className="text-buddy-400/70 shrink-0 truncate max-w-[140px]">
          @{ev.machine}
        </span>
      )}
    </div>
  );
}

function summarizeArgs(args?: Record<string, unknown>): string {
  if (!args) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined || v === null || v === "") continue;
    const s = typeof v === "string" ? v : JSON.stringify(v);
    parts.push(`${k}=${s.length > 32 ? s.slice(0, 32) + "…" : s}`);
    if (parts.length >= 3) break;
  }
  return parts.join(" ");
}
