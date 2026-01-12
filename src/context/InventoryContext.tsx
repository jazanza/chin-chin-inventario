import React, { createContext, useReducer, useContext, useCallback, useEffect, useMemo } from "react";
import { initDb, loadDb, queryData } from "@/lib/db";
import productData from "@/data/product-data.json"; // Mantener por ahora, aunque su uso se reducirá
import { db, InventorySession, MasterProductConfig, ProductRule, SupplierConfig } from "@/lib/persistence";
import { format } from "date-fns";
import { showSuccess, showError } from "@/utils/toast";
import debounce from "lodash.debounce";
import { supabase } from "@/lib/supabase";

// Interfaz para los datos de inventario tal como vienen de la DB
export interface InventoryItemFromDB {
  ProductId: number; // Añadido ProductId
  Categoria: string;
  Producto: string;
  Stock_Actual: number;
  SupplierName: string;
}

// Interfaz para los datos de inventario procesados
export interface InventoryItem {
  productId: number; // Ahora es la clave principal
  productName: string;
  category: string;
  systemQuantity: number;
  physicalQuantity: number;
  averageSales: number;
  supplier: string;
  hasBeenEdited?: boolean;
  rules: ProductRule[]; // Lista de reglas de stock/pedido
}

// --- Reducer Setup ---
type SyncStatus = 'idle' | 'syncing' | 'pending' | 'synced' | 'error';

interface InventoryState {
  dbBuffer: Uint8Array | null;
  inventoryType: "weekly" | "monthly" | null;
  inventoryData: InventoryItem[];
  masterProductConfigs: MasterProductConfig[]; // Nuevo estado para las configuraciones maestras
  loading: boolean;
  error: string | null;
  sessionId: string | null;
  syncStatus: SyncStatus; // Nuevo estado para el indicador de sincronización
  isOnline: boolean; // Nuevo estado para la conectividad
}

const initialState: InventoryState = {
  dbBuffer: null,
  inventoryType: null,
  inventoryData: [],
  masterProductConfigs: [], // Inicializar vacío
  loading: false,
  error: null,
  sessionId: null,
  syncStatus: 'idle',
  isOnline: navigator.onLine, // Inicializar con el estado actual de la conexión
};

type InventoryAction =
  | { type: 'SET_DB_BUFFER'; payload: Uint8Array | null }
  | { type: 'SET_INVENTORY_TYPE'; payload: "weekly" | "monthly" | null }
  | { type: 'SET_INVENTORY_DATA'; payload: InventoryItem[] }
  | { type: 'SET_MASTER_PRODUCT_CONFIGS'; payload: MasterProductConfig[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_SESSION_ID'; payload: string | null }
  | { type: 'SET_SYNC_STATUS'; payload: SyncStatus }
  | { type: 'SET_IS_ONLINE'; payload: boolean }
  | { type: 'RESET_STATE' };

const inventoryReducer = (state: InventoryState, action: InventoryAction): InventoryState => {
  switch (action.type) {
    case 'SET_DB_BUFFER':
      return { ...state, dbBuffer: action.payload, error: null };
    case 'SET_INVENTORY_TYPE':
      return { ...state, inventoryType: action.payload, error: null };
    case 'SET_INVENTORY_DATA':
      return { ...state, inventoryData: action.payload, error: null };
    case 'SET_MASTER_PRODUCT_CONFIGS':
      return { ...state, masterProductConfigs: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    case 'SET_SESSION_ID':
      return { ...state, sessionId: action.payload };
    case 'SET_SYNC_STATUS':
      return { ...state, syncStatus: action.payload };
    case 'SET_IS_ONLINE':
      return { ...state, isOnline: action.payload };
    case 'RESET_STATE':
      return {
        ...initialState,
        dbBuffer: state.dbBuffer,
        masterProductConfigs: state.masterProductConfigs,
        isOnline: state.isOnline,
      };
    default:
      return state;
  }
};

// --- Context Type ---
interface InventoryContextType extends InventoryState {
  setDbBuffer: (buffer: Uint8Array | null) => void;
  setInventoryType: (type: "weekly" | "monthly" | null) => void;
  setInventoryData: (data: InventoryItem[]) => void;
  setMasterProductConfigs: (configs: MasterProductConfig[]) => void;
  processInventoryData: (
    buffer: Uint8Array,
    type: "weekly" | "monthly"
  ) => Promise<void>;
  processDbForMasterConfigs: (buffer: Uint8Array) => Promise<void>;
  saveCurrentSession: (
    data: InventoryItem[],
    type: "weekly" | "monthly",
    timestamp: Date,
    orders?: { [supplier: string]: any[] }
  ) => Promise<void>;
  loadSession: (dateKey: string) => Promise<void>;
  deleteSession: (dateKey: string) => Promise<void>;
  getSessionHistory: () => Promise<InventorySession[]>;
  resetInventoryState: () => void;
  syncFromSupabase: () => Promise<void>;
  saveMasterProductConfig: (config: MasterProductConfig) => Promise<void>;
  deleteMasterProductConfig: (productId: number) => Promise<void>; // Cambiado a productId
  loadMasterProductConfigs: () => Promise<MasterProductConfig[]>;
  forceFullSync: () => Promise<void>; // Nueva función para forzar la sincronización
}

const InventoryContext = createContext<InventoryContextType | undefined>(
  undefined
);

// --- Helper Function: Calculate Effectiveness ---
const calculateEffectiveness = (data: InventoryItem[]): number => {
  if (data.length === 0) return 0;
  const matches = data.filter(item => item.systemQuantity === item.physicalQuantity).length;
  return (matches / data.length) * 100;
};

export const InventoryProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, dispatch] = useReducer(inventoryReducer, initialState);

  // --- Basic Setters ---
  const setDbBuffer = useCallback((buffer: Uint8Array | null) => {
    dispatch({ type: 'SET_DB_BUFFER', payload: buffer });
  }, []);

  const setInventoryType = useCallback((type: "weekly" | "monthly" | null) => {
    dispatch({ type: 'SET_INVENTORY_TYPE', payload: type });
  }, []);

  const setInventoryData = useCallback((data: InventoryItem[]) => {
    dispatch({ type: 'SET_INVENTORY_DATA', payload: data });
  }, []);

  const setMasterProductConfigs = useCallback((configs: MasterProductConfig[]) => {
    dispatch({ type: 'SET_MASTER_PRODUCT_CONFIGS', payload: configs });
  }, []);

  const resetInventoryState = useCallback(() => {
    dispatch({ type: 'RESET_STATE' });
  }, []);

  // --- Network Status Handling ---
  useEffect(() => {
    const handleOnline = () => dispatch({ type: 'SET_IS_ONLINE', payload: true });
    const handleOffline = () => dispatch({ type: 'SET_IS_ONLINE', payload: false });

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- Sync Status Update Helper ---
  const updateSyncStatus = useCallback(async () => {
    if (!state.isOnline) {
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'pending' }); // Offline, so pending
      return;
    }
    if (!supabase) {
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'idle' }); // No Supabase, no sync
      return;
    }

    const pendingSessions = await db.sessions.where({ sync_pending: true }).count();
    const pendingProductRules = await db.productRules.where({ sync_pending: true }).count();

    if (pendingSessions > 0 || pendingProductRules > 0) {
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'pending' });
    } else {
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'synced' });
    }
  }, [state.isOnline]);

  // --- Core Persistence Functions (Sessions) ---
  const saveCurrentSession = useCallback(async (
    data: InventoryItem[],
    type: "weekly" | "monthly",
    timestamp: Date,
    orders?: { [supplier: string]: any[] }
  ) => {
    if (!data || data.length === 0) return;

    const dateKey = format(timestamp, 'yyyy-MM-dd');
    const effectiveness = calculateEffectiveness(data);

    try {
      if (!db.isOpen()) await db.open(); // Emergency validation
      const existingSession = await db.sessions.get(dateKey);
      const ordersToSave = orders !== undefined ? orders : existingSession?.ordersBySupplier;

      const sessionToSave: InventorySession = {
        dateKey,
        inventoryType: type,
        inventoryData: data,
        timestamp,
        effectiveness,
        ordersBySupplier: ordersToSave,
        sync_pending: true, // Marcar como pendiente inicialmente
      };

      await db.sessions.put(sessionToSave); // Guardar en Dexie

      if (!state.sessionId) {
        dispatch({ type: 'SET_SESSION_ID', payload: dateKey });
      }

      if (supabase && state.isOnline) {
        const { error } = await supabase
          .from('inventory_sessions')
          .upsert(sessionToSave, { onConflict: 'dateKey' });

        if (error) {
          console.error("Error saving session to Supabase:", error);
          // Keep sync_pending: true in Dexie
          showError('Error al sincronizar sesión con la nube. Se reintentará.');
        } else {
          await db.sessions.update(dateKey, { sync_pending: false }); // Marcar como sincronizado en Dexie
          console.log("Session saved to Supabase successfully.");
        }
      } else {
        console.log("Supabase client not available or offline, skipping save to Supabase. Marked as sync_pending.");
      }
      updateSyncStatus();
    } catch (e) {
      console.error("Error saving session:", e);
      showError('Error al guardar la sesión localmente.');
      throw e;
    }
  }, [state.sessionId, state.isOnline, updateSyncStatus]);

  const loadSession = useCallback(async (dateKey: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      if (!db.isOpen()) await db.open(); // Emergency validation
      const session = await db.sessions.get(dateKey);
      if (session) {
        dispatch({ type: 'SET_INVENTORY_TYPE', payload: session.inventoryType });
        dispatch({ type: 'SET_INVENTORY_DATA', payload: session.inventoryData });
        dispatch({ type: 'SET_SESSION_ID', payload: dateKey });
        showSuccess(`Sesión del ${dateKey} cargada.`);
      } else {
        showError('No se encontró la sesión.');
      }
    } catch (e) {
      console.error("Error loading session:", e);
      showError('Error al cargar la sesión.');
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const deleteSession = useCallback(async (dateKey: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      if (!db.isOpen()) await db.open(); // Emergency validation
      await db.sessions.delete(dateKey); // Eliminar de Dexie

      if (supabase && state.isOnline) {
        const { error } = await supabase
          .from('inventory_sessions')
          .delete()
          .eq('dateKey', dateKey);

        if (error) {
          console.error("Error deleting session from Supabase:", error);
          showError('Error al eliminar sesión de la nube. Puede que reaparezca en una sincronización forzada.');
        } else {
          console.log("Session deleted from Supabase successfully.");
        }
      } else {
        console.log("Supabase client not available or offline, skipping delete from Supabase.");
      }

      showSuccess(`Sesión del ${dateKey} eliminada.`);

      if (state.sessionId === dateKey) {
        dispatch({ type: 'RESET_STATE' });
        dispatch({ type: 'SET_SESSION_ID', payload: null });
      }
      updateSyncStatus();
    } catch (e) {
      console.error("Error deleting session:", e);
      showError('Error al eliminar la sesión.');
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.sessionId, state.isOnline, updateSyncStatus]);

  const getSessionHistory = useCallback(async (): Promise<InventorySession[]> => {
    try {
      if (!db.isOpen()) await db.open(); // Emergency validation
      return await db.sessions.orderBy('timestamp').reverse().toArray();
    } catch (e) {
      console.error("Error fetching session history:", e);
      showError('Error al obtener el historial de sesiones.');
      return [];
    }
  }, []);

  // --- Master Product Config Persistence ---
  const loadMasterProductConfigs = useCallback(async (): Promise<MasterProductConfig[]> => {
    try {
      if (!db.isOpen()) await db.open(); // Emergency validation
      const allConfigs = await db.productRules.toArray();
      const filteredConfigs = allConfigs.filter(config => !config.isHidden);
      dispatch({ type: 'SET_MASTER_PRODUCT_CONFIGS', payload: filteredConfigs });
      return filteredConfigs;
    } catch (e) {
      console.error("Error fetching master product configs from Dexie:", e);
      dispatch({ type: 'SET_MASTER_PRODUCT_CONFIGS', payload: [] });
      showError('Error al obtener las configuraciones de producto. Cargando configuración vacía.');
      return [];
    } finally {
      updateSyncStatus();
    }
  }, [updateSyncStatus]);

  const saveMasterProductConfig = useCallback(async (config: MasterProductConfig) => {
    try {
      if (!db.isOpen()) await db.open(); // Emergency validation
      const configToSave = { ...config, productId: Number(config.productId), sync_pending: true }; // Marcar como pendiente
      await db.productRules.put(configToSave);
      
      if (supabase && state.isOnline) {
        const { error } = await supabase
          .from('product_rules')
          .upsert(configToSave, { onConflict: 'productId' });

        if (error) {
          console.error("Error saving master product config to Supabase:", error);
          showError('Error al sincronizar configuración de producto con la nube. Se reintentará.');
        } else {
          await db.productRules.update(configToSave.productId, { sync_pending: false });
          console.log("Master product config saved to Supabase successfully.");
        }
      } else {
        console.log("Supabase client not available or offline, skipping save to Supabase. Marked as sync_pending.");
      }
      // Refrescar configs sin ocultos después de guardar
      const updatedConfigs = (await db.productRules.toArray()).filter(c => !c.isHidden);
      dispatch({ type: 'SET_MASTER_PRODUCT_CONFIGS', payload: updatedConfigs });
      updateSyncStatus();
    } catch (e) {
      console.error("Error saving master product config:", e);
      showError('Error al guardar la configuración del producto localmente.');
      throw e;
    }
  }, [state.isOnline, updateSyncStatus]);

  const deleteMasterProductConfig = useCallback(async (productId: number) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      if (!db.isOpen()) await db.open(); // Emergency validation
      const numericProductId = Number(productId);
      
      // Realizar soft delete localmente y marcar como pendiente
      await db.productRules.update(numericProductId, { isHidden: true, sync_pending: true });
      
      if (supabase && state.isOnline) {
        const { error } = await supabase
          .from('product_rules')
          .update({ isHidden: true, sync_pending: false }) // Si se sincroniza, no está pendiente
          .eq('productId', numericProductId);

        if (error) {
          console.error("Error soft-deleting master product config from Supabase:", error);
          showError('Error al sincronizar eliminación de producto con la nube. Se reintentará.');
          // Keep sync_pending: true in Dexie
        } else {
          await db.productRules.update(numericProductId, { sync_pending: false }); // Marcar como sincronizado en Dexie
          console.log("Master product config soft-deleted from Supabase successfully.");
        }
      } else {
        console.log("Supabase client not available or offline, skipping soft-delete to Supabase. Marked as sync_pending.");
      }
      showSuccess(`Configuración de producto eliminada (ocultada).`);

      // Refrescar configs sin ocultos
      const updatedConfigs = (await db.productRules.toArray()).filter(c => !c.isHidden);
      dispatch({ type: 'SET_MASTER_PRODUCT_CONFIGS', payload: updatedConfigs });

      if (state.inventoryData.some(item => item.productId === numericProductId)) {
        const updatedInventory = state.inventoryData.filter(item => item.productId !== numericProductId);
        dispatch({ type: 'SET_INVENTORY_DATA', payload: updatedInventory });
        if (state.sessionId && state.inventoryType) {
          await saveCurrentSession(updatedInventory, state.inventoryType, new Date());
        }
      }
      updateSyncStatus();
    } catch (e) {
      console.error("Error soft-deleting master product config:", e);
      showError('Error al eliminar la configuración de producto.');
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.inventoryData, state.sessionId, state.inventoryType, saveCurrentSession, state.isOnline, updateSyncStatus]);

  // Consultas SQL específicas para inventario semanal y mensual
  const WEEKLY_INVENTORY_QUERY = `
    SELECT P.Id AS ProductId, PG.Name AS Categoria, P.Name AS Producto, S.Quantity AS Stock_Actual,
    COALESCE(
      (
        SELECT C_sub.Name
        FROM DocumentItem DI_sub
        JOIN Document D_sub ON D_sub.Id = DI_sub.DocumentId
        JOIN DocumentType DT_sub ON DT_sub.Id = D_sub.DocumentTypeId
        JOIN Customer C_sub ON C_sub.Id = D_sub.CustomerId
        WHERE DI_sub.ProductId = P.Id
        AND DT_sub.Code = '100' -- Tipo de documento de compra
        AND C_sub.IsSupplier = 1 -- Debe ser un proveedor
        AND C_sub.IsEnabled = 1 -- El proveedor debe estar habilitado
        ORDER BY D_sub.Date DESC
        LIMIT 1
      ),
      'Desconocido'
    ) AS SupplierName
    FROM Stock S
    JOIN Product P ON P.Id = S.ProductId
    JOIN ProductGroup PG ON PG.Id = P.ProductGroupId
    WHERE PG.Id IN (13, 14, 16, 20, 23, 27, 34, 36, 37, 38, 43, 40, 52, 53)
    AND PG.Name IN (
      'Cervezas', 'Mixers', 'Cigarrillos y Vapes', 'Snacks', 'Six Packs',
      'Conservas y Embutidos', 'Cervezas Belgas', 'Cervezas Alemanas',
      'Cervezas Españolas', 'Cervezas Del Mundo', 'Cervezas 750ml', 'Vapes', 'Tabacos', 'Comida'
    )
    AND P.IsEnabled = 1
    ORDER BY PG.Name ASC, P.Name ASC;
  `;

  const MONTHLY_INVENTORY_QUERY = `
    SELECT P.Id AS ProductId, PG.Name AS Categoria, P.Name AS Producto, S.Quantity AS Stock_Actual,
    COALESCE(
      (
        SELECT C_sub.Name
        FROM DocumentItem DI_sub
        JOIN Document D_sub ON D_sub.Id = DI_sub.DocumentId
        JOIN DocumentType DT_sub ON DT_sub.Id = D_sub.DocumentTypeId
        JOIN Customer C_sub ON C_sub.Id = D_sub.CustomerId
        WHERE DI_sub.ProductId = P.Id
        AND DT_sub.Code = '100' -- Tipo de documento de compra
        AND C_sub.IsSupplier = 1 -- Debe ser un proveedor
        AND C_sub.IsEnabled = 1 -- El proveedor debe estar habilitado
        ORDER BY D_sub.Date DESC
        LIMIT 1
      ),
      'Desconocido'
    ) AS SupplierName
    FROM Stock S
    JOIN Product P ON P.Id = S.ProductId
    JOIN ProductGroup PG ON PG.Id = P.ProductGroupId
    WHERE PG.Id IN (
      4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 20, 22, 23, 27, 34, 36, 37, 38, 43
    )
    AND PG.Name IN (
      'Vinos', 'Espumantes', 'Whisky', 'Vodka', 'Ron', 'Gin', 'Aguardientes', 'Tequilas',
      'Aperitivos', 'Cervezas', 'Mixers', 'Cigarrillos y Vapes', 'Snacks', 'Personales',
      'Six Packs', 'Conservas y Embutidos', 'Cervezas Belgas', 'Cervezas Alemanas', 'Vapes', 'Tabacos', 'Comida'
    )
    AND P.IsEnabled = 1
    ORDER BY PG.Name ASC, P.Name ASC;
  `;

  // Nueva consulta SQL para obtener TODOS los productos habilitados para la configuración maestra
  const ALL_PRODUCTS_QUERY = `
    SELECT P.Id AS ProductId, PG.Name AS Categoria, P.Name AS Producto, S.Quantity AS Stock_Actual,
    COALESCE(
      (
        SELECT C_sub.Name
        FROM DocumentItem DI_sub
        JOIN Document D_sub ON D_sub.Id = DI_sub.DocumentId
        JOIN DocumentType DT_sub ON DT_sub.Id = D_sub.DocumentTypeId
        JOIN Customer C_sub ON C_sub.Id = D_sub.CustomerId
        WHERE DI_sub.ProductId = P.Id
        AND DT_sub.Code = '100' -- Tipo de documento de compra
        AND C_sub.IsSupplier = 1 -- Debe ser un proveedor
        AND C_sub.IsEnabled = 1 -- El proveedor debe estar habilitado
        ORDER BY D_sub.Date DESC
        LIMIT 1
      ),
      'Desconocido'
    ) AS SupplierName
    FROM Stock S
    JOIN Product P ON P.Id = S.ProductId
    JOIN ProductGroup PG ON PG.Id = P.ProductGroupId
    WHERE P.IsEnabled = 1
    ORDER BY PG.Name ASC, P.Name ASC;
  `;

  // --- DB Processing Functions ---
  const processInventoryData = useCallback(
    async (buffer: Uint8Array, type: "weekly" | "monthly") => {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });
      console.log(`Starting database processing for ${type} inventory.`);

      try {
        await initDb();
        const dbInstance = loadDb(buffer);
        let inventoryQuery: string;

        if (type === "weekly") {
          inventoryQuery = WEEKLY_INVENTORY_QUERY;
        } else {
          inventoryQuery = MONTHLY_INVENTORY_QUERY;
        }

        const rawInventoryItems: InventoryItemFromDB[] = queryData(
          dbInstance,
          inventoryQuery
        );
        dbInstance.close();

        if (rawInventoryItems.length === 0) {
          console.warn("No inventory items found in the database for processing.");
          dispatch({ type: 'SET_INVENTORY_DATA', payload: [] });
          dispatch({ type: 'SET_INVENTORY_TYPE', payload: type });
          dispatch({ type: 'SET_SESSION_ID', payload: format(new Date(), 'yyyy-MM-dd') });
          showError('No se encontraron productos de inventario en la base de datos.');
          return;
        }

        if (!db.isOpen()) await db.open(); // Emergency validation
        const allMasterProductConfigs = await db.productRules.toArray();
        const masterProductConfigsMap = new Map(allMasterProductConfigs.map(config => [config.productId, config]));

        let processedInventory: InventoryItem[] = [];
        const newOrUpdatedMasterConfigs: MasterProductConfig[] = [];

        rawInventoryItems.forEach((dbItem) => {
          if (dbItem.ProductId === null || dbItem.ProductId === undefined || isNaN(Number(dbItem.ProductId)) || Number(dbItem.ProductId) === 0) {
            console.warn("Skipping product due to invalid ProductId:", dbItem);
            return;
          }
          const currentProductId = Number(dbItem.ProductId);

          let supplierName = dbItem.SupplierName;
          const lowerCaseSupplierName = supplierName.toLowerCase();

          if (lowerCaseSupplierName.includes("finca yaruqui") || lowerCaseSupplierName.includes("elbe")) {
            supplierName = "ELBE S.A.";
          } else if (lowerCaseSupplierName.includes("ac bebidas")) {
            supplierName = "AC Bebidas (Coca Cola)";
          }

          const productsToForceACBebidas = ["Coca Cola", "Fioravanti", "Fanta", "Sprite", "Imperial Toronja"];
          if (productsToForceACBebidas.some(p => dbItem.Producto.includes(p))) {
            supplierName = "AC Bebidas (Coca Cola)";
          }

          const matchedProductData = productData.find(
            (p) => p.productName === dbItem.Producto
          );

          let masterConfig = masterProductConfigsMap.get(currentProductId);

          if (!masterConfig) {
            masterConfig = {
              productId: currentProductId,
              productName: dbItem.Producto,
              rules: [],
              supplier: supplierName,
              isHidden: false,
              sync_pending: true, // Nuevo producto, se intentará sincronizar inmediatamente
            };
            newOrUpdatedMasterConfigs.push(masterConfig);
            masterProductConfigsMap.set(currentProductId, masterConfig);
          } else {
            const updatedConfig = {
              ...masterConfig,
              productName: dbItem.Producto,
              supplier: supplierName,
              // isHidden se mantiene
              // Asegurarse de que sync_pending sea siempre un booleano
              sync_pending: Boolean(masterConfig.sync_pending || (masterConfig.productName !== dbItem.Producto || masterConfig.supplier !== supplierName)),
            };
            if (updatedConfig.sync_pending) { // Solo añadir si hay cambios o ya estaba pendiente
              newOrUpdatedMasterConfigs.push(updatedConfig);
            }
            masterConfig = updatedConfig; // Usar la versión actualizada para el inventario
          }

          if (!masterConfig.isHidden) {
            processedInventory.push({
              productId: currentProductId,
              productName: dbItem.Producto,
              category: dbItem.Categoria,
              systemQuantity: dbItem.Stock_Actual,
              physicalQuantity: dbItem.Stock_Actual,
              averageSales: matchedProductData?.averageSales || 0,
              supplier: masterConfig.supplier,
              hasBeenEdited: false,
              rules: masterConfig.rules,
            });
          }
        });

        if (newOrUpdatedMasterConfigs.length > 0) {
          await db.productRules.bulkPut(newOrUpdatedMasterConfigs);
          dispatch({ type: 'SET_MASTER_PRODUCT_CONFIGS', payload: (await db.productRules.toArray()).filter(c => !c.isHidden) });
          console.log(`Saved ${newOrUpdatedMasterConfigs.length} new or updated master product configs.`);
        }

        processedInventory = processedInventory.filter(item => item.supplier !== "KYR S.A.S" && item.supplier !== "Desconocido");

        dispatch({ type: 'SET_INVENTORY_DATA', payload: processedInventory });
        dispatch({ type: 'SET_INVENTORY_TYPE', payload: type });

        const dateKey = format(new Date(), 'yyyy-MM-dd');
        const effectiveness = calculateEffectiveness(processedInventory);

        // Guardar en Dexie y luego intentar sincronizar
        const newSession: InventorySession = {
          dateKey,
          inventoryType: type,
          inventoryData: processedInventory,
          timestamp: new Date(),
          effectiveness,
          sync_pending: true, // Marcar como pendiente
        };
        await db.sessions.put(newSession);
        dispatch({ type: 'SET_SESSION_ID', payload: dateKey });

        if (supabase && state.isOnline) {
          const { error } = await supabase
            .from('inventory_sessions')
            .upsert(newSession, { onConflict: 'dateKey' });

          if (error) {
            console.error("Error saving new session to Supabase:", error);
            showError('Error al sincronizar nueva sesión con la nube. Se reintentará.');
          } else {
            await db.sessions.update(dateKey, { sync_pending: false });
            showSuccess('Nueva sesión de inventario iniciada y guardada.');
          }
        } else {
          console.log("Supabase client not available or offline, skipping save to Supabase. Marked as sync_pending.");
          showSuccess('Nueva sesión de inventario iniciada y guardada localmente (pendiente de sincronizar).');
        }
        updateSyncStatus();
      } catch (e: any) {
        console.error("Error processing database for inventory:", e);
        dispatch({ type: 'SET_ERROR', payload: e.message });
        showError(`Error al procesar el inventario: ${e.message}`);
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
        console.log("Database inventory processing finished.");
      }
    },
    [state.isOnline, updateSyncStatus]
  );

  const processDbForMasterConfigs = useCallback(async (buffer: Uint8Array) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    console.log(`Starting database processing for master configs.`);

    try {
      await initDb();
      const dbInstance = loadDb(buffer);
      const rawInventoryItems: InventoryItemFromDB[] = queryData(
        dbInstance,
        ALL_PRODUCTS_QUERY
      );
      dbInstance.close();

      if (rawInventoryItems.length === 0) {
        console.warn("No products found in the database for master configuration.");
        showError('No se encontraron productos en la base de datos para configurar.');
        return;
      }

      if (!db.isOpen()) await db.open(); // Emergency validation
      const existingMasterProductConfigs = await db.productRules.toArray();
      const masterProductConfigsMap = new Map(existingMasterProductConfigs.map(config => [config.productId, config]));

      const configsToUpdateOrAdd: MasterProductConfig[] = [];
      let newProductsCount = 0;

      for (const dbItem of rawInventoryItems) {
        if (dbItem.ProductId === null || dbItem.ProductId === undefined || isNaN(Number(dbItem.ProductId)) || Number(dbItem.ProductId) === 0) {
          console.warn("Skipping product due to invalid ProductId:", dbItem);
          continue;
        }
        const currentProductId = Number(dbItem.ProductId);

        let supplierName = dbItem.SupplierName;
        const lowerCaseSupplierName = supplierName.toLowerCase();

        if (lowerCaseSupplierName.includes("finca yaruqui") || lowerCaseSupplierName.includes("elbe")) {
          supplierName = "ELBE S.A.";
        } else if (lowerCaseSupplierName.includes("ac bebidas")) {
          supplierName = "AC Bebidas (Coca Cola)";
        }

        const productsToForceACBebidas = ["Coca Cola", "Fioravanti", "Fanta", "Sprite", "Imperial Toronja"];
        if (productsToForceACBebidas.some(p => dbItem.Producto.includes(p))) {
          supplierName = "AC Bebidas (Coca Cola)";
        }

        let masterConfig = masterProductConfigsMap.get(currentProductId);

        if (!masterConfig) {
          masterConfig = {
            productId: currentProductId,
            productName: dbItem.Producto,
            rules: [],
            supplier: supplierName,
            isHidden: false,
            sync_pending: true, // Nuevo producto, marcar como pendiente
          };
          newProductsCount++;
          configsToUpdateOrAdd.push(masterConfig);
        } else {
          const updatedConfig = {
            ...masterConfig,
            productName: dbItem.Producto,
            supplier: supplierName,
            // isHidden se mantiene
            // Asegurarse de que sync_pending sea siempre un booleano
            sync_pending: Boolean(masterConfig.sync_pending || (masterConfig.productName !== dbItem.Producto || masterConfig.supplier !== supplierName)),
          };
          if (updatedConfig.sync_pending) { // Solo añadir si hay cambios o ya estaba pendiente
            configsToUpdateOrAdd.push(updatedConfig);
          }
        }
      }

      if (configsToUpdateOrAdd.length > 0) {
        await db.productRules.bulkPut(configsToUpdateOrAdd);
        // Intentar sincronizar inmediatamente los nuevos/actualizados
        if (supabase && state.isOnline) {
          const { error } = await supabase
            .from('product_rules')
            .upsert(configsToUpdateOrAdd.map(c => ({ ...c, sync_pending: false })), { onConflict: 'productId' });

          if (error) {
            console.error("Error bulk upserting master product configs to Supabase:", error);
            showError('Error al sincronizar configuraciones de producto con la nube. Se reintentará.');
            // Keep sync_pending: true for failed ones (already set)
          } else {
            // Mark as not pending in Dexie for all successfully synced
            for (const config of configsToUpdateOrAdd) {
              await db.productRules.update(config.productId, { sync_pending: false });
            }
            if (newProductsCount > 0) {
              showSuccess(`Se agregaron ${newProductsCount} nuevos productos a la configuración maestra.`);
            } else {
              showSuccess('Configuraciones de productos actualizadas.');
            }
          }
        } else {
          console.log("Supabase client not available or offline, skipping bulk upsert to Supabase. Marked as sync_pending.");
          if (newProductsCount > 0) {
            showSuccess(`Se agregaron ${newProductsCount} nuevos productos a la configuración maestra (pendientes de sincronizar).`);
          } else {
            showSuccess('Configuraciones de productos actualizadas localmente (pendientes de sincronizar).');
          }
        }
      } else {
        showSuccess('No se encontraron nuevos productos para agregar o actualizar en la configuración maestra.');
      }
      await loadMasterProductConfigs(); // Recargar para actualizar el estado global
      updateSyncStatus();
    } catch (e: any) {
      console.error("Error during processing database for master configs:", e);
      showError(`Error al procesar el archivo DB para configuraciones: ${e.message}`);
      dispatch({ type: 'SET_ERROR', payload: e.message });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
      console.log("Database master config processing finished.");
    }
  }, [state.isOnline, loadMasterProductConfigs, updateSyncStatus]);


  // --- Auto-Retry Mechanism ---
  const retryPendingSyncs = useCallback(async () => {
    if (!supabase || !state.isOnline || state.syncStatus === 'syncing') {
      return;
    }

    dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' });
    console.log("Attempting to retry pending syncs...");

    try {
      if (!db.isOpen()) await db.open(); // Emergency validation

      // Retry pending sessions
      const pendingSessions = await db.sessions.where({ sync_pending: true }).toArray();
      for (const session of pendingSessions) {
        console.log(`Retrying session: ${session.dateKey}`);
        const { error } = await supabase
          .from('inventory_sessions')
          .upsert(session, { onConflict: 'dateKey' });
        if (error) {
          console.error(`Failed to retry session ${session.dateKey}:`, error);
          dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
        } else {
          await db.sessions.update(session.dateKey, { sync_pending: false });
          console.log(`Session ${session.dateKey} synced successfully.`);
        }
      }

      // Retry pending product configs
      const pendingProductRules = await db.productRules.where({ sync_pending: true }).toArray();
      for (const config of pendingProductRules) {
        console.log(`Retrying product config: ${config.productName} (${config.productId})`);
        const { error } = await supabase
          .from('product_rules')
          .upsert(config, { onConflict: 'productId' });
        if (error) {
          console.error(`Failed to retry product config ${config.productId}:`, error);
          dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
        } else {
          await db.productRules.update(config.productId, { sync_pending: false });
          console.log(`Product config ${config.productId} synced successfully.`);
        }
      }
      showSuccess('Sincronización automática completada.');
    } catch (e) {
      console.error("Error during retryPendingSyncs:", e);
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
      showError('Error en la sincronización automática.');
    } finally {
      updateSyncStatus(); // Update status based on remaining pending items
    }
  }, [state.isOnline, state.syncStatus, updateSyncStatus]);

  useEffect(() => {
    let retryInterval: NodeJS.Timeout;
    if (state.isOnline && supabase) {
      retryInterval = setInterval(retryPendingSyncs, 30000); // Retry every 30 seconds
    }
    return () => clearInterval(retryInterval);
  }, [state.isOnline, retryPendingSyncs]);


  // --- Force Full Sync ---
  const forceFullSync = useCallback(async () => {
    if (!supabase || !state.isOnline || state.loading || state.syncStatus === 'syncing') {
      showError('No se puede forzar la sincronización: sin conexión, Supabase no disponible o ya sincronizando.');
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' });
    dispatch({ type: 'SET_ERROR', payload: null });
    showSuccess('Iniciando sincronización completa...');
    console.log("Starting force full sync...");

    try {
      if (!db.isOpen()) await db.open(); // Emergency validation

      // 1. Upload all local data to Supabase
      const localSessions = await db.sessions.toArray();
      for (const session of localSessions) {
        const { error } = await supabase
          .from('inventory_sessions')
          .upsert({ ...session, sync_pending: false }, { onConflict: 'dateKey' });
        if (error) {
          console.error(`Error uploading session ${session.dateKey} to Supabase:`, error);
          await db.sessions.update(session.dateKey, { sync_pending: true }); // Mark as pending if upload fails
        } else {
          await db.sessions.update(session.dateKey, { sync_pending: false });
        }
      }

      const localProductRules = await db.productRules.toArray();
      for (const config of localProductRules) {
        const { error } = await supabase
          .from('product_rules')
          .upsert({ ...config, sync_pending: false }, { onConflict: 'productId' });
        if (error) {
          console.error(`Error uploading product config ${config.productId} to Supabase:`, error);
          await db.productRules.update(config.productId, { sync_pending: true }); // Mark as pending if upload fails
        } else {
          await db.productRules.update(config.productId, { sync_pending: false });
        }
      }

      // 2. Download all Supabase data to local Dexie
      const { data: supabaseSessions, error: sessionsError } = await supabase
        .from('inventory_sessions')
        .select('*');
      if (sessionsError) throw sessionsError;

      for (const session of supabaseSessions) {
        await db.sessions.put({ ...session, sync_pending: false }); // Downloaded from Supabase, so not pending
      }

      const { data: supabaseProductRules, error: productRulesError } = await supabase
        .from('product_rules')
        .select('*');
      if (productRulesError) throw productRulesError;

      for (const config of supabaseProductRules) {
        await db.productRules.put({ ...config, sync_pending: false }); // Downloaded from Supabase, so not pending
      }

      showSuccess('Sincronización completa finalizada con éxito.');
      console.log("Force full sync completed successfully.");
      await loadMasterProductConfigs(); // Recargar configs para reflejar cualquier cambio
    } catch (e: any) {
      console.error("Error during forceFullSync:", e);
      dispatch({ type: 'SET_ERROR', payload: e.message });
      showError(`Error en la sincronización completa: ${e.message}`);
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
      updateSyncStatus(); // Final update based on current state
    }
  }, [state.isOnline, state.loading, state.syncStatus, loadMasterProductConfigs, updateSyncStatus]);


  // Nueva función para sincronizar desde Supabase (usada en AppInitializer)
  const syncFromSupabase = useCallback(async () => {
    if (!supabase) {
      console.log("Supabase not available, skipping initial sync.");
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' });
    console.log("Performing initial sync from Supabase...");

    try {
      if (!db.isOpen()) await db.open(); // Emergency validation

      // Sincronizar sesiones
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('inventory_sessions')
        .select('*')
        .order('timestamp', { ascending: false });

      if (sessionsError) {
        console.error("Error fetching sessions from Supabase during initial sync:", sessionsError);
      } else if (sessionsData && sessionsData.length > 0) {
        for (const session of sessionsData) {
          await db.sessions.put({ ...session, sync_pending: false }); // Downloaded, so not pending
        }
        console.log(`Synced ${sessionsData.length} sessions from Supabase to local storage.`);
      } else {
        console.log("No sessions found in Supabase to sync.");
      }

      // Sincronizar reglas de producto
      const { data: configsData, error: configsError } = await supabase
        .from('product_rules')
        .select('*');

      if (configsError) {
        console.error("Error fetching product rules from Supabase during initial sync:", configsError);
      } else if (configsData && configsData.length > 0) {
        for (const config of configsData) {
          await db.productRules.put({ ...config, sync_pending: false }); // Downloaded, so not pending
        }
        dispatch({ type: 'SET_MASTER_PRODUCT_CONFIGS', payload: configsData.filter(c => !c.isHidden) });
        console.log(`Synced ${configsData.length} product rules from Supabase to local storage.`);
      } else {
        console.log("No product rules found in Supabase to sync.");
      }
      showSuccess('Sincronización inicial con la nube completada.');
    } catch (e) {
      console.error("Error during initial Supabase sync:", e);
      showError('Error en la sincronización inicial con la nube.');
      dispatch({ type: 'SET_ERROR', payload: (e as Error).message });
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
      updateSyncStatus();
    }
  }, [updateSyncStatus]);

  useEffect(() => {
    if (state.dbBuffer && state.inventoryType && !state.sessionId) {
      processInventoryData(state.dbBuffer, state.inventoryType);
    }
  }, [state.dbBuffer, state.inventoryType, state.sessionId, processInventoryData]);

  useEffect(() => {
    loadMasterProductConfigs();
  }, [loadMasterProductConfigs]);

  // Initial sync status check on mount
  useEffect(() => {
    updateSyncStatus();
  }, [updateSyncStatus]);

  const value = useMemo(() => ({
    ...state,
    setDbBuffer,
    setInventoryType,
    setInventoryData,
    setMasterProductConfigs,
    processInventoryData,
    processDbForMasterConfigs,
    saveCurrentSession,
    loadSession,
    deleteSession,
    getSessionHistory,
    resetInventoryState,
    syncFromSupabase,
    saveMasterProductConfig,
    deleteMasterProductConfig,
    loadMasterProductConfigs,
    forceFullSync,
  }), [
    state,
    setDbBuffer,
    setInventoryType,
    setInventoryData,
    setMasterProductConfigs,
    processInventoryData,
    processDbForMasterConfigs,
    saveCurrentSession,
    loadSession,
    deleteSession,
    getSessionHistory,
    resetInventoryState,
    syncFromSupabase,
    saveMasterProductConfig,
    deleteMasterProductConfig,
    loadMasterProductConfigs,
    forceFullSync,
  ]);

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
};

export const useInventoryContext = () => {
  const context = useContext(InventoryContext);
  if (context === undefined) {
    throw new Error(
      "useInventoryContext must be used within an InventoryProvider"
    );
  }
  return context;
};