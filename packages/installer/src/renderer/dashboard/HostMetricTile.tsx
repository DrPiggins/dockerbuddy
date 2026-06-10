import { Card } from "../components/Card";

export function HostMetricTile({
  label,
  value,
  detail,
  percent,
  accent = "whale",
  valueSize = "lg",
}: {
  label: string;
  value: string;
  detail?: string;
  percent?: number;
  accent?: "whale" | "buddy" | "emerald" | "amber";
  valueSize?: "lg" | "md";
}) {
  const colors: Record<string, { bar: string; glow: string }> = {
    whale: { bar: "bg-whale-500", glow: "shadow-[0_0_18px_rgba(13,183,237,0.6)]" },
    buddy: { bar: "bg-buddy-500", glow: "shadow-[0_0_18px_rgba(139,92,246,0.6)]" },
    emerald: { bar: "bg-emerald-500", glow: "shadow-[0_0_18px_rgba(16,185,129,0.6)]" },
    amber: { bar: "bg-amber-500", glow: "shadow-[0_0_18px_rgba(245,158,11,0.6)]" },
  };
  const c = colors[accent];

  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-wider text-whale-200/60 mb-1">
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <div
          className={`${
            valueSize === "md" ? "text-base" : "text-2xl"
          } font-semibold text-white tabular-nums`}
        >
          {value}
        </div>
        {detail && (
          <div className="text-xs text-whale-200/60 font-mono">
            {detail}
          </div>
        )}
      </div>
      {percent !== undefined && (
        <div className="mt-3 h-1.5 rounded-full bg-navy-800 overflow-hidden">
          <div
            className={`h-full ${c.bar} ${c.glow} transition-all duration-500`}
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>
      )}
    </Card>
  );
}
