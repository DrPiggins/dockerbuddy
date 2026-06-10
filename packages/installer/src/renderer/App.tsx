import { useEffect, useState } from "react";
import type { PairedInfo } from "../shared";
import { Mascot } from "./components/Mascot";
import { Wizard } from "./views/Wizard";
import { Dashboard } from "./views/Dashboard";

type View = "wizard" | "dashboard";

export function App() {
  const [view, setView] = useState<View>("dashboard");
  const [bootstrapped, setBootstrapped] = useState(false);
  const [paired, setPaired] = useState<PairedInfo | null>(null);
  const [platform, setPlatform] = useState<NodeJS.Platform>("darwin");
  const [hasSetup, setHasSetup] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const snap = await window.api.dashboardSnapshot();
      if (cancelled) return;
      setPaired(snap.paired ?? null);
      setPlatform(snap.platform);
      const acked = localStorage.getItem("dockerbuddy.roleAcked") === "1";
      const setup = snap.configured || (snap.paired != null && acked);
      setHasSetup(setup);
      setView(setup ? "dashboard" : "wizard");
      setBootstrapped(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function completeWizard() {
    localStorage.setItem("dockerbuddy.roleAcked", "1");
    setHasSetup(true);
    setView("dashboard");
  }

  if (!bootstrapped) {
    return (
      <div className="app-bg h-screen flex items-center justify-center">
        <Mascot size={80} />
      </div>
    );
  }

  return (
    <div className="app-bg h-screen flex flex-col">
      <div
        className="h-9 shrink-0"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />
      <TopBar view={view} onView={setView} paired={paired} />
      <main className="flex-1 overflow-hidden">
        {view === "wizard" && (
          <Wizard
            onComplete={completeWizard}
            paired={paired}
            platform={platform}
            hasSetup={hasSetup}
          />
        )}
        {view === "dashboard" && <Dashboard platform={platform} />}
      </main>
    </div>
  );
}

function TopBar({
  view,
  onView,
  paired,
}: {
  view: "wizard" | "dashboard";
  onView: (v: "wizard" | "dashboard") => void;
  paired: PairedInfo | null;
}) {
  return (
    <header className="px-8 pt-1 pb-4 flex items-center justify-between">
      {view === "dashboard" ? (
        <div className="flex items-center gap-3">
          <Mascot size={36} />
          <div className="leading-tight">
            <div className="text-white font-semibold tracking-tight">
              DockerBuddy
            </div>
            <div className="text-whale-200/60 text-[11px]">
              {paired
                ? `Paired with ${paired.macHost} · ${paired.macIp}`
                : "Docker × Claude Code"}
            </div>
          </div>
        </div>
      ) : (
        <div />
      )}

      <div className="flex items-center gap-1 bg-navy-800/60 border border-navy-700/50 rounded-2xl p-1">
        <TabButton
          active={view === "dashboard"}
          onClick={() => onView("dashboard")}
          label="Dashboard"
        />
        <TabButton
          active={view === "wizard"}
          onClick={() => onView("wizard")}
          label="Setup"
        />
      </div>
    </header>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-colors ${
        active
          ? "bg-whale-500 text-navy-950"
          : "text-whale-200/70 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}
