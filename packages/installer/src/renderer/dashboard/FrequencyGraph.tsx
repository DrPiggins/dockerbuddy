import { useMemo } from "react";
import type { CommandEvent } from "../../shared";
import { Card } from "../components/Card";

const BUCKETS = 30;
const BUCKET_MS = 10_000;
const TOOL_COLORS = [
  "#0db7ed",
  "#a78bfa",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#60a5fa",
  "#f472b6",
  "#4ade80",
];

export function FrequencyGraph({ events }: { events: CommandEvent[] }) {
  const { stacks, tools, max } = useMemo(() => {
    const now = Date.now();
    const start = now - BUCKETS * BUCKET_MS;
    const toolSet = new Map<string, number>();
    for (const e of events) {
      const t = new Date(e.timestamp).getTime();
      // Skip events with malformed/missing timestamps so a single bad entry
      // can't NaN out the bucket index and blank the whole dashboard.
      if (!Number.isFinite(t) || t < start) continue;
      toolSet.set(e.tool, (toolSet.get(e.tool) ?? 0) + 1);
    }
    const tools = [...toolSet.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);

    const stacks: number[][] = Array.from({ length: BUCKETS }, () =>
      Array(tools.length).fill(0),
    );
    for (const e of events) {
      const t = new Date(e.timestamp).getTime();
      if (!Number.isFinite(t) || t < start) continue;
      const idx = Math.min(BUCKETS - 1, Math.floor((t - start) / BUCKET_MS));
      const ti = tools.indexOf(e.tool);
      if (ti >= 0) stacks[idx][ti] += 1;
    }
    const max = Math.max(1, ...stacks.map((s) => s.reduce((a, b) => a + b, 0)));
    return { stacks, tools, max };
  }, [events]);

  return (
    <Card className="p-4 h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="text-sm font-semibold text-white">
          Command frequency
        </div>
        <div className="text-[11px] text-whale-200/60 font-mono">
          last 5 min · {BUCKET_MS / 1000}s buckets
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <svg
          viewBox={`0 0 ${BUCKETS * 10} 100`}
          preserveAspectRatio="none"
          className="w-full flex-1"
        >
          {stacks.map((s, i) => {
            let y = 100;
            const total = s.reduce((a, b) => a + b, 0);
            const scale = total === 0 ? 0 : (total / max) * 96;
            return (
              <g key={i}>
                {s.map((count, ti) => {
                  if (count === 0) return null;
                  const h = (count / total) * scale;
                  y -= h;
                  return (
                    <rect
                      key={ti}
                      x={i * 10 + 1}
                      y={y}
                      width={8}
                      height={h}
                      fill={TOOL_COLORS[ti % TOOL_COLORS.length]}
                      opacity={0.85}
                    />
                  );
                })}
              </g>
            );
          })}
          <line
            x1="0"
            x2={BUCKETS * 10}
            y1="100"
            y2="100"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="0.5"
          />
        </svg>

        {tools.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-[10px]">
            {tools.slice(0, 8).map((t, i) => (
              <div key={t} className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-sm"
                  style={{ background: TOOL_COLORS[i % TOOL_COLORS.length] }}
                />
                <span className="text-whale-200/70 font-mono">{t}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
