import { contextBridge, ipcRenderer } from "electron";
import type { PortyAPI } from "../shared/types";
const api: PortyAPI = {
  scan: () => ipcRenderer.invoke("porty:scan"),
  openExternal: (url) => ipcRenderer.invoke("porty:external", url),
  platform: process.platform,
  ready: () => ipcRenderer.invoke('porty:ready'),
  reportIssue: issue => ipcRenderer.invoke('porty:issue', issue),
  history: () => ipcRenderer.invoke('porty:history'),
  clearHistory: () => ipcRenderer.invoke('porty:clear-history'),
  setMonitoring: enabled => ipcRenderer.invoke('porty:monitoring', enabled),
  onUpdate: callback => {
    const listener = (_event: Electron.IpcRendererEvent, update: import('../shared/events').MonitorUpdate) => callback(update);
    ipcRenderer.on('porty:update', listener);
    return () => { ipcRenderer.removeListener('porty:update', listener); };
  },
};
contextBridge.exposeInMainWorld("porty", api);
