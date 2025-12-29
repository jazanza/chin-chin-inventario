import { createClient } from '@supabase/supabase-js';

// Tipos para las variables de entorno
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Obtener las variables de entorno
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validar que las variables de entorno estén presentes
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing. Supabase features will be disabled.');
}

// Crear el cliente de Supabase solo si las variables están presentes
export const supabase = supabaseUrl && supabaseAnonKey ? 
  createClient(supabaseUrl, supabaseAnonKey) : 
  null;

// Verificar si el cliente se creó correctamente
if (supabase) {
  console.log('Supabase client initialized successfully.');
} else {
  console.warn('Supabase client could not be initialized. Running in offline-only mode.');
}