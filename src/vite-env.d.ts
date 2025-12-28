/// <reference types="vite/client" />

interface IElectronAPI {
  openDbFile: () => Promise<Uint8Array | null>;
}

declare global {
  interface Window {
    electronAPI?: IElectronAPI;
  }
}