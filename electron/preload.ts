import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  openDbFile: (): Promise<Uint8Array | null> => ipcRenderer.invoke("open-db-file"),
});