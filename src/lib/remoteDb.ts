import { Redis } from '@upstash/redis';

// Esto conectará automáticamente usando las variables de entorno de Vercel
export const remoteDb = Redis.fromEnv();

// Usaremos una "key" base para tus sesiones
export const SESSIONS_KEY = 'chinchin_inventory_sessions';