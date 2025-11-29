import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getDbBuffer: (): Promise<Uint8Array | null> => ipcRenderer.invoke("get-db-buffer"),
  onDbUpdate: (callback: () => void) => {
    ipcRenderer.on("db-file-updated", () => callback());
  },
});