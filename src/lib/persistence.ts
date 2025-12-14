import Dexie, { Table } from 'dexie';
import { InventoryItem } from '@/context/InventoryContext'; // Asumo que esta interfaz existe
import { OrderItem } from '@/components/OrderGenerationModule'; // Importar OrderItem

// Define la estructura de una Sesión
export interface InventorySession {
  dateKey: string; // Formato 'YYYY-MM-DD' (clave principal)
  inventoryType: 'weekly' | 'monthly';
  inventoryData: InventoryItem[]; // Datos de inventario editados por el usuario
  timestamp: Date;
  effectiveness: number; // Porcentaje de efectividad del inventario
  ordersBySupplier?: { [supplier: string]: OrderItem[] }; // Historial de pedidos
}

export class SessionDatabase extends Dexie {
  // Define la tabla principal
  sessions!: Table<InventorySession, string>;

  constructor() {
    super('ChinChinDB');
    this.version(1).stores({
      // 'dateKey' es la clave principal. 'timestamp' será indexada para consultas
      sessions: 'dateKey, timestamp', 
    });
  }
}

export const db = new SessionDatabase();