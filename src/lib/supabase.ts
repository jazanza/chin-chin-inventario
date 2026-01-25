import { createClient } from '@supabase/supabase-js';
import { InventorySession, MasterProductConfig, SupplierConfig } from './persistence'; // Importar las interfaces

// Tipos para las variables de entorno
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Definir la estructura de la base de datos para Supabase
export interface Database {
  public: {
    Tables: {
      inventory_sessions: {
        Row: InventorySession;
        Insert: Omit<InventorySession, 'timestamp' | 'updated_at'> & { timestamp: string }; // Omit updated_at here
        Update: Partial<Omit<InventorySession, 'timestamp' | 'updated_at'>> & { timestamp?: string }; // Omit updated_at here
      };
      product_rules: { // Nueva tabla para reglas de producto
        Row: MasterProductConfig;
        Insert: Omit<MasterProductConfig, 'updated_at'>; // Omit updated_at here
        Update: Partial<Omit<MasterProductConfig, 'updated_at'>>; // Omit updated_at here
      };
      supplier_configs: { // Nueva tabla para configuraciones de proveedor
        Row: SupplierConfig;
        Insert: SupplierConfig;
        Update: Partial<SupplierConfig>;
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

// Obtener las variables de entorno
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log('Supabase environment variables:', {
  url: supabaseUrl ? 'URL present' : 'URL missing',
  key: supabaseAnonKey ? 'Key present' : 'Key missing'
});

// Validar que las variables de entorno estén presentes
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing. Supabase features will be disabled.');
}

// Crear el cliente de Supabase solo si las variables están presentes
export const supabase = supabaseUrl && supabaseAnonKey ? 
  createClient<Database>(supabaseUrl, supabaseAnonKey, {
    realtime: {
      params: {
        eventsPerSecond: 10 // Configuración para Realtime
      }
    }
  }) : 
  null;

// Verificar si el cliente se creó correctamente
if (supabase) {
  console.log('Supabase client initialized successfully.');
} else {
  console.warn('Supabase client could not be initialized. Running in offline-only mode.');
}