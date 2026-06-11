import { useEffect, useState } from "react";
import type {
  CommandEvent,
  ContainerStat,
  DockerEventPayload,
  DockerInfoSnapshot,
  HostMetrics,
  RemoteHostMetrics,
} from "../../shared";
import { HostMetricTile } from "../dashboard/HostMetricTile";
import { ContainerList } from "../dashboard/ContainerList";
import { CommandLog } from "../dashboard/CommandLog";
import { FrequencyGraph } from "../dashboard/FrequencyGraph";
import { LatencyStrip } from "../dashboard/LatencyStrip";
import { Card } from "../components/Card";

const MAX_EVENTS = 500;

export function Dashboard({ platform }: { platform: NodeJS.Platform }) {
  const [host, setHost] = useState<HostMetrics | null>(null);
  const [remotes, setRemotes] = useState<Record<string, RemoteHostMetrics>>({});
  const [stats, setStats] = useState<ContainerStat[]>([]);
  const [info, setInfo] = useState<DockerInfoSnapshot | null>(null);
  const [events, setEvents] = useState<CommandEvent[]>([]);
  const [, setDockerEvents] = useState<DockerEventPayload[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const snap = await window.api.dashboardSnapshot();
      if (cancelled) return;
      setEvents(snap.recentEvents);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const offHost = window.api.onHostMetrics((m) => setHost(m as HostMetrics));
    const offStats = window.api.onDockerStats((s) =>
      setStats(s as ContainerStat[]),
    );
    const offInfo = window.api.onDockerInfo((i) =>
      setInfo(i as DockerInfoSnapshot),
    );
    const offEvent = window.api.onDockerEvent((e) =>
      setDockerEvents((prev) => [...prev.slice(-99), e as DockerEventPayload]),
    );
    const offCmd = window.api.onTelemetryCmd((ev) =>
      setEvents((prev) => {
        const next = [...prev, ev as CommandEvent];
        return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
      }),
    );
    const offRemote = window.api.onRemoteMetrics((m) => {
      const r = m as RemoteHostMetrics;
      setRemotes((prev) => ({ ...prev, [r.name]: r }));
    });
    return () => {
      offHost();
      offStats();
      offInfo();
      offEvent();
      offCmd();
      offRemote();
    };
  }, []);

  return (
    <div className="h-full overflow-y-auto px-8 pb-8">
      <div className="max-w-[1400px] mx-auto space-y-4">
        <HostTiles
          label={thisDeviceLabel(platform)}
          host={host}
          badge={
            Object.keys(remotes).length > 0 ? "Controller only" : undefined
          }
        />
        {Object.values(remotes).map((r, idx) => (
          <RemoteTiles
            key={r.name}
            remote={r}
            // The watcher targets the first configured context, so attach the
            // Docker summary card to that remote. Future: per-remote docker info.
            dockerInfo={idx === 0 ? info : null}
          />
        ))}
        {Object.keys(remotes).length === 0 && <DockerSummary info={info} />}

        <div className="grid grid-cols-12 gap-4 h-[520px]">
          <div className="col-span-4 min-h-0">
            <ContainerList stats={stats} />
          </div>
          <div className="col-span-8 min-h-0 flex flex-col gap-3">
            <LatencyStrip events={events} />
            <div className="flex-1 min-h-0">
              <CommandLog events={events} />
            </div>
            <div className="h-44 shrink-0">
              <FrequencyGraph events={events} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      className={`transition-transform duration-150 ${
        open ? "rotate-90" : ""
      } text-whale-200/60`}
      aria-hidden
    >
      <path d="M3 1.5l4 3.5-4 3.5z" fill="currentColor" />
    </svg>
  );
}

// Open/closed state survives reloads so collapsing a noisy device sticks.
function useCollapsed(key: string, defaultOpen = true): [boolean, () => void] {
  const storageKey = `dockerbuddy.tiles.${key}`;
  const [open, setOpen] = useState(() => {
    const v = localStorage.getItem(storageKey);
    return v === null ? defaultOpen : v === "1";
  });
  return [
    open,
    () => {
      const next = !open;
      setOpen(next);
      localStorage.setItem(storageKey, next ? "1" : "0");
    },
  ];
}

function HostTiles({
  label,
  host,
  badge,
}: {
  label: string;
  host: HostMetrics | null;
  badge?: string;
}) {
  const [open, toggle] = useCollapsed(`host:${label}`);
  return (
    <div>
      <button
        onClick={toggle}
        className="flex items-center gap-2 mb-2 ml-1 group focus:outline-none"
      >
        <Caret open={open} />
        <span className="text-[11px] uppercase tracking-wider text-whale-200/60 group-hover:text-whale-100">
          {label}
        </span>
        {badge && (
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-[1px] rounded-full bg-navy-800/60 border border-navy-700/50 text-whale-200/60">
            {badge}
          </span>
        )}
      </button>
      {open && (
      <div className="grid grid-cols-5 gap-4">
        <HostMetricTile
          label="CPU"
          value={host ? `${host.cpu.percent.toFixed(0)}%` : "—"}
          detail={host ? `${host.cpu.cores} cores` : undefined}
          percent={host?.cpu.percent}
          accent="whale"
        />
        <HostMetricTile
          label="Memory"
          value={host ? `${host.memory.percent.toFixed(0)}%` : "—"}
          detail={host ? fmtMemPair(host.memory.used, host.memory.total) : undefined}
          percent={host?.memory.percent}
          accent="buddy"
        />
        <HostMetricTile
          label="Disk"
          value={host?.disk ? `${host.disk.busyPercent.toFixed(0)}%` : "—"}
          detail={host?.disk ? `${host.disk.iops.toFixed(0)} IOPS` : undefined}
          percent={host?.disk?.busyPercent}
          accent="emerald"
        />
        <HostMetricTile
          label="Network"
          value={
            host?.network
              ? `${fmtRate(host.network.rx)}↓ ${fmtRate(host.network.tx)}↑`
              : "—"
          }
          valueSize="md"
          accent="amber"
        />
        <HostMetricTile
          label="Uptime"
          value={host ? fmtUptime(host.uptime) : "—"}
          valueSize="md"
          accent="amber"
        />
      </div>
      )}
    </div>
  );
}

function RemoteTiles({
  remote,
  dockerInfo,
}: {
  remote: RemoteHostMetrics;
  dockerInfo: DockerInfoSnapshot | null;
}) {
  const h = remote.metrics;
  const [open, toggle] = useCollapsed(`remote:${remote.name}`);
  return (
    <div className="space-y-3">
      <button
        onClick={toggle}
        className="flex items-center gap-2 mb-2 ml-1 group focus:outline-none"
      >
        <Caret open={open} />
        <div
          className={`w-1.5 h-1.5 rounded-full ${
            remote.ok ? "bg-emerald-400" : "bg-rose-400"
          } shadow-[0_0_6px_currentColor]`}
        />
        <span className="text-[11px] uppercase tracking-wider text-whale-200/60 group-hover:text-whale-100">
          {remote.name}
        </span>
        {!remote.ok && remote.error && (
          <span className="text-[11px] text-rose-300/70 font-mono max-w-[400px]">
            {remote.error}
          </span>
        )}
      </button>
      {open && (
      <>
      <div className="grid grid-cols-5 gap-4">
        <HostMetricTile
          label="CPU"
          value={h ? `${h.cpu.percent.toFixed(0)}%` : "—"}
          detail={h ? `${h.cpu.cores} cores` : undefined}
          percent={h?.cpu.percent}
          accent="whale"
        />
        <HostMetricTile
          label="Memory"
          value={h ? `${h.memory.percent.toFixed(0)}%` : "—"}
          detail={h ? fmtMemPair(h.memory.used, h.memory.total) : undefined}
          percent={h?.memory.percent}
          accent="buddy"
        />
        <HostMetricTile
          label="Disk"
          value={h?.disk ? `${h.disk.busyPercent.toFixed(0)}%` : "—"}
          detail={h?.disk ? `${h.disk.iops.toFixed(0)} IOPS` : undefined}
          percent={h?.disk?.busyPercent}
          accent="emerald"
        />
        <HostMetricTile
          label="Network"
          value={
            h?.network
              ? `${fmtRate(h.network.rx)}↓ ${fmtRate(h.network.tx)}↑`
              : "—"
          }
          valueSize="md"
          accent="amber"
        />
        <HostMetricTile
          label="Uptime"
          value={h ? fmtUptime(h.uptime) : "—"}
          valueSize="md"
          accent="amber"
        />
      </div>
      {dockerInfo && <DockerSummary info={dockerInfo} />}
      </>
      )}
    </div>
  );
}

function thisDeviceLabel(platform: NodeJS.Platform) {
  if (platform === "darwin") return "This Mac";
  if (platform === "win32") return "This PC";
  return "This machine";
}

function fmtUptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function DockerSummary({ info }: { info: DockerInfoSnapshot | null }) {
  return (
    <Card className="px-5 py-3 flex items-center gap-6 text-sm">
      <div className="flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full ${
            info?.ok ? "bg-emerald-400" : "bg-rose-400"
          } shadow-[0_0_8px_currentColor]`}
        />
        <span className="text-white font-medium">
          {info?.ok ? "Docker connected" : "Docker offline"}
        </span>
      </div>
      {info?.serverVersion && (
        <SummaryCell label="version" value={info.serverVersion} />
      )}
      {typeof info?.containersRunning === "number" && (
        <SummaryCell
          label="containers"
          value={`${info.containersRunning} running / ${info.containers ?? "?"}`}
        />
      )}
      {typeof info?.images === "number" && (
        <SummaryCell label="images" value={String(info.images)} />
      )}
      {info?.operatingSystem && (
        <SummaryCell label="os" value={info.operatingSystem} />
      )}
      {!info?.ok && info?.error && (
        <span className="text-rose-300/80 text-xs font-mono ml-auto truncate">
          {info.error}
        </span>
      )}
    </Card>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-whale-200/50">
        {label}
      </span>
      <span className="text-whale-100 font-mono text-xs">{value}</span>
    </div>
  );
}

function fmtGiB(bytes: number) {
  return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
}
// Compact pair like "9.1/24 GiB" so it fits in a narrow tile without ellipsis.
function fmtMemPair(used: number, total: number) {
  const u = (used / 1024 ** 3).toFixed(1);
  const t = (total / 1024 ** 3).toFixed(0);
  return `${u}/${t} GiB`;
}
function fmtRate(bytesPerSec: number) {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
  if (bytesPerSec < 1024 ** 2)
    return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  return `${(bytesPerSec / 1024 ** 2).toFixed(1)} MB/s`;
}
