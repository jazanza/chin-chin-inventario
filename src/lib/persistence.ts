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

// Define la estructura de una Regla de Pedido individual
export interface ProductRule {
  minStock: number;
  orderAmount: number;
}

// Define la estructura de una Regla de Producto configurable por el usuario (MasterProductConfig)
export interface MasterProductConfig {
  productName: string; // Clave principal para la regla
  rules: ProductRule[]; // Lista de reglas de stock/pedido
  minProductOrder: number; // Mínimo de unidades a pedir para este producto
  supplier: string; // Ahora parte de la configuración global
}

// Define la estructura de la configuración por proveedor
export interface SupplierConfig {
  supplierName: string; // Clave principal para el proveedor
  // Eliminado: minOrderValue: number; // Mínimo de unidades a pedir a este proveedor
}

export class SessionDatabase extends Dexie {
  // Define la tabla principal para sesiones
  sessions!: Table<InventorySession, string>;
  // Define la tabla para reglas de producto (ahora MasterProductConfig)
  productRules!: Table<MasterProductConfig, string>;
  // Define la tabla para configuraciones de proveedor
  supplierConfigs!: Table<SupplierConfig, string>;

  constructor() {
    super('ChinChinDB');
    this.version(1).stores({
      sessions: 'dateKey, timestamp',
      productRules: 'productName', // Clave principal por nombre de producto
      supplierConfigs: 'supplierName', // Clave principal por nombre de proveedor
    });
  }
}

export const db = new SessionDatabase();