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
  productId: number; // Nueva clave principal: ID único del producto de Aronium
  productName: string; // Nombre del producto (para visualización)
  rules: ProductRule[]; // Lista de reglas de stock/pedido
  supplier: string; // Proveedor asociado
  isHidden?: boolean; // Nuevo campo para el borrado suave
}

// Define la estructura de la configuración por proveedor (sin cambios por ahora)
export interface SupplierConfig {
  supplierName: string; // Clave principal para el proveedor
}

export class SessionDatabase extends Dexie {
  // Define la tabla principal para sesiones
  sessions!: Table<InventorySession, string>;
  // Define la tabla para reglas de producto (ahora MasterProductConfig)
  productRules!: Table<MasterProductConfig, number>; // Cambiado a 'number' para productId
  // Define la tabla para configuraciones de proveedor
  supplierConfigs!: Table<SupplierConfig, string>;

  constructor() {
    super('ChinChinDB');
    this.version(1).stores({
      sessions: 'dateKey, timestamp',
      productRules: 'productId', // Clave principal por productId
      supplierConfigs: 'supplierName', // Clave principal por nombre de proveedor
    });
    // Nueva versión para asegurar que productId sea numérico
    this.version(2).stores({
      sessions: 'dateKey, timestamp',
      productRules: 'productId', // Re-declarar para asegurar el índice numérico
      supplierConfigs: 'supplierName',
    }).upgrade(async tx => {
      console.log("Upgrading ChinChinDB to version 2. Ensuring productRules schema.");
      // No se necesita migración de datos explícita si el problema es solo la aplicación de tipos en datos nuevos.
      // Si los datos existentes tienen productIds de tipo string, serán ignorados por las consultas numéricas.
      // La función processDbForMasterConfigs se encargará de rellenar con los tipos correctos.
    });
  }
}

export const db = new SessionDatabase();