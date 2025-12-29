interface IElectronAPI {
  openDbFile: () => Promise<Uint8Array | null>;
}

declare global {
  interface Window {
    electronAPI?: IElectronAPI;
  }
  // Declaraciones para process.env en el contexto de Node.js (para API Routes)
  namespace NodeJS {
    interface ProcessEnv {
      KV_REST_API_URL: string;
      KV_REST_API_TOKEN: string;
    }
  }
}