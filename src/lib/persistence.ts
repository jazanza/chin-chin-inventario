import Dexie, { Table } from 'dexie';
import { InventoryItem } from '@/context/InventoryContext';
import { OrderItem } from '@/components/OrderGenerationModule';
import { showError } from '@/utils/toast'; // Importar showError para notificaciones

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
  productRules!: Table<MasterProductConfig, number>; // Clave principal por productId
  // Define la tabla para configuraciones de proveedor
  supplierConfigs!: Table<SupplierConfig, string>;

  constructor() {
    super('ChinChinDB');
    // Reset total de la base de datos: Versión muy alta para forzar recreación
    this.version(10).stores({
      sessions: 'dateKey, timestamp',
      productRules: 'productId', // Clave principal por productId (número)
      supplierConfigs: 'supplierName', // Clave principal por nombre de proveedor
    });

    // Manejar el evento de cambio de versión para forzar el cierre de conexiones antiguas
    this.on('versionchange', (event) => {
      if (event.newVersion > event.oldVersion) {
        // Una nueva versión de la base de datos está disponible
        showError('Una nueva versión de la aplicación está disponible. Por favor, cierra todas las pestañas/ventanas de la aplicación y vuelve a abrirla para aplicar las actualizaciones.');
        this.close(); // Cierra la conexión actual para permitir la actualización
      }
    });
  }
}

export const db = new SessionDatabase();