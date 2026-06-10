import path from "node:path";
import os from "node:os";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { app } from "electron";
import { run } from "./exec.js";
import type { ActionResult } from "../shared.js";

const SSHD_CONFIG = "C:\\ProgramData\\ssh\\sshd_config";

function normalizePort(p: number | undefined): number {
  const n = Math.trunc(Number(p));
  if (!Number.isFinite(n) || n < 1 || n > 65535) return 22;
  return n;
}

export function getServerSshPort(): number {
  if (process.platform !== "win32") return 22;
  if (!existsSync(SSHD_CONFIG)) return 22;
  try {
    const txt = readFileSync(SSHD_CONFIG, "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*Port\s+(\d+)\s*$/);
      if (m) return normalizePort(parseInt(m[1], 10));
    }
  } catch {
    // ignore — fall through to default
  }
  return 22;
}

function renderChangePortScript(port: number): string {
  return `# DockerBuddy — change sshd port to ${port}
$ErrorActionPreference = 'Stop'
$port = ${port}
$logPath = Join-Path $env:TEMP 'dockerbuddy-port-change.log'
function Write-Log([string]$msg) {
  try { Add-Content -Path $logPath -Value ("[{0}] {1}" -f (Get-Date -Format o), $msg) } catch {}
}
Write-Log "Changing sshd port to $port"

$sshdConfig = 'C:\\ProgramData\\ssh\\sshd_config'
$sshdDir = Split-Path $sshdConfig -Parent
if (-not (Test-Path $sshdDir)) { New-Item -ItemType Directory -Path $sshdDir -Force | Out-Null }
if (-not (Test-Path $sshdConfig)) { New-Item -ItemType File -Path $sshdConfig -Force | Out-Null }

$cfgLines = Get-Content -Path $sshdConfig -ErrorAction SilentlyContinue
if (-not $cfgLines) { $cfgLines = @() }
$portWanted = "Port $port"
$hasMatchingPort = $false
$newLines = New-Object System.Collections.Generic.List[string]
foreach ($line in $cfgLines) {
  if ($line -match '^\\s*#?\\s*Port\\s+\\d+\\s*$') {
    if (-not $hasMatchingPort) {
      $newLines.Add($portWanted) | Out-Null
      $hasMatchingPort = $true
    }
  } else {
    $newLines.Add($line) | Out-Null
  }
}
if (-not $hasMatchingPort) { $newLines.Add($portWanted) | Out-Null }
Set-Content -Path $sshdConfig -Value $newLines -Encoding ASCII
Write-Log "sshd_config updated"

$ruleName = "DockerBuddy SSH ($port)"
Get-NetFirewallRule -DisplayName 'DockerBuddy SSH*' -ErrorAction SilentlyContinue |
  Remove-NetFirewallRule -ErrorAction SilentlyContinue
$defaultRule = Get-NetFirewallRule -Name 'sshd' -ErrorAction SilentlyContinue
if ($defaultRule) {
  if ($port -eq 22) {
    Set-NetFirewallRule -Name 'sshd' -Enabled True -Direction Inbound -Action Allow
    Set-NetFirewallRule -Name 'sshd' -Protocol TCP -LocalPort 22 -ErrorAction SilentlyContinue
  } else {
    Disable-NetFirewallRule -Name 'sshd' -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName $ruleName -Enabled True -Direction Inbound \`
      -Protocol TCP -Action Allow -LocalPort $port | Out-Null
  }
} else {
  $allowName = if ($port -eq 22) { 'sshd' } else { $ruleName }
  New-NetFirewallRule -Name $allowName -DisplayName "OpenSSH Server (sshd $port)" \`
    -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort $port | Out-Null
}
Write-Log "Firewall rules updated"

Restart-Service sshd -Force
Write-Log "sshd restarted on port $port"
exit 0
`;
}

export async function changeServerSshPort(
  rawPort: number,
): Promise<ActionResult> {
  if (process.platform !== "win32") {
    return {
      ok: false,
      message: "Server port change is only supported on Windows.",
    };
  }
  const port = normalizePort(rawPort);
  if (port !== Math.trunc(Number(rawPort))) {
    return {
      ok: false,
      message: "Port must be an integer between 1 and 65535.",
    };
  }

  const tmpDir = path.join(app.getPath("temp"), `dockerbuddy-port-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  const scriptPath = path.join(tmpDir, "change-port.ps1");
  writeFileSync(scriptPath, renderChangePortScript(port), "utf8");

  // Self-elevate via Start-Process -Verb RunAs. The outer PowerShell launches
  // an elevated child, waits for it, and forwards its exit code.
  const launcher = [
    "$p = Start-Process powershell.exe",
    "-ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',",
    `'${scriptPath.replace(/'/g, "''")}'`,
    ") -Verb RunAs -Wait -PassThru;",
    "exit $p.ExitCode",
  ].join(" ");

  const r = await run("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    launcher,
  ]);

  if (!r.ok) {
    return {
      ok: false,
      message: "Couldn't change sshd port.",
      detail:
        (r.stderr || r.stdout).split("\n").slice(-6).join("\n") ||
        `Exit code ${r.code}`,
    };
  }

  const verified = getServerSshPort();
  if (verified !== port) {
    return {
      ok: false,
      message: `sshd_config still reports port ${verified}, expected ${port}.`,
      detail: `Check ${path.join(os.tmpdir(), "dockerbuddy-port-change.log")}`,
    };
  }

  return {
    ok: true,
    message: `sshd now listening on port ${port}.`,
    detail: "Update your controller's ~/.ssh/config Port line to match.",
  };
}
