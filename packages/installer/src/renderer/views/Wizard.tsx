import { useEffect, useState } from "react";
import type {
  ActionResult,
  ContextEntry,
  PairedInfo,
  PrereqReport,
  RemoteConfig,
  RemotePlatform,
  RemoteTestResult,
  SetupInstallerResult,
} from "../../shared";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Mascot } from "../components/Mascot";
import { ServerSshPortPanel } from "../components/ServerSshPortPanel";
import { StatusRow } from "../components/StatusRow";
import { StepHeader, Progress } from "../components/StepHeader";

type Step =
  | "home"
  | "role"
  | "welcome"
  | "local-check"
  | "local-install"
  | "remote-ask"
  | "remote-setup"
  | "remote-test"
  | "server-confirm"
  | "done";

type Role = "controller" | "server";
type SubTab = "wizard" | "settings";

const STEP_INDEX: Record<Step, number | null> = {
  home: null,
  role: 0,
  welcome: 0,
  "local-check": 1,
  "local-install": 1,
  "remote-ask": 2,
  "remote-setup": 2,
  "remote-test": 2,
  "server-confirm": 1,
  done: 3,
};

export function Wizard({
  onComplete,
  paired,
  platform,
  hasSetup,
}: {
  onComplete: () => void;
  paired: PairedInfo | null;
  platform: NodeJS.Platform;
  hasSetup: boolean;
}) {
  const [tab, setTab] = useState<SubTab>("wizard");
  const [step, setStep] = useState<Step>(hasSetup ? "home" : "role");
  const [remoteSetup, setRemoteSetup] = useState<SetupInstallerResult | null>(
    null,
  );

  const progressIdx = STEP_INDEX[step];
  const showProgress = tab === "wizard" && progressIdx !== null;

  return (
    <div className="h-full overflow-y-auto px-8 pb-8 relative">
      {showProgress && (
        <div className="fixed top-12 left-8 z-10">
          <Progress step={progressIdx as number} total={4} />
        </div>
      )}
      <div className="max-w-3xl mx-auto min-h-full flex flex-col">
        <div className="flex justify-center pt-2 pb-6">
          <SubTabNav tab={tab} onTab={setTab} />
        </div>
        <div className="flex-1 flex flex-col justify-center">
          {tab === "settings" && (
            <SettingsPanel paired={paired} platform={platform} />
          )}
          {tab === "wizard" && step === "home" && (
            <WizardHome
              paired={paired}
              platform={platform}
              onNewConnection={() => setStep("remote-setup")}
              onReRunSetup={() => setStep("role")}
            />
          )}
          {tab === "wizard" && step === "role" && (
            <RolePick
              paired={paired}
              platform={platform}
              onPick={(role) =>
                setStep(role === "server" ? "server-confirm" : "welcome")
              }
            />
          )}
          {tab === "wizard" && step === "welcome" && (
            <Welcome onNext={() => setStep("local-check")} />
          )}
          {tab === "wizard" && step === "local-check" && (
            <LocalCheck onNext={() => setStep("local-install")} />
          )}
          {tab === "wizard" && step === "local-install" && (
            <LocalInstall onNext={() => setStep("remote-ask")} />
          )}
          {tab === "wizard" && step === "remote-ask" && (
            <RemoteAsk
              onSetup={() => setStep("remote-setup")}
              onSkip={() => setStep("done")}
            />
          )}
          {tab === "wizard" && step === "remote-setup" && (
            <RemoteSetup
              onNext={(setup) => {
                setRemoteSetup(setup);
                setStep("remote-test");
              }}
            />
          )}
          {tab === "wizard" && step === "remote-test" && (
            <RemoteTest prior={remoteSetup} onNext={() => setStep("done")} />
          )}
          {tab === "wizard" && step === "server-confirm" && (
            <ServerConfirm
              paired={paired}
              platform={platform}
              onOpen={onComplete}
            />
          )}
          {tab === "wizard" && step === "done" && (
            <Done
              onOpen={onComplete}
              onAnother={() => setStep("remote-setup")}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SubTabNav({
  tab,
  onTab,
}: {
  tab: SubTab;
  onTab: (t: SubTab) => void;
}) {
  return (
    <div className="flex items-center gap-1 bg-navy-800/60 border border-navy-700/50 rounded-2xl p-1">
      <SubTabButton
        active={tab === "wizard"}
        onClick={() => onTab("wizard")}
        label="Wizard"
      />
      <SubTabButton
        active={tab === "settings"}
        onClick={() => onTab("settings")}
        label="Settings"
      />
    </div>
  );
}

function SubTabButton({
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
          ? "bg-buddy-500 text-white"
          : "text-whale-200/70 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function WizardHome({
  paired,
  platform,
  onNewConnection,
  onReRunSetup,
}: {
  paired: PairedInfo | null;
  platform: NodeJS.Platform;
  onNewConnection: () => void;
  onReRunSetup: () => void;
}) {
  const deviceLabel =
    platform === "darwin" ? "Mac" : platform === "win32" ? "PC" : "machine";

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-col items-center">
        <Mascot size={100} />
        <div className="text-center mt-2">
          <div className="text-2xl font-semibold tracking-tight text-white">
            DockerBuddy
          </div>
          <div className="text-whale-200/60 text-sm mt-0.5">
            {paired
              ? `This ${deviceLabel} is in server mode`
              : "All set up"}
          </div>
        </div>
      </div>

      <Card className="p-8 w-full">
        <StepHeader
          title={paired ? "Server mode" : "Set up a new connection"}
          subtitle={
            paired
              ? `This ${deviceLabel} is hosting Docker for ${paired.macHost}. You can re-pair from scratch if needed.`
              : "Generate an installer for another Windows or Linux host so Claude can manage Docker on it from here."
          }
        />
        <div className="flex flex-wrap gap-3 mt-4">
          {!paired && (
            <Button onClick={onNewConnection}>Set up new connection</Button>
          )}
          <Button variant="secondary" onClick={onReRunSetup}>
            {paired ? "Re-run setup" : "Re-run full setup"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function SettingsPanel({
  paired,
  platform,
}: {
  paired: PairedInfo | null;
  platform: NodeJS.Platform;
}) {
  const deviceLabel =
    platform === "darwin" ? "Mac" : platform === "win32" ? "PC" : "machine";

  const [token, setToken] = useState<string | null>(null);
  const [contexts, setContexts] = useState<ContextEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<ActionResult | null>(null);

  async function refresh() {
    const snap = await window.api.dashboardSnapshot();
    setToken(snap.telemetryToken);
    setContexts(snap.contexts ?? []);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function rotate() {
    setBusy("rotate");
    setFlash(null);
    const r = await window.api.rotateTelemetryToken();
    setFlash(r);
    await refresh();
    setBusy(null);
  }

  async function removeCtx(name: string) {
    setBusy(`ctx:${name}`);
    setFlash(null);
    const r = await window.api.removeRemoteContext(name);
    setFlash(r);
    await refresh();
    setBusy(null);
  }

  async function doUnpair() {
    setBusy("unpair");
    setFlash(null);
    const r = await window.api.unpairFromController();
    setFlash(r);
    setBusy(null);
  }

  return (
    <div className="space-y-4">
      <StepHeader
        title="Settings"
        subtitle={`Tune this ${deviceLabel}'s DockerBuddy install.`}
      />

      {flash && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            flash.ok
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
              : "border-rose-500/40 bg-rose-500/10 text-rose-200"
          }`}
        >
          <div>{flash.message}</div>
          {flash.detail && (
            <div className="font-mono text-xs mt-1 break-all opacity-80">
              {flash.detail}
            </div>
          )}
        </div>
      )}

      {paired ? (
        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-whale-200/70 text-[11px] uppercase tracking-wider mb-2">
                Paired controller
              </div>
              <div className="space-y-1.5 text-sm">
                <InfoRow label="Host" value={paired.macHost} />
                <InfoRow label="IP" value={paired.macIp} />
                <InfoRow label="Context" value={paired.contextName} />
                <InfoRow
                  label="Paired"
                  value={new Date(paired.pairedAt).toLocaleString()}
                />
              </div>
            </div>
            <Button
              variant="danger"
              onClick={doUnpair}
              disabled={busy === "unpair"}
            >
              {busy === "unpair" ? "Unpairing" : "Unpair"}
            </Button>
          </div>
          <div className="text-whale-200/50 text-xs mt-3">
            Unpairing deletes the paired.json marker on this {deviceLabel}.
            Restart DockerBuddy to switch back to controller mode.
          </div>
        </Card>
      ) : (
        <>
          <Card className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-whale-200/70 text-[11px] uppercase tracking-wider mb-2">
                  Telemetry token
                </div>
                <div className="font-mono text-xs text-white break-all">
                  {token
                    ? `${token.slice(0, 8)}…${token.slice(-8)}`
                    : "loading"}
                </div>
                <div className="text-whale-200/50 text-xs mt-2">
                  Used by dock to authenticate telemetry posts. Rotating
                  re-registers dock with Claude Code so the new value takes
                  effect on the next session.
                </div>
              </div>
              <Button
                variant="secondary"
                onClick={rotate}
                disabled={busy === "rotate"}
              >
                {busy === "rotate" ? "Rotating" : "Rotate"}
              </Button>
            </div>
          </Card>

          <Card className="p-5">
            <div className="text-whale-200/70 text-[11px] uppercase tracking-wider mb-3">
              Remote contexts
            </div>
            {contexts.length === 0 ? (
              <div className="text-sm text-whale-200/60">
                No remote hosts paired yet. Use the wizard to add one.
              </div>
            ) : (
              <div className="space-y-2">
                {contexts.map((c) => (
                  <div
                    key={c.name}
                    className="flex items-center justify-between gap-3 rounded-xl bg-navy-800/60 border border-navy-700/50 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-white font-medium truncate">
                        {c.name}
                      </div>
                      <div className="text-xs text-whale-200/60 font-mono truncate">
                        {c.username}@{c.ip}:{c.sshPort}
                      </div>
                    </div>
                    <Button
                      variant="danger"
                      onClick={() => removeCtx(c.name)}
                      disabled={busy === `ctx:${c.name}`}
                    >
                      {busy === `ctx:${c.name}` ? "Removing" : "Remove"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {platform === "win32" && (
        <Card className="p-5">
          <ServerSshPortPanel />
        </Card>
      )}
    </div>
  );
}

function RolePick({
  paired,
  platform,
  onPick,
}: {
  paired: PairedInfo | null;
  platform: NodeJS.Platform;
  onPick: (role: Role) => void;
}) {
  const suggested: Role = paired ? "server" : "controller";
  const deviceLabel =
    platform === "darwin" ? "Mac" : platform === "win32" ? "PC" : "machine";

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-col items-center">
        <Mascot size={120} />
        <div className="text-center mt-2">
          <div className="text-2xl font-semibold tracking-tight text-white">
            DockerBuddy
          </div>
          <div className="text-whale-200/60 text-sm mt-0.5">
            How will this {deviceLabel} be used?
          </div>
        </div>
      </div>

      {paired && (
        <div className="w-full rounded-2xl border border-buddy-500/30 bg-buddy-500/10 px-4 py-3 text-sm text-buddy-100">
          <span className="font-medium">
            This {deviceLabel} was set up by {paired.macHost} ({paired.macIp}).
          </span>{" "}
          <span className="text-buddy-100/80">
            We've pre-selected the server role — that's what the installer was
            generated for.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 w-full">
        <RoleCard
          title="Controller"
          tagline="Drive Docker from here"
          description="Use Claude Code on this device to run Docker locally and optionally manage remote hosts."
          suggested={suggested === "controller"}
          onClick={() => onPick("controller")}
        />
        <RoleCard
          title="Server"
          tagline="Be a Docker host"
          description="Let a controller (another DockerBuddy install) drive Docker on this machine over SSH."
          suggested={suggested === "server"}
          onClick={() => onPick("server")}
        />
      </div>
    </div>
  );
}

function RoleCard({
  title,
  tagline,
  description,
  suggested,
  onClick,
}: {
  title: string;
  tagline: string;
  description: string;
  suggested: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-3xl border p-6 transition-colors ${
        suggested
          ? "border-whale-500/60 bg-whale-500/10 hover:bg-whale-500/15"
          : "border-navy-700/60 bg-navy-800/40 hover:bg-navy-800/70"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold text-white">{title}</div>
        {suggested && (
          <span className="text-[10px] uppercase tracking-wider text-whale-300 bg-whale-500/20 border border-whale-500/40 rounded-full px-2 py-0.5">
            Suggested
          </span>
        )}
      </div>
      <div className="text-whale-200/70 text-sm mt-1">{tagline}</div>
      <div className="text-whale-200/60 text-xs mt-3 leading-relaxed">
        {description}
      </div>
    </button>
  );
}

function ServerConfirm({
  paired,
  platform,
  onOpen,
}: {
  paired: PairedInfo | null;
  platform: NodeJS.Platform;
  onOpen: () => void;
}) {
  const deviceLabel =
    platform === "darwin" ? "Mac" : platform === "win32" ? "PC" : "machine";

  return (
    <Card className="p-8">
      <StepHeader
        title="Server mode"
        subtitle={`This ${deviceLabel} will host Docker for a controller. The dashboard shows what Claude is doing right now.`}
      />

      {paired ? (
        <div className="rounded-2xl bg-navy-800/60 border border-navy-700/50 p-4 text-sm space-y-2">
          <div className="text-whale-200/70 text-[11px] uppercase tracking-wider">
            Paired controller
          </div>
          <InfoRow label="Host" value={paired.macHost} />
          <InfoRow label="IP" value={paired.macIp} />
          <InfoRow label="Context" value={paired.contextName} />
          <InfoRow
            label="Paired"
            value={new Date(paired.pairedAt).toLocaleString()}
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 text-amber-100 px-4 py-3 text-sm">
          No controller has paired with this {deviceLabel} yet. Run the
          DockerBuddy installer generated by your controller — it will drop the
          pairing config here automatically.
        </div>
      )}

      {platform === "win32" && (
        <div className="text-whale-200/50 text-xs mt-4">
          Need to change the SSH port? Open the{" "}
          <span className="text-whale-200/80">Settings</span> tab above.
        </div>
      )}

      <div className="flex justify-end mt-6">
        <Button onClick={onOpen}>Open dashboard</Button>
      </div>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-whale-200/60 text-xs w-20 shrink-0">{label}</span>
      <span className="text-white font-mono text-xs break-all">{value}</span>
    </div>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex flex-col items-center">
        <Mascot size={140} />
        <div className="text-center mt-2">
          <div className="text-2xl font-semibold tracking-tight text-white">
            DockerBuddy
          </div>
          <div className="text-whale-200/60 text-sm mt-0.5">
            Docker × Claude Code
          </div>
        </div>
      </div>
      <Card className="p-10 w-full">
        <div className="flex flex-col items-center text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Welcome aboard.
          </h1>
          <p className="text-whale-200/80 mt-3 text-sm leading-relaxed max-w-prose">
            DockerBuddy gives Claude Code safe, structured control of your
            Docker stack — locally or on a remote host — and shows you
            everything that's happening in real time.
          </p>
          <Button className="mt-8" onClick={onNext}>
            Get started
          </Button>
        </div>
      </Card>
    </div>
  );
}

function LocalCheck({ onNext }: { onNext: () => void }) {
  const [report, setReport] = useState<PrereqReport[] | null>(null);

  async function refresh() {
    setReport(null);
    const r = await window.api.checkPrereqs();
    setReport(r);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await window.api.checkPrereqs();
      if (!cancelled) setReport(r);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const allOk = report?.every((r) => r.state === "ok");
  // Claude Code is a hard dependency — without it, `claude mcp add` can't run
  // and the whole point of the app falls over. Don't let the user past this
  // step until they install it themselves; we can't brew-install it for them.
  const claudeMissing = report?.some(
    (r) => r.key === "claudeCode" && r.state !== "ok",
  );

  return (
    <Card className="p-8">
      <StepHeader
        title="Local prerequisites"
        subtitle="DockerBuddy needs a few tools on this machine. We'll install anything missing."
      />
      <div className="space-y-2">
        {(report ?? [
          { key: "brew", label: "Homebrew", state: "checking" },
          { key: "node", label: "Node.js", state: "checking" },
          { key: "docker", label: "Docker CLI", state: "checking" },
          { key: "claudeCode", label: "Claude Code CLI", state: "checking" },
          { key: "dockMcp", label: "dock MCP server", state: "checking" },
        ] as PrereqReport[]).map((r) => (
          <StatusRow
            key={r.key}
            label={r.label}
            detail={r.detail}
            status={r.state}
          />
        ))}
      </div>

      {claudeMissing && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 text-amber-100 px-4 py-3 text-sm mt-5">
          <div className="font-medium">Claude Code CLI is required.</div>
          <div className="text-amber-100/80 text-xs mt-1">
            DockerBuddy registers dock with Claude Code's MCP system. Install
            the CLI, then come back and re-check.
          </div>
          <div className="flex gap-2 mt-3">
            <Button
              variant="secondary"
              onClick={() => window.api.openExternal("https://claude.ai/code")}
            >
              Open install page
            </Button>
            <Button variant="ghost" onClick={refresh}>
              Re-check
            </Button>
          </div>
        </div>
      )}

      <div className="flex justify-end mt-6">
        <Button onClick={onNext} disabled={!report || claudeMissing}>
          {allOk ? "Everything's ready" : "Install missing"}
        </Button>
      </div>
    </Card>
  );
}

function LocalInstall({ onNext }: { onNext: () => void }) {
  const [dockerResult, setDockerResult] = useState<ActionResult | null>(null);
  const [resourceResult, setResourceResult] = useState<ActionResult | null>(
    null,
  );
  const [mcpResult, setMcpResult] = useState<ActionResult | null>(null);
  const [running, setRunning] = useState(false);

  async function runAll() {
    setRunning(true);
    const d = await window.api.installDockerCli();
    setDockerResult(d);
    const r = await window.api.installDockResource();
    setResourceResult(r);
    if (r.ok) {
      const m = await window.api.registerDockMcp();
      setMcpResult(m);
    }
    setRunning(false);
  }

  const allDone =
    dockerResult?.ok && resourceResult?.ok && mcpResult?.ok && !running;

  return (
    <Card className="p-8">
      <StepHeader
        title="Install & register"
        subtitle="Install the Docker CLI if needed, drop the dock MCP server into place, and register it with Claude Code."
      />
      <div className="space-y-2">
        <InstallRow label="Docker CLI" result={dockerResult} running={running} />
        <InstallRow
          label="dock resource"
          result={resourceResult}
          running={running}
        />
        <InstallRow
          label="Register with Claude Code"
          result={mcpResult}
          running={running}
        />
      </div>
      <div className="flex justify-between mt-6">
        <Button variant="ghost" onClick={runAll} disabled={running}>
          {running ? "Working…" : dockerResult ? "Retry" : "Run install"}
        </Button>
        <Button onClick={onNext} disabled={!allDone}>
          Continue
        </Button>
      </div>
    </Card>
  );
}

function InstallRow({
  label,
  result,
  running,
}: {
  label: string;
  result: ActionResult | null;
  running: boolean;
}) {
  const status = !result
    ? running
      ? "checking"
      : "pending"
    : result.ok
      ? "ok"
      : "error";
  return (
    <StatusRow
      label={label}
      detail={result ? `${result.message}${result.detail ? ` — ${result.detail}` : ""}` : undefined}
      status={status as any}
    />
  );
}

function RemoteAsk({
  onSetup,
  onSkip,
}: {
  onSetup: () => void;
  onSkip: () => void;
}) {
  return (
    <Card className="p-10">
      <StepHeader
        title="Connect a remote host"
        subtitle="DockerBuddy can drive Docker on a Windows or Linux machine over SSH. If you only want to manage Docker on this Mac, skip ahead."
      />
      <div className="flex justify-between gap-3">
        <Button variant="ghost" onClick={onSkip}>
          I'll do this later
        </Button>
        <Button onClick={onSetup}>Set up a remote host</Button>
      </div>
    </Card>
  );
}

function RemoteSetup({
  onNext,
}: {
  onNext: (setup: SetupInstallerResult) => void;
}) {
  const [contextName, setContextName] = useState("homelab");
  const [platform, setPlatform] = useState<RemotePlatform>("windows");
  const [arch, setArch] = useState<"x64" | "arm64">("x64");
  const [sshPortText, setSshPortText] = useState("22");
  const [setup, setSetup] = useState<SetupInstallerResult | null>(null);
  const [generating, setGenerating] = useState(false);

  const isLinux = platform === "linux";
  const artifactNoun = isLinux ? "script" : "installer";
  const portNum = parseInt(sshPortText, 10);
  const portValid =
    Number.isFinite(portNum) && portNum >= 1 && portNum <= 65535;

  async function generate() {
    setGenerating(true);
    setSetup(null);
    const r = await window.api.generateSshKeyAndInstaller(
      contextName,
      platform,
      arch,
      portValid ? portNum : 22,
    );
    setSetup(r);
    setGenerating(false);
  }

  return (
    <Card className="p-8">
      <StepHeader
        title={isLinux ? "Generate the setup script" : "Generate the installer"}
        subtitle={
          isLinux
            ? "We'll build a one-shot shell script wired to a freshly generated SSH key. Copy it to the remote machine and run with sudo."
            : "We'll build a one-shot Windows installer (.exe) wired to a freshly generated SSH key. Copy it to the remote machine and double-click to run."
        }
      />

      <div className="grid grid-cols-2 gap-3 mb-3">
        <label className="block">
          <span className="text-sm text-whale-200/80">Context name</span>
          <input
            value={contextName}
            onChange={(e) => setContextName(e.target.value)}
            className="mt-1 w-full bg-navy-800 border border-navy-700 rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-whale-500"
            placeholder="homelab"
          />
        </label>
        <label className="block">
          <span className="text-sm text-whale-200/80">SSH port</span>
          <input
            value={sshPortText}
            onChange={(e) =>
              setSshPortText(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))
            }
            inputMode="numeric"
            className={`mt-1 w-full bg-navy-800 border rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:ring-2 ${
              portValid
                ? "border-navy-700 focus:ring-whale-500"
                : "border-rose-500/60 focus:ring-rose-500"
            }`}
            placeholder="22"
          />
          <span className="text-xs text-whale-200/40 mt-1 block">
            Default 22. Pick something else if port 22 is already in use on the
            remote host.
          </span>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <label className="block">
          <span className="text-sm text-whale-200/80">Platform</span>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as RemotePlatform)}
            className="mt-1 w-full bg-navy-800 border border-navy-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-whale-500"
          >
            <option value="windows">Windows 10 / 11</option>
            <option value="linux">Linux</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm text-whale-200/80">Architecture</span>
          <select
            value={arch}
            onChange={(e) => setArch(e.target.value as "x64" | "arm64")}
            className="mt-1 w-full bg-navy-800 border border-navy-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-whale-500"
          >
            <option value="x64">x64 (Intel/AMD)</option>
            <option value="arm64">arm64</option>
          </select>
        </label>
      </div>

      {!setup?.ok && (
        <Button
          onClick={generate}
          disabled={generating || !contextName.trim() || !portValid}
        >
          {generating
            ? isLinux ? "Building script…" : "Building installer…"
            : isLinux ? "Generate script" : "Generate installer"}
        </Button>
      )}

      {setup && setup.ok && (
        <div className="space-y-4 mt-2">
          <div className="rounded-2xl bg-navy-800/60 border border-navy-700/50 p-4 text-sm">
            <div className="text-whale-200/70 mb-1">
              {isLinux ? "Script" : "Installer"}
            </div>
            <div className="font-mono text-xs text-white break-all">
              {setup.installerPath}
            </div>
          </div>
          <div className="rounded-2xl bg-navy-800/60 border border-navy-700/50 p-4 text-sm">
            <div className="text-whale-200/70 mb-2">
              {isLinux ? (
                <>
                  Copy the .sh file to the Linux machine and run{" "}
                  <span className="font-mono text-white">
                    sudo bash ./{setup.installerPath.split("/").pop()}
                  </span>
                  . It will install openssh-server, enable the service, and
                  authorize this Mac's key for the invoking user.
                </>
              ) : (
                <>
                  Copy the .exe to the Windows machine and double-click it. It
                  will prompt for Administrator, install OpenSSH Server, open
                  TCP/22, and authorize this Mac's key.
                </>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => window.api.revealScript(setup.installerPath)}
              >
                Reveal {artifactNoun}
              </Button>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => onNext(setup)}>
              I've run the {artifactNoun} — continue
            </Button>
          </div>
        </div>
      )}

      {setup && !setup.ok && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 text-rose-200 px-4 py-3 text-sm mt-4">
          <div>{setup.message}</div>
          {setup.detail && (
            <div className="font-mono text-xs mt-2 whitespace-pre-wrap opacity-80">
              {setup.detail}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function RemoteTest({
  onNext,
  prior,
}: {
  onNext: () => void;
  prior: SetupInstallerResult | null;
}) {
  const [cfg, setCfg] = useState<RemoteConfig>({
    ip: "",
    username: "",
    contextName: prior?.contextName ?? "homelab",
    sshPort: prior?.sshPort ?? 22,
  });
  const [test, setTest] = useState<RemoteTestResult | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<ActionResult | null>(null);

  async function runTest() {
    setTest(null);
    const r = await window.api.testRemote(cfg);
    setTest(r);
  }
  async function createCtx() {
    setCreating(true);
    const r = await window.api.createRemoteContext(cfg);
    setCreated(r);
    setCreating(false);
  }

  return (
    <Card className="p-8">
      <StepHeader
        title="Test the connection"
        subtitle="Tell us how to reach the remote host. We'll verify SSH + Docker, then add it as a Docker context."
      />

      <div className="grid grid-cols-3 gap-3 mb-5">
        <TextField
          label="Host / IP"
          value={cfg.ip}
          onChange={(v) => setCfg({ ...cfg, ip: v })}
          placeholder="192.168.1.10"
        />
        <TextField
          label="Username"
          value={cfg.username}
          onChange={(v) => setCfg({ ...cfg, username: v })}
          placeholder="Administrator"
        />
        <TextField
          label="SSH port"
          value={String(cfg.sshPort ?? 22)}
          onChange={(v) => {
            const n = parseInt(v.replace(/[^0-9]/g, "").slice(0, 5), 10);
            setCfg({ ...cfg, sshPort: Number.isFinite(n) ? n : 22 });
          }}
          placeholder="22"
        />
      </div>

      <div className="flex gap-2 mb-4">
        <Button variant="secondary" onClick={runTest} disabled={!cfg.ip || !cfg.username}>
          Test SSH
        </Button>
        {test?.ok && !created?.ok && (
          <Button onClick={createCtx} disabled={creating}>
            {creating ? "Creating…" : "Create Docker context"}
          </Button>
        )}
      </div>

      {test && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm mb-3 ${
            test.ok
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
              : "border-rose-500/40 bg-rose-500/10 text-rose-200"
          }`}
        >
          {test.ok
            ? `Connected. ${test.dockerVersion ?? ""} ${test.os ?? ""}`
            : `Failed: ${test.error}`}
        </div>
      )}

      {created && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm mb-3 ${
            created.ok
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
              : "border-rose-500/40 bg-rose-500/10 text-rose-200"
          }`}
        >
          {created.message}
          {created.detail && <div className="font-mono text-xs mt-1">{created.detail}</div>}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={!created?.ok}>
          Done
        </Button>
      </div>
    </Card>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm text-whale-200/80">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full bg-navy-800 border border-navy-700 rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-whale-500"
      />
    </label>
  );
}

function Done({
  onOpen,
  onAnother,
}: {
  onOpen: () => void;
  onAnother?: () => void;
}) {
  return (
    <Card className="p-10">
      <div className="flex flex-col items-center text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          You're all set.
        </h1>
        <p className="text-whale-200/80 mt-3 text-sm leading-relaxed max-w-prose">
          DockerBuddy is wired up. Open the dashboard to watch Claude's commands
          flow through Docker in real time.
        </p>
        <div className="flex gap-3 mt-8">
          <Button onClick={onOpen}>Open dashboard</Button>
          {onAnother && (
            <Button variant="secondary" onClick={onAnother}>
              Set up another connection
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
