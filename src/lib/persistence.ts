import Dexie, { Table } from 'dexie';
import { InventoryItem } from '@/context/InventoryContext';
import { OrderItem } from '@/components/OrderGenerationModule';
import { showError } from '@/utils/toast';

// Define la estructura de una Sesión
export interface InventorySession {
  dateKey: string; // Formato 'YYYY-MM-DD' (clave principal)
  inventoryType: 'weekly' | 'monthly';
  inventoryData: InventoryItem[]; 
  timestamp: string; // Cambiado a string (ISO UTC) para consistencia
  effectiveness: number; 
  ordersBySupplier?: { [supplier: string]: OrderItem[] }; 
  sync_pending?: boolean; 
  updated_at: string; // ISO UTC
}

// Define la estructura de una Regla de Pedido individual
export interface ProductRule {
  minStock: number;
  orderAmount: number;
}

// Define la estructura de una Regla de Producto
export interface MasterProductConfig {
  productId: number; 
  productName: string; 
  rules: ProductRule[]; 
  supplier: string; 
  isHidden?: boolean; 
  inventory_type?: 'weekly' | 'monthly' | 'ignored'; 
  sync_pending?: boolean; 
  updated_at: string; // ISO UTC
}

export interface SupplierConfig {
  supplierName: string;
}

export class SessionDatabase extends Dexie {
  sessions!: Table<InventorySession, string>;
  productRules!: Table<MasterProductConfig, number>;
  supplierConfigs!: Table<SupplierConfig, string>;

  constructor() {
    super('ChinChinDB');
    
    // Versión 15: Asegurando que los índices incluyan updated_at para la resolución de conflictos
    this.version(15).stores({
      sessions: 'dateKey, timestamp, sync_pending, updated_at',
      productRules: 'productId, sync_pending, updated_at, inventory_type',
      supplierConfigs: 'supplierName',
    }).upgrade(async (tx) => {
      // Migración para asegurar que todas las fechas sean ISO strings
      await tx.table('sessions').toCollection().modify((session) => {
        if (session.timestamp instanceof Date) {
          session.timestamp = session.timestamp.toISOString();
        }
        if (!session.updated_at) {
          session.updated_at = new Date().toISOString();
        }
      });
    });

    this.on('versionchange', (event) => {
      if (event.newVersion > event.oldVersion) {
        showError('Actualización de base de datos detectada. Por favor, reinicia la app.');
        this.close();
      }
    });
  }
}

export const db = new SessionDatabase();