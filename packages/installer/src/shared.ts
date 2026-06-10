export type PrereqKey =
  | "brew"
  | "node"
  | "docker"
  | "claudeCode"
  | "dockMcp";

export type PrereqState = "checking" | "ok" | "missing" | "error";

export interface PrereqReport {
  key: PrereqKey;
  label: string;
  detail?: string;
  state: PrereqState;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  detail?: string;
}

export interface RemoteConfig {
  ip: string;
  username: string;
  contextName: string;
  sshPort?: number;
}

export interface SetupScriptResult {
  ok: boolean;
  scriptPath: string;
  pubkey: string;
  contextName: string;
  message?: string;
}

export type RemotePlatform = "windows" | "linux";
export type RemoteArch = "x64" | "arm64";

export interface SetupInstallerResult {
  ok: boolean;
  installerPath: string;
  platform: RemotePlatform;
  pubkey: string;
  contextName: string;
  sshPort: number;
  message?: string;
  detail?: string;
}

export interface RemoteTestResult {
  ok: boolean;
  dockerVersion?: string;
  os?: string;
  error?: string;
}

export interface PairedInfo {
  contextName: string;
  macHost: string;
  macIp: string;
  pairedAt: string;
}

export interface ContextEntry {
  name: string;
  ip: string;
  username: string;
  sshPort: number;
  createdAt: string;
}

export interface DashboardSnapshot {
  recentEvents: CommandEvent[];
  configured: boolean;
  telemetryToken: string;
  listenPort: number;
  paired: PairedInfo | null;
  platform: NodeJS.Platform;
  contexts: ContextEntry[];
}

export interface CommandEvent {
  tool: string;
  args?: Record<string, unknown>;
  durationMs: number;
  ok: boolean;
  error?: string;
  timestamp: string;
  machine: string;
}

export interface ContainerStat {
  id: string;
  name: string;
  image?: string;
  cpuPerc: string;
  memUsage: string;
  memPerc: string;
  netIO: string;
  blockIO: string;
  pids: string;
}

export interface DockerInfoSnapshot {
  ok: boolean;
  error?: string;
  serverVersion?: string;
  operatingSystem?: string;
  containers?: number;
  containersRunning?: number;
  containersPaused?: number;
  containersStopped?: number;
  images?: number;
  ncpu?: number;
  memTotal?: number;
  kernelVersion?: string;
}

export interface HostMetrics {
  cpu: { percent: number; cores: number };
  memory: { used: number; total: number; percent: number };
  // Disk activity, not space. busyPercent is 0-100 (real perf counter on
  // Windows; IOPS-scaled approximation on macOS). Space used/free will live
  // on the future details page.
  disk: { busyPercent: number; iops: number } | null;
  network: { rx: number; tx: number; iface: string } | null;
  uptime: number;
}

export interface RemoteHostMetrics {
  name: string;
  ok: boolean;
  error?: string;
  metrics?: HostMetrics;
}

export interface DockerEventPayload {
  type?: string;
  Type?: string;
  action?: string;
  Action?: string;
  actor?: { id?: string; attributes?: Record<string, string> };
  Actor?: { ID?: string; Attributes?: Record<string, string> };
  time?: number;
  timeNano?: number;
  status?: string;
  id?: string;
  from?: string;
}

export interface Api {
  checkPrereqs(): Promise<PrereqReport[]>;
  installDockerCli(): Promise<ActionResult>;
  installDockResource(): Promise<ActionResult>;
  registerDockMcp(): Promise<ActionResult>;
  installClaudeContext(): Promise<ActionResult>;
  revealClaudeContext(): Promise<void>;
  generateSshKeyAndScript(contextName: string): Promise<SetupScriptResult>;
  generateSshKeyAndInstaller(
    contextName: string,
    platform: RemotePlatform,
    arch: RemoteArch,
    sshPort: number,
  ): Promise<SetupInstallerResult>;
  revealScript(path: string): Promise<void>;
  testRemote(cfg: RemoteConfig): Promise<RemoteTestResult>;
  createRemoteContext(cfg: RemoteConfig): Promise<ActionResult>;
  openExternal(url: string): Promise<void>;
  getServerSshPort(): Promise<number>;
  changeServerSshPort(port: number): Promise<ActionResult>;
  rotateTelemetryToken(): Promise<ActionResult>;
  removeRemoteContext(name: string): Promise<ActionResult>;
  unpairFromController(): Promise<ActionResult>;

  dashboardSnapshot(): Promise<DashboardSnapshot>;
  onTelemetryCmd(cb: (e: CommandEvent) => void): () => void;
  onDockerStats(cb: (s: ContainerStat[]) => void): () => void;
  onDockerEvent(cb: (e: DockerEventPayload) => void): () => void;
  onDockerInfo(cb: (i: DockerInfoSnapshot) => void): () => void;
  onHostMetrics(cb: (m: HostMetrics) => void): () => void;
  onRemoteMetrics(cb: (m: RemoteHostMetrics) => void): () => void;
}

declare global {
  interface Window {
    api: Api;
  }
}
