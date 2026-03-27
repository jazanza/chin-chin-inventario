import { createClient } from '@supabase/supabase-js';
import { InventorySession, MasterProductConfig, SupplierConfig } from './persistence';

export interface Database {
  public: {
    Tables: {
      inventory_sessions: {
        Row: InventorySession;
        Insert: Omit<InventorySession, 'sync_pending'>;
        Update: Partial<Omit<InventorySession, 'sync_pending'>>;
      };
      product_rules: {
        Row: MasterProductConfig;
        Insert: Omit<MasterProductConfig, 'sync_pending'>;
        Update: Partial<Omit<MasterProductConfig, 'sync_pending'>>;
      };
      supplier_configs: {
        Row: SupplierConfig;
        Insert: SupplierConfig;
        Update: Partial<SupplierConfig>;
      };
    };
  };
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = supabaseUrl && supabaseAnonKey ? 
  createClient<Database>(supabaseUrl, supabaseAnonKey) : 
  null;