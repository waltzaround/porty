import { contextBridge, ipcRenderer } from "electron";
import type { PortyAPI } from "../shared/types";
const api: PortyAPI = {
  scan: () => ipcRenderer.invoke("porty:scan"),
  openExternal: (url) => ipcRenderer.invoke("porty:external", url),
  platform: process.platform,
};
contextBridge.exposeInMainWorld("porty", api);
