import type { ContainerStat } from "../../shared";
import { Card } from "../components/Card";

export function ContainerList({ stats }: { stats: ContainerStat[] }) {
  return (
    <Card className="p-4 h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="text-sm font-semibold text-white">Containers</div>
        <div className="text-[11px] text-whale-200/60 font-mono">
          {stats.length} running
        </div>
      </div>
      {stats.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-whale-200/40 text-sm">
          No running containers.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {stats.map((s) => (
            <ContainerRow key={s.id} stat={s} />
          ))}
        </div>
      )}
    </Card>
  );
}

function ContainerRow({ stat }: { stat: ContainerStat }) {
  const cpu = parsePct(stat.cpuPerc);
  const mem = parsePct(stat.memPerc);
  return (
    <div className="rounded-2xl bg-navy-800/60 border border-navy-700/50 px-3 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-white truncate">
            {stat.name}
          </div>
          {stat.image && (
            <div className="text-[11px] text-whale-200/50 font-mono truncate">
              {stat.image}
            </div>
          )}
        </div>
        <div className="text-[11px] font-mono text-whale-200/60 ml-2 tabular-nums">
          {stat.id.slice(0, 7)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <MiniBar label="CPU" value={stat.cpuPerc} pct={cpu} color="bg-whale-500" />
        <MiniBar label="MEM" value={stat.memPerc} pct={mem} color="bg-buddy-500" />
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-2 text-[10px] font-mono text-whale-200/50">
        <div className="truncate">net {stat.netIO}</div>
        <div className="truncate">blk {stat.blockIO}</div>
      </div>
    </div>
  );
}

function MiniBar({
  label,
  value,
  pct,
  color,
}: {
  label: string;
  value: string;
  pct: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-whale-200/60 mb-0.5">
        <span>{label}</span>
        <span className="font-mono">{value}</span>
      </div>
      <div className="h-1 rounded-full bg-navy-900 overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}

function parsePct(s: string): number {
  const m = s.match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}
