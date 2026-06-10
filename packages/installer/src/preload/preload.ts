import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

type Listener<T> = (payload: T) => void;

function subscribe<T>(channel: string, cb: Listener<T>): () => void {
  const wrapped = (_e: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const api = {
  checkPrereqs: () => ipcRenderer.invoke("checkPrereqs"),
  installDockerCli: () => ipcRenderer.invoke("installDockerCli"),
  installDockResource: () => ipcRenderer.invoke("installDockResource"),
  registerDockMcp: () => ipcRenderer.invoke("registerDockMcp"),
  installClaudeContext: () => ipcRenderer.invoke("installClaudeContext"),
  revealClaudeContext: () => ipcRenderer.invoke("revealClaudeContext"),
  generateSshKeyAndScript: (ctxName: string) =>
    ipcRenderer.invoke("generateSshKeyAndScript", ctxName),
  generateSshKeyAndInstaller: (
    ctxName: string,
    platform: string,
    arch: string,
    sshPort: number,
  ) =>
    ipcRenderer.invoke(
      "generateSshKeyAndInstaller",
      ctxName,
      platform,
      arch,
      sshPort,
    ),
  revealScript: (p: string) => ipcRenderer.invoke("revealScript", p),
  testRemote: (cfg: unknown) => ipcRenderer.invoke("testRemote", cfg),
  createRemoteContext: (cfg: unknown) =>
    ipcRenderer.invoke("createRemoteContext", cfg),
  openExternal: (url: string) => ipcRenderer.invoke("openExternal", url),
  getServerSshPort: () => ipcRenderer.invoke("getServerSshPort"),
  changeServerSshPort: (port: number) =>
    ipcRenderer.invoke("changeServerSshPort", port),
  rotateTelemetryToken: () => ipcRenderer.invoke("rotateTelemetryToken"),
  removeRemoteContext: (name: string) =>
    ipcRenderer.invoke("removeRemoteContext", name),
  unpairFromController: () => ipcRenderer.invoke("unpairFromController"),

  dashboardSnapshot: () => ipcRenderer.invoke("dashboardSnapshot"),
  onTelemetryCmd: (cb: Listener<unknown>) => subscribe("telemetry:cmd", cb),
  onDockerStats: (cb: Listener<unknown>) => subscribe("docker:stats", cb),
  onDockerEvent: (cb: Listener<unknown>) => subscribe("docker:event", cb),
  onDockerInfo: (cb: Listener<unknown>) => subscribe("docker:info", cb),
  onHostMetrics: (cb: Listener<unknown>) => subscribe("host:metrics", cb),
  onRemoteMetrics: (cb: Listener<unknown>) => subscribe("remote:metrics", cb),
  onUpdaterState: (cb: Listener<unknown>) => subscribe("updater:state", cb),
};

contextBridge.exposeInMainWorld("api", api);
