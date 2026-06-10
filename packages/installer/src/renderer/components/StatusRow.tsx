type Status = "pending" | "checking" | "ok" | "missing" | "error";

export function StatusRow({
  label,
  detail,
  status,
}: {
  label: string;
  detail?: string;
  status: Status;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-navy-800/60 border border-navy-700/50 px-4 py-3">
      <div className="flex flex-col">
        <span className="font-medium text-white">{label}</span>
        {detail && (
          <span className="font-mono text-xs text-whale-200/60 mt-0.5">
            {detail}
          </span>
        )}
      </div>
      <StatusPill status={status} />
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  const map: Record<Status, { text: string; cls: string }> = {
    pending: { text: "—", cls: "bg-navy-700 text-whale-200/60" },
    checking: {
      text: "checking…",
      cls: "bg-whale-500/20 text-whale-200 animate-pulse",
    },
    ok: { text: "ready", cls: "bg-emerald-500/20 text-emerald-300" },
    missing: { text: "missing", cls: "bg-amber-500/20 text-amber-300" },
    error: { text: "error", cls: "bg-rose-500/20 text-rose-300" },
  };
  const { text, cls } = map[status];
  return (
    <span
      className={`text-xs font-medium px-2.5 py-1 rounded-full font-mono ${cls}`}
    >
      {text}
    </span>
  );
}
