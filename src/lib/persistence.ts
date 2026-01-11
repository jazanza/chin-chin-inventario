import Dexie, { Table } from 'dexie';
import { InventoryItem } from '@/context/InventoryContext';
import { OrderItem } from '@/components/OrderGenerationModule';

// Define la estructura de una Sesión
export interface InventorySession {
  dateKey: string; // Formato 'YYYY-MM-DD' (clave principal)
  inventoryType: 'weekly' | 'monthly';
  inventoryData: InventoryItem[]; // Datos de inventario editados por el usuario
  timestamp: Date;
  effectiveness: number; // Porcentaje de efectividad del inventario
  ordersBySupplier?: { [supplier: string]: OrderItem[] }; // Historial de pedidos
}

// Define la estructura de una Regla de Producto configurable por el usuario
export interface ProductRuleConfig {
  productName: string; // Clave principal para la regla
  minStock: number;
  orderAmount: number;
}

export class SessionDatabase extends Dexie {
  // Define la tabla principal para sesiones
  sessions!: Table<InventorySession, string>;
  // Define la tabla para reglas de producto
  productRules!: Table<ProductRuleConfig, string>;

  constructor() {
    super('ChinChinDB');
    this.version(1).stores({
      sessions: 'dateKey, timestamp',
      productRules: 'productName', // Clave principal por nombre de producto
    });
  }
}

export const db = new SessionDatabase();