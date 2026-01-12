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
  sync_pending?: boolean; // Nuevo campo para indicar si la sesión está pendiente de sincronizar con Supabase
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
  sync_pending?: boolean; // Nuevo campo para indicar si la configuración está pendiente de sincronizar con Supabase
}

// Define la estructura de la configuración por proveedor (sin cambios por ahora)
export interface SupplierConfig {
  supplierName: string; // Clave principal para el proveedor
}

export class SessionDatabase extends Dexie {
  // Define la tabla principal para sesiones
  sessions!: Table<InventorySession, string>;
  // Define la tabla para reglas de producto (ahora MasterProductConfig)
  productRules!: Table<MasterProductConfig, number>; // Clave principal por productId (número)
  // Define la tabla para configuraciones de proveedor
  supplierConfigs!: Table<SupplierConfig, string>;

  constructor() {
    super('ChinChinDB');
    // Versión 10: Esquema anterior sin sync_pending ni isHidden
    this.version(10).stores({
      sessions: 'dateKey, timestamp',
      productRules: 'productId',
      supplierConfigs: 'supplierName',
    });
    // Versión 11: Añade sync_pending a sessions y productRules, y isHidden a productRules
    this.version(11).stores({
      sessions: 'dateKey, timestamp, sync_pending', // Añadir sync_pending al índice
      productRules: 'productId, sync_pending', // Añadir sync_pending al índice
      supplierConfigs: 'supplierName',
    }).upgrade(async (tx) => {
      // Migrar sesiones existentes para añadir sync_pending: false
      await tx.table('sessions').toCollection().modify((session) => {
        // Asegurarse de que sync_pending sea siempre un booleano
        if (session.sync_pending === undefined || session.sync_pending === null) {
          session.sync_pending = false; // Asumir que las sesiones antiguas están sincronizadas
        }
      });
      // Migrar configuraciones de producto existentes para añadir sync_pending: false y isHidden: false
      await tx.table('productRules').toCollection().modify((config) => {
        // Asegurarse de que sync_pending y isHidden sean siempre booleanos
        if (config.sync_pending === undefined || config.sync_pending === null) {
          config.sync_pending = false; // Asumir que las configuraciones antiguas están sincronizadas
        }
        if (config.isHidden === undefined || config.isHidden === null) {
          config.isHidden = false; // Asumir que los productos antiguos no están ocultos
        }
      });
    });
    // Versión 12: Forzar una nueva migración para asegurar la consistencia de los índices
    this.version(12).stores({
      sessions: 'dateKey, timestamp, sync_pending',
      productRules: 'productId, sync_pending',
      supplierConfigs: 'supplierName',
    }).upgrade(async (tx) => {
      await tx.table('sessions').toCollection().modify((session) => {
        if (session.sync_pending === undefined || session.sync_pending === null) {
          session.sync_pending = false;
        }
      });
      await tx.table('productRules').toCollection().modify((config) => {
        if (config.sync_pending === undefined || config.sync_pending === null) {
          config.sync_pending = false;
        }
        if (config.isHidden === undefined || config.isHidden === null) {
          config.isHidden = false;
        }
      });
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