import { Redis } from '@upstash/redis';
import type { InventorySession } from '@/lib/persistence'; // Importar la interfaz

// Inicializar el cliente de Redis usando las variables de entorno de Vercel
// Estas variables NO deben ser prefijadas con VITE_ para las funciones serverless
const remoteDb = new Redis({
  url: process.env.KV_REST_API_URL as string,
  token: process.env.KV_REST_API_TOKEN as string,
});

// Usaremos una "key" base para tus sesiones
const SESSIONS_KEY = 'chinchin_inventory_sessions';

// Handler para la API Route
export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method === 'GET') {
      // Recuperar todas las sesiones
      const cloudSessions: Record<string, InventorySession> | null = await remoteDb.hgetall(SESSIONS_KEY);
      return new Response(JSON.stringify(cloudSessions || {}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else if (req.method === 'POST') {
      // Guardar/actualizar una sesión
      const sessionData: InventorySession = await req.json();
      if (!sessionData || !sessionData.dateKey) {
        return new Response(JSON.stringify({ error: 'Invalid session data' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      await remoteDb.hset(SESSIONS_KEY, {
        [sessionData.dateKey]: sessionData
      });
      return new Response(JSON.stringify({ message: 'Session saved successfully' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else if (req.method === 'DELETE') {
      // Eliminar una sesión
      const { dateKey } = await req.json();
      if (!dateKey) {
        return new Response(JSON.stringify({ error: 'Missing dateKey for deletion' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      await remoteDb.hdel(SESSIONS_KEY, dateKey);
      return new Response(JSON.stringify({ message: `Session ${dateKey} deleted successfully` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (error: any) {
    console.error("API Route Error:", error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}