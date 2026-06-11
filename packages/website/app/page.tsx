import Image from "next/image";
import Link from "next/link";

const GH_RELEASES = "https://github.com/DrPiggins/dockerbuddy/releases/latest";
const VERSION = "1.0.3";
const DMG_ARM64_URL = `${GH_RELEASES}/download/DockerBuddy-${VERSION}-arm64.dmg`;
const DMG_X64_URL = `${GH_RELEASES}/download/DockerBuddy-${VERSION}-x64.dmg`;
const EXE_URL = `${GH_RELEASES}/download/DockerBuddy-Windows-x64.exe`;
const EXE_ARM_URL = `${GH_RELEASES}/download/DockerBuddy-Windows-arm64.exe`;
const APPIMAGE_URL = `${GH_RELEASES}/download/DockerBuddy-${VERSION}-x86_64.AppImage`;

export default function Page() {
  return (
    <div className="relative">
      <Nav />
      <Hero />
      <Features />
      <HowItWorks />
      <Personas />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <nav className="sticky top-0 z-30 border-b border-border-soft bg-bg/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/brand/wordmark.png"
            alt="DockerBuddy"
            width={194}
            height={53}
            priority
            className="h-9 w-auto"
          />
        </Link>
        <div className="flex items-center gap-2 sm:gap-4">
          <a
            href="https://github.com/DrPiggins/dockerbuddy"
            className="hidden text-sm text-muted transition hover:text-foreground sm:inline"
          >
            GitHub
          </a>
          <a
            href="#download"
            className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-bg transition hover:bg-primary-hover"
          >
            Download
          </a>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto max-w-5xl px-6 pt-20 pb-24 text-center sm:pt-28 sm:pb-32">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-4 py-1.5 text-xs text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          v1.0 — free while in beta
        </div>
        <h1 className="text-balance font-semibold tracking-tight text-foreground text-4xl leading-[1.1] sm:text-6xl sm:leading-[1.05]">
          Claude Code, meet Docker.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted sm:text-xl">
          DockerBuddy plugs Docker into Claude Code. Optionally pair a second
          machine and Claude can drive Docker on either one.
        </p>

        <div
          id="download"
          className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <a
            href={DMG_ARM64_URL}
            className="group inline-flex w-full max-w-xs items-center justify-center gap-3 rounded-xl bg-primary px-6 py-3.5 font-medium text-bg transition hover:bg-primary-hover sm:w-auto"
          >
            <AppleGlyph />
            Download for Mac
          </a>
          <a
            href={EXE_URL}
            className="group inline-flex w-full max-w-xs items-center justify-center gap-3 rounded-xl border border-border bg-surface px-6 py-3.5 font-medium text-foreground transition hover:bg-surface-hover sm:w-auto"
          >
            <WindowsGlyph />
            Download for Windows
          </a>
        </div>

        <div className="mt-4 text-xs text-muted-soft">
          <a
            href={DMG_X64_URL}
            className="underline decoration-dotted underline-offset-4 hover:text-muted"
          >
            Intel Mac
          </a>
          {" · "}
          <a
            href={EXE_ARM_URL}
            className="underline decoration-dotted underline-offset-4 hover:text-muted"
          >
            Windows arm64
          </a>
          {" · "}
          <a
            href={APPIMAGE_URL}
            className="underline decoration-dotted underline-offset-4 hover:text-muted"
          >
            Linux
          </a>
          {" · "}
          requires{" "}
          <a
            href="https://www.docker.com/products/docker-desktop/"
            className="underline decoration-dotted underline-offset-4 hover:text-muted"
          >
            Docker Desktop
          </a>{" "}
          and{" "}
          <a
            href="https://claude.com/claude-code"
            className="underline decoration-dotted underline-offset-4 hover:text-muted"
          >
            Claude Code
          </a>
        </div>
      </div>

      <DashboardMock />
    </section>
  );
}

function DashboardMock() {
  return (
    <div className="mx-auto max-w-5xl px-6 pb-16">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_30px_80px_-30px_rgba(111,180,229,0.3)]">
        <div className="flex items-center gap-2 border-b border-border-soft bg-bg-soft px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          <span className="ml-3 text-xs text-muted-soft">DockerBuddy</span>
        </div>
        <div className="grid gap-6 p-6 sm:grid-cols-2">
          <MockTile
            title="Local"
            host="MacBook Pro"
            metrics={[
              { label: "CPU", value: "12%" },
              { label: "Memory", value: "9.1 / 24 GB" },
              { label: "Containers", value: "3 running" },
            ]}
          />
          <MockTile
            title="Paired"
            host="HomeLab"
            metrics={[
              { label: "CPU", value: "47%" },
              { label: "Memory", value: "11.4 / 32 GB" },
              { label: "Containers", value: "5 running" },
            ]}
            highlight
          />
        </div>
        <div className="border-t border-border-soft bg-bg-soft px-6 py-5">
          <div className="mb-3 flex flex-wrap items-center gap-4">
            <span className="text-[10px] uppercase tracking-wider text-muted-soft">
              Latency
            </span>
            <LatencyChip dest="Local Docker" value="34ms" local />
            <LatencyChip dest="HomeLab" value="11.2s" />
          </div>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-medium text-foreground">Command flow</h4>
            <span className="text-xs text-muted-soft">live</span>
          </div>
          <div className="space-y-2 font-mono text-xs">
            <LogRow time="14:22:11" tool="exec" target="HomeLab · dev-runner" ok />
            <LogRow time="14:22:08" tool="ps" target="local" ok />
            <LogRow time="14:21:54" tool="run_cached" target="HomeLab · dev-runner" ok />
            <LogRow time="14:21:39" tool="logs" target="local · postgres" ok />
          </div>
        </div>
      </div>
    </div>
  );
}

function MockTile({
  title,
  host,
  metrics,
  highlight = false,
}: {
  title: string;
  host: string;
  metrics: { label: string; value: string }[];
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight
          ? "border-primary/40 bg-primary/[0.06]"
          : "border-border-soft bg-bg-soft"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-soft">
          {title}
        </span>
        <span className="text-sm text-foreground">{host}</span>
      </div>
      <div className="space-y-1.5">
        {metrics.map((m) => (
          <div key={m.label} className="flex justify-between text-sm">
            <span className="text-muted">{m.label}</span>
            <span className="text-foreground">{m.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LatencyChip({
  dest,
  value,
  local = false,
}: {
  dest: string;
  value: string;
  local?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`h-1.5 w-1.5 rounded-full ${local ? "bg-[#7ed18b]" : "bg-primary"}`}
      />
      <span className="text-xs text-muted">{dest}</span>
      <span className="font-mono text-xs text-foreground">{value}</span>
    </div>
  );
}

function LogRow({
  time,
  tool,
  target,
  ok,
}: {
  time: string;
  tool: string;
  target: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center gap-3 text-muted">
      <span className="text-muted-soft">{time}</span>
      <span className="rounded bg-surface px-1.5 py-0.5 text-primary">
        {tool}
      </span>
      <span className="truncate">{target}</span>
      <span className={`ml-auto ${ok ? "text-[#7ed18b]" : "text-[#ff8e8e]"}`}>
        {ok ? "ok" : "fail"}
      </span>
    </div>
  );
}

function Features() {
  const items = [
    {
      icon: <SparkGlyph />,
      title: "Docker as a first-class tool in Claude Code",
      body: "Claude can list containers, stream logs, exec into shells, and drive Compose — all through a typed MCP server that DockerBuddy installs and registers for you.",
    },
    {
      icon: <CloudGlyph />,
      title: "Pair a second machine (optional)",
      body: "Got a homelab box or a beefy desktop? Pair it and DockerBuddy wires up a docker context over SSH — so you can have Claude run containers on it, not just your laptop.",
    },
    {
      icon: <FlowGlyph />,
      title: "See every container call as it happens",
      body: "Live Command Flow shows every Docker action Claude takes. Spot loops, retries, and slow calls without tailing logs by hand.",
    },
  ];
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <div className="grid gap-6 md:grid-cols-3">
        {items.map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-border bg-surface/40 p-6 transition hover:bg-surface"
          >
            <div className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
              {f.icon}
            </div>
            <h3 className="mb-2 text-lg font-medium text-foreground">{f.title}</h3>
            <p className="text-sm leading-relaxed text-muted">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <div className="mb-12 max-w-2xl">
        <p className="mb-3 text-sm uppercase tracking-wider text-primary">
          How it works
        </p>
        <h2 className="text-balance text-3xl font-semibold text-foreground sm:text-4xl">
          One binary. Two roles. Zero config drift.
        </h2>
        <p className="mt-4 text-muted">
          DockerBuddy ships as a single app. On the machine running Claude Code
          it's the controller. Drop a <code className="font-mono text-muted">paired.json</code>
          on any other machine — Mac, Windows, or Linux — and the same binary
          flips into a paired host that mirrors the dashboard and accepts work
          from the controller. Controller and paired host can be any combination
          of platforms.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <RoleCard
          tag="Controller"
          tagColor="text-primary"
          title="Wherever Claude Code lives"
          rows={[
            "Hosts the dock MCP server Claude Code calls",
            "Runs the setup wizard, manages contexts",
            "Streams live metrics + Command flow",
          ]}
        />
        <RoleCard
          tag="Paired host (optional)"
          tagColor="text-accent"
          title="Any other machine on your network"
          rows={[
            "Reachable as a Docker context Claude can target",
            "Mirrors the controller dashboard over LAN",
            "Bring your own containers — DockerBuddy is the pipe",
          ]}
        />
      </div>

      <p className="mt-10 text-center text-sm text-muted-soft">
        Role is decided by one file. Drop a <code className="font-mono text-muted">paired.json</code> on a machine and it boots as a paired host. Delete it and it's a controller again.
      </p>
    </section>
  );
}

function RoleCard({
  tag,
  tagColor,
  title,
  rows,
}: {
  tag: string;
  tagColor: string;
  title: string;
  rows: string[];
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface/40 p-6">
      <p className={`mb-2 text-xs font-medium uppercase tracking-wider ${tagColor}`}>
        {tag}
      </p>
      <h3 className="mb-5 text-xl font-medium text-foreground">{title}</h3>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r} className="flex gap-3 text-sm text-muted">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Personas() {
  const items = [
    {
      title: "The dev with a basement PC",
      body: "You've got a beefy desktop sitting idle. Pair it once and you can ask Claude to run the build over there instead of cooking your laptop.",
    },
    {
      title: "The fan-noise refugee",
      body: "Your laptop's been on max RPM since Tuesday. Move the dev server to a paired box and your machine goes quiet.",
    },
    {
      title: "The Compose orchestrator",
      body: "You've got six containers across three contexts. DockerBuddy gives Claude a single, typed interface to all of them.",
    },
  ];
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <div className="mb-12">
        <p className="mb-3 text-sm uppercase tracking-wider text-primary">
          Built for
        </p>
        <h2 className="text-balance text-3xl font-semibold text-foreground sm:text-4xl">
          The people Docker keeps yelling at.
        </h2>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {items.map((p) => (
          <div
            key={p.title}
            className="rounded-2xl border border-border bg-surface/40 p-6"
          >
            <h3 className="mb-3 text-lg font-medium text-foreground">{p.title}</h3>
            <p className="text-sm leading-relaxed text-muted">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Faq() {
  const items = [
    {
      q: "Do I need Docker installed?",
      a: "Yes — DockerBuddy drives Docker, it doesn't replace it. The setup wizard will offer to install Docker Desktop if it's missing.",
    },
    {
      q: "Does it work without Claude Code?",
      a: "The dashboard and paired-host features work standalone. The MCP integration only lights up if you have Claude Code installed.",
    },
    {
      q: "Mac only?",
      a: "DockerBuddy ships for macOS, Windows, and Linux. Any combination of those can be controller or paired host.",
    },
    {
      q: "Is it open source?",
      a: "Yes. The full source — installer, dashboard, and the dock MCP server — is on GitHub.",
    },
    {
      q: "How does the pairing actually work?",
      a: "The controller generates an SSH keypair and a setup script. Run the script on the other machine. From then on, DockerBuddy uses docker context over SSH; everything else flows over a token-authenticated HTTP channel on your LAN.",
    },
    {
      q: "What about updates?",
      a: "DockerBuddy checks for new releases on launch and downloads them in the background. You get a prompt to restart when one's ready.",
    },
  ];
  return (
    <section className="mx-auto max-w-3xl px-6 py-24">
      <h2 className="mb-10 text-balance text-3xl font-semibold text-foreground sm:text-4xl">
        Questions worth answering.
      </h2>
      <div className="space-y-6">
        {items.map((item) => (
          <div
            key={item.q}
            className="rounded-xl border border-border-soft bg-surface/30 p-5"
          >
            <h3 className="mb-2 font-medium text-foreground">{item.q}</h3>
            <p className="text-sm leading-relaxed text-muted">{item.a}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden border-y border-border-soft bg-bg-soft">
      <div className="mx-auto max-w-4xl px-6 py-20 text-center">
        <h2 className="text-balance text-3xl font-semibold text-foreground sm:text-4xl">
          Stop melting your laptop.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-muted">
          Install DockerBuddy in two minutes. Pair a second machine in five.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={DMG_ARM64_URL}
            className="inline-flex w-full max-w-xs items-center justify-center gap-3 rounded-xl bg-primary px-6 py-3.5 font-medium text-bg transition hover:bg-primary-hover sm:w-auto"
          >
            <AppleGlyph />
            Download for Mac
          </a>
          <a
            href={EXE_URL}
            className="inline-flex w-full max-w-xs items-center justify-center gap-3 rounded-xl border border-border bg-surface px-6 py-3.5 font-medium text-foreground transition hover:bg-surface-hover sm:w-auto"
          >
            <WindowsGlyph />
            Download for Windows
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border-soft">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 text-sm text-muted-soft sm:flex-row">
        <div className="flex items-center gap-2">
          <Image
            src="/brand/wordmark.png"
            alt="DockerBuddy"
            width={150}
            height={41}
            className="h-7 w-auto opacity-80"
          />
        </div>
        <div className="flex items-center gap-6">
          <a
            href="https://github.com/DrPiggins/dockerbuddy"
            className="transition hover:text-foreground"
          >
            GitHub
          </a>
          <a
            href={GH_RELEASES}
            className="transition hover:text-foreground"
          >
            Releases
          </a>
          <a
            href="mailto:hi@dockerbuddy.com"
            className="transition hover:text-foreground"
          >
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}

function AppleGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M17.05 12.04c-.02-2.13 1.74-3.15 1.82-3.2-.99-1.45-2.54-1.65-3.09-1.67-1.32-.13-2.57.77-3.24.77-.67 0-1.7-.75-2.79-.73-1.44.02-2.76.83-3.5 2.11-1.49 2.59-.38 6.42 1.07 8.52.71 1.03 1.55 2.18 2.65 2.14 1.06-.04 1.46-.69 2.74-.69 1.28 0 1.64.69 2.76.67 1.14-.02 1.86-1.04 2.56-2.07.81-1.18 1.14-2.33 1.16-2.39-.03-.01-2.22-.85-2.24-3.39M14.97 5.6c.58-.7.97-1.68.86-2.65-.83.03-1.84.55-2.45 1.25-.54.62-1.02 1.61-.89 2.57.93.07 1.88-.47 2.48-1.17" />
    </svg>
  );
}

function WindowsGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M3 5.55 10.31 4.5v6.83H3zM3 12.67h7.31v6.83L3 18.45zm8.31-8.17L21 3v8.33h-9.69zm0 8.17H21V21l-9.69-1.5z" />
    </svg>
  );
}

function SparkGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 13.5 8.5 19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z" />
      <path d="M19 16l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" opacity="0.5" />
    </svg>
  );
}

function CloudGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.5 17H7a4 4 0 1 1 .76-7.93A6 6 0 0 1 19.6 11.04 3.5 3.5 0 0 1 17.5 17z" />
      <path d="M9 14l3-3 3 3" />
      <path d="M12 11v6" />
    </svg>
  );
}

function FlowGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6h10" />
      <path d="M4 12h16" />
      <path d="M4 18h7" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="22" cy="12" r="0" />
      <circle cx="15" cy="18" r="2" />
    </svg>
  );
}
