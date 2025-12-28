import { Redis } from '@upstash/redis';

// Esto conectará usando las variables de entorno de Vite
export const remoteDb = new Redis({
  url: import.meta.env.VITE_UPSTASH_REDIS_REST_URL as string,
  token: import.meta.env.VITE_UPSTASH_REDIS_REST_TOKEN as string,
});

// Usaremos una "key" base para tus sesiones
export const SESSIONS_KEY = 'chinchin_inventory_sessions';