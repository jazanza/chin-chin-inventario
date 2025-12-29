/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
  // Añadir las variables de entorno de Vercel para el cliente si fueran necesarias,
  // aunque ahora se accederán principalmente en la API Route.
  // Si se necesita acceder a ellas en el cliente (ej. para un fallback o debug),
  // deberían ser prefijadas con VITE_ y declaradas aquí.
  // Por ejemplo:
  // readonly VITE_KV_REST_API_URL: string;
  // readonly VITE_KV_REST_API_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}