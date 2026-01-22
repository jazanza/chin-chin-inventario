import React, { createContext, useReducer, useContext, useCallback, useEffect, useMemo, useRef } from "react";
import { initDb, loadDb, queryData } from "@/lib/db";
import productData from "@/data/product-data.json"; // Mantener por ahora, aunque su uso se reducirá
import { db, InventorySession, MasterProductConfig, ProductRule, SupplierConfig } from "@/lib/persistence";
import { format } from "date-fns";
import { showSuccess, showError } from "@/utils/toast";
import debounce from "lodash.debounce";
import { supabase } from "@/lib/supabase";
import { Database } from '@/lib/supabase'; // Importar tipos de base de datos

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

// Definir tipos para los ítems de pedido con la cantidad final editable (necesario para sesiones)
export interface OrderItem {
  product: string;
  quantityToOrder: number; // Cantidad sugerida (después de aplicar reglas)
  finalOrderQuantity: number; // Cantidad final que el usuario puede editar
}

// --- Reducer Setup ---
type SyncStatus = 'idle' | 'syncing' | 'pending' | 'synced' | 'error';

interface InventoryState {
  dbBuffer: Uint8Array | null;
  inventoryType: "weekly" | "monthly" | null;
  rawInventoryItemsFromDb: InventoryItem[]; // Renombrado de inventoryData
  masterProductConfigs: MasterProductConfig[]; // Nuevo estado para las configuraciones maestras
  loading: boolean;
  error: string | null;
  sessionId: string | null;
  syncStatus: SyncStatus; // Nuevo estado para el indicador de sincronización
  isOnline: boolean; // Nuevo estado para la conectividad
  isSupabaseSyncInProgress: boolean; // Nuevo estado para evitar race conditions en Supabase
}

const initialState: InventoryState = {
  dbBuffer: null,
  inventoryType: null,
  rawInventoryItemsFromDb: [], // Inicializar vacío
  masterProductConfigs: [], // Inicializar vacío
  loading: false,
  error: null,
  sessionId: null,
  syncStatus: 'idle',
  isOnline: navigator.onLine, // Inicializar con el estado actual de la conexión
  isSupabaseSyncInProgress: false, // Inicializar en false
};

type InventoryAction =
  | { type: 'SET_DB_BUFFER'; payload: Uint8Array | null }
  | { type: 'SET_INVENTORY_TYPE'; payload: "weekly" | "monthly" | null }
  | { type: 'SET_RAW_INVENTORY_ITEMS_FROM_DB'; payload: InventoryItem[] } // Nuevo tipo de acción
  | { type: 'SET_MASTER_PRODUCT_CONFIGS'; payload: MasterProductConfig[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_SESSION_ID'; payload: string | null }
  | { type: 'SET_SYNC_STATUS'; payload: SyncStatus }
  | { type: 'SET_IS_ONLINE'; payload: boolean }
  | { type: 'SET_SUPABASE_SYNC_IN_PROGRESS'; payload: boolean } // Nueva acción
  | { type: 'RESET_STATE' };

const inventoryReducer = (state: InventoryState, action: InventoryAction): InventoryState => {
  switch (action.type) {
    case 'SET_DB_BUFFER':
      return { ...state, dbBuffer: action.payload, error: null };
    case 'SET_INVENTORY_TYPE':
      return { ...state, inventoryType: action.payload, error: null };
    case 'SET_RAW_INVENTORY_ITEMS_FROM_DB': // Nuevo caso
      return { ...state, rawInventoryItemsFromDb: action.payload, error: null };
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
    case 'SET_SUPABASE_SYNC_IN_PROGRES': // Nuevo caso
      return { ...state, isSupabaseSyncInProgress: action.payload };
    case 'RESET_STATE':
      return {
        ...initialState,
        dbBuffer: state.dbBuffer,
        masterProductConfigs: state.masterProductConfigs,
        isOnline: state.isOnline,
        isSupabaseSyncInProgress: false, // Resetear también este estado
      };
    default:
      return state;
  }
};

// --- Context Type ---
interface InventoryContextType extends InventoryState {
  filteredInventoryData: InventoryItem[]; // Propiedad computada para los componentes
  setDbBuffer: (buffer: Uint8Array | null) => void;
  setInventoryType: (type: "weekly" | "monthly" | null) => void;
  setRawInventoryItemsFromDb: (data: InventoryItem[]) => void; // Nuevo setter
  setMasterProductConfigs: (configs: MasterProductConfig[]) => void;
  processInventoryData: (
    buffer: Uint8Array,
    type: "weekly" | "monthly"
  ) => Promise<void>;
  processDbForMasterConfigs: (buffer: Uint8Array) => Promise<void>;
  saveCurrentSession: (
    data: InventoryItem[], // Ahora espera la lista filtrada
    type: "weekly" | "monthly",
    timestamp: Date,
    orders?: { [supplier: string]: OrderItem[] } // Usar OrderItem[]
  ) => Promise<void>;
  loadSession: (dateKey: string) => Promise<void>;
  deleteSession: (dateKey: string) => Promise<void>;
  getSessionHistory: () => Promise<InventorySession[]>;
  resetInventoryState: () => void;
  syncFromSupabase: () => Promise<void>; // Ahora realiza una sincronización total
  saveMasterProductConfig: (config: MasterProductConfig) => Promise<void>;
  deleteMasterProductConfig: (productId: number) => Promise<void>; // Cambiado a productId
  loadMasterProductConfigs: (includeHidden?: boolean) => Promise<MasterProductConfig[]>; // Añadido includeHidden
  handleVisibilityChangeSync: () => Promise<void>; // Nueva función para sincronización al cambiar de pestaña
  resetAllProductConfigs: (buffer: Uint8Array) => Promise<void>; // Nueva función para reiniciar configs
  clearLocalDatabase: () => Promise<void>; // Nueva función para limpiar DB local
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
  const previousFilteredInventoryDataRef = useRef<InventoryItem[]>([]); // Ref para la lista filtrada anterior

  // --- Basic Setters ---
  const setDbBuffer = useCallback((buffer: Uint8Array | null) => {
    dispatch({ type: 'SET_DB_BUFFER', payload: buffer });
  }, []);

  const setInventoryType = useCallback((type: "weekly" | "monthly" | null) => {
    dispatch({ type: 'SET_INVENTORY_TYPE', payload: type });
  }, []);

  const setRawInventoryItemsFromDb = useCallback((data: InventoryItem[]) => {
    dispatch({ type: 'SET_RAW_INVENTORY_ITEMS_FROM_DB', payload: data });
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

    try {
      if (!db.isOpen()) await db.open(); // Ensure DB is open
      // Use .toCollection().filter() for robustness against potential index issues
      const pendingSessions = await db.sessions.toCollection().filter(r => r.sync_pending === true).count();
      const pendingProductRules = await db.productRules.toCollection().filter(r => r.sync_pending === true).count();

      if (pendingSessions > 0 || pendingProductRules > 0) {
        dispatch({ type: 'SET_SYNC_STATUS', payload: 'pending' });
      } else {
        dispatch({ type: 'SET_SYNC_STATUS', payload: 'synced' });
      }
    } catch (e) {
      console.error("Error checking sync status from Dexie:", e);
      // If an error occurs, set status to error but don't re-throw or block.
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
      // Do not show toast here, as it might be frequent
    }
  }, [state.isOnline]);

  // --- DERIVED STATE: filteredInventoryData ---
  const filteredInventoryData = useMemo(() => {
    if (!state.rawInventoryItemsFromDb || state.rawInventoryItemsFromDb.length === 0) {
      previousFilteredInventoryDataRef.current = [];
      return [];
    }

    const masterConfigsMap = new Map(state.masterProductConfigs.map(config => [config.productId, config]));
    const previousDataMap = new Map(previousFilteredInventoryDataRef.current.map(item => [item.productId, item]));

    const newFilteredData: InventoryItem[] = [];

    state.rawInventoryItemsFromDb.forEach(item => {
      const masterConfig = masterConfigsMap.get(item.productId);
      
      // Si no hay configuración maestra, o si está oculta, no incluirla
      if (!masterConfig || masterConfig.isHidden) {
        return;
      }

      // Fusionar con datos anteriores para preservar physicalQuantity y hasBeenEdited
      const previousItem = previousDataMap.get(item.productId);
      newFilteredData.push({
        ...item,
        physicalQuantity: previousItem ? previousItem.physicalQuantity : item.systemQuantity,
        hasBeenEdited: previousItem ? previousItem.hasBeenEdited : false,
        // Asegurarse de que las reglas y el proveedor vengan de la configuración maestra
        rules: masterConfig.rules,
        supplier: masterConfig.supplier,
      });
    });

    // Actualizar la referencia para la próxima renderización
    previousFilteredInventoryDataRef.current = newFilteredData;
    return newFilteredData;
  }, [state.rawInventoryItemsFromDb, state.masterProductConfigs]);


  // --- Core Persistence Functions (Sessions) ---
  const saveCurrentSession = useCallback(async (
    data: InventoryItem[], // Ahora espera la lista filtrada
    type: "weekly" | "monthly",
    timestamp: Date,
    orders?: { [supplier: string]: OrderItem[] } // Usar OrderItem[]
  ) => {
    if (!data || data.length === 0) return;

    const dateKey = format(timestamp, 'yyyy-MM-dd');
    const effectiveness = calculateEffectiveness(data);
    const nowIso = new Date().toISOString(); // Timestamp de actualización

    try {
      if (!db.isOpen()) await db.open(); // Emergency validation
      const existingSession = await db.sessions.get(dateKey);
      const ordersToSave = orders !== undefined ? orders : existingSession?.ordersBySupplier;

      const sessionToSave: InventorySession = {
        dateKey,
        inventoryType: type,
        inventoryData: data, // Guardar la lista filtrada con las cantidades físicas
        timestamp,
        effectiveness,
        ordersBySupplier: ordersToSave,
        sync_pending: true, // Marcar como pendiente inicialmente
        updated_at: nowIso, // Establecer updated_at
      };

      await db.sessions.put(sessionToSave); // Guardar en Dexie

      if (!state.sessionId) {
        dispatch({ type: 'SET_SESSION_ID', payload: dateKey });
      }

      if (supabase && state.isOnline) {
        // Mapear explícitamente los campos para Supabase usando tipos correctos
        const supabaseSession: Database['public']['Tables']['inventory_sessions']['Insert'] = {
          dateKey: sessionToSave.dateKey,
          inventoryType: sessionToSave.inventoryType,
          inventoryData: sessionToSave.inventoryData,
          timestamp: sessionToSave.timestamp.toISOString(), // Convertir a ISO string para Supabase
          effectiveness: sessionToSave.effectiveness,
          ordersBySupplier: sessionToSave.ordersBySupplier,
          updated_at: sessionToSave.updated_at, // Incluir updated_at
        };
        const { error } = await (supabase
          .from('inventory_sessions') as any) // Castear a any
          .upsert(supabaseSession, { onConflict: 'dateKey' });

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
        // Cargar directamente en rawInventoryItemsFromDb, el useMemo se encargará de filtrar y fusionar
        dispatch({ type: 'SET_RAW_INVENTORY_ITEMS_FROM_DB', payload: session.inventoryData }); 
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
  const loadMasterProductConfigs = useCallback(async (includeHidden: boolean = false): Promise<MasterProductConfig[]> => {
    try {
      if (!db.isOpen()) await db.open(); // Ensure DB is open
      const allConfigs = await db.productRules.toArray();
      const filteredConfigs = includeHidden ? allConfigs : allConfigs.filter(config => !config.isHidden);
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
      const nowIso = new Date().toISOString(); // Timestamp de actualización
      const configToSave = { ...config, productId: Number(config.productId), sync_pending: true, updated_at: nowIso }; // Marcar como pendiente y establecer updated_at
      await db.productRules.put(configToSave);
      
      if (supabase && state.isOnline) {
        // Mapear explícitamente los campos para Supabase usando tipos correctos
        const supabaseConfig: Database['public']['Tables']['product_rules']['Insert'] = {
          productId: configToSave.productId,
          productName: configToSave.productName,
          rules: configToSave.rules,
          supplier: configToSave.supplier,
          isHidden: configToSave.isHidden || false, // Asegurar que isHidden siempre sea booleano
          updated_at: configToSave.updated_at, // Incluir updated_at
        };
        const { error } = await (supabase
          .from('product_rules') as any) // Castear a any
          .upsert(supabaseConfig, { onConflict: 'productId' });

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
      // No es necesario filtrar aquí, loadMasterProductConfigs ya lo hace
      await loadMasterProductConfigs(); 
      updateSyncStatus();
    } catch (e) {
      console.error("Error saving master product config:", e);
      showError('Error al guardar la configuración del producto localmente.');
      throw e;
    }
  }, [state.isOnline, updateSyncStatus, loadMasterProductConfigs]);

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

  const deleteMasterProductConfig = useCallback(async (productId: number) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      if (!db.isOpen()) await db.open(); // Emergency validation
      const numericProductId = Number(productId);
      
      const currentConfig = await db.productRules.get(numericProductId);
      if (!currentConfig) {
        throw new Error(`Product config with ID ${numericProductId} not found.`);
      }

      const newIsHidden = !currentConfig.isHidden; // Toggle the isHidden status
      const nowIso = new Date().toISOString(); // Timestamp de actualización

      // Realizar soft delete localmente y marcar como pendiente
      await db.productRules.update(numericProductId, { isHidden: newIsHidden, sync_pending: true, updated_at: nowIso });
      
      if (supabase && state.isOnline) {
        // Al ocultar (soft-delete), solo enviamos los campos relevantes a Supabase
        const { error } = await (supabase
          .from('product_rules') as any) // Castear a any
          .update({ isHidden: newIsHidden, updated_at: nowIso })
          .eq('productId', numericProductId);

        if (error) {
          console.error("Error toggling master product config from Supabase:", error);
          showError('Error al sincronizar el estado de visibilidad del producto con la nube. Se reintentará.');
          // Keep sync_pending: true in Dexie
        } else {
          await db.productRules.update(numericProductId, { sync_pending: false }); // Marcar como sincronizado en Dexie
          console.log("Master product config visibility toggled in Supabase successfully.");
        }
      } else {
        console.log("Supabase client not available or offline, skipping visibility toggle to Supabase. Marked as sync_pending.");
      }
      showSuccess(`Configuración de producto ${newIsHidden ? 'ocultada' : 'restaurada'}.`);

      // Refrescar configs (esto disparará la re-evaluación de filteredInventoryData)
      await loadMasterProductConfigs(showHiddenProducts); // Usar el estado actual del toggle
      // No es necesario pasar showHiddenProducts aquí, loadMasterProductConfigs ya lo maneja

      // Si hay una sesión activa, guardar el estado actual de filteredInventoryData
      if (state.sessionId && state.inventoryType && filteredInventoryData.length > 0) {
        await saveCurrentSession(filteredInventoryData, state.inventoryType, new Date());
      }
    } catch (e) {
      console.error("Error toggling master product config:", e);
      showError('Error al cambiar la visibilidad de la configuración de producto.');
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.isOnline, updateSyncStatus, loadMasterProductConfigs, state.sessionId, state.inventoryType, filteredInventoryData, saveCurrentSession]);

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
          dispatch({ type: 'SET_RAW_INVENTORY_ITEMS_FROM_DB', payload: [] }); // Actualizar el nuevo estado
          dispatch({ type: 'SET_INVENTORY_TYPE', payload: type });
          dispatch({ type: 'SET_SESSION_ID', payload: format(new Date(), 'yyyy-MM-dd') });
          showError('No se encontraron productos de inventario en la base de datos.');
          return;
        }

        if (!db.isOpen()) await db.open(); // Emergency validation
        const allMasterProductConfigs = await db.productRules.toArray();
        const masterProductConfigsMap = new Map(allMasterProductConfigs.map(config => [config.productId, config]));

        let processedInventory: InventoryItem[] = [];
        const configsToUpdateOrAddInDexie: MasterProductConfig[] = [];
        const configsToUpsertToSupabase: MasterProductConfig[] = [];
        const nowIso = new Date().toISOString(); // Timestamp de actualización

        rawInventoryItems.forEach((dbItem) => {
          if (dbItem.ProductId === null || dbItem.ProductId === undefined || isNaN(Number(dbItem.ProductId)) || Number(dbItem.ProductId) === 0) {
            console.warn("Skipping product due to invalid ProductId:", dbItem);
            return;
          }
          const currentProductId = Number(dbItem.ProductId);

          let supplierNameFromDb = dbItem.SupplierName;
          const lowerCaseSupplierName = supplierNameFromDb.toLowerCase();

          if (lowerCaseSupplierName.includes("finca yaruqui") || lowerCaseSupplierName.includes("elbe")) {
            supplierNameFromDb = "ELBE S.A.";
          } else if (lowerCaseSupplierName.includes("ac bebidas")) {
            supplierNameFromDb = "AC Bebidas (Coca Cola)";
          }

          const productsToForceACBebidas = ["Coca Cola", "Fioravanti", "Fanta", "Sprite", "Imperial Toronja"];
          if (productsToForceACBebidas.some(p => dbItem.Producto.includes(p))) {
            supplierNameFromDb = "AC Bebidas (Coca Cola)";
          }

          let masterConfig = masterProductConfigsMap.get(currentProductId);
          let configChanged = false;

          if (!masterConfig) {
            // Nuevo producto: usar datos del DB
            masterConfig = {
              productId: currentProductId,
              productName: dbItem.Producto,
              rules: [], // Reglas vacías por defecto
              supplier: supplierNameFromDb, // Usar proveedor detectado
              isHidden: false,
              sync_pending: true, // Marcar como pendiente para Supabase
              updated_at: nowIso, // Establecer updated_at
            };
            configChanged = true;
          } else {
            // Producto existente: preservar reglas, proveedor y estado oculto. Solo actualizar nombre si cambió.
            const updatedConfig = { ...masterConfig };
            if (updatedConfig.productName !== dbItem.Producto) {
              updatedConfig.productName = dbItem.Producto;
              configChanged = true;
            }
            // No actualizar supplier, rules, isHidden desde DB si ya existen en masterConfig
            // Estos campos son configurables por el usuario y deben persistir.
            masterConfig = updatedConfig; // Usar la versión (potencialmente) actualizada para el inventario
          }

          if (configChanged) {
            masterConfig.sync_pending = true; // Marcar para sincronizar si hubo cambios o es nuevo
            masterConfig.updated_at = nowIso; // Actualizar timestamp
            configsToUpsertToSupabase.push(masterConfig);
          }
          configsToUpdateOrAddInDexie.push(masterConfig); // Siempre añadir a Dexie para asegurar que esté actualizado localmente

          // Añadir el item al inventario procesado (sin filtrar por isHidden aquí)
          processedInventory.push({
            productId: currentProductId,
            productName: dbItem.Producto,
            category: dbItem.Categoria,
            systemQuantity: dbItem.Stock_Actual,
            physicalQuantity: dbItem.Stock_Actual, // Default
            averageSales: 0, // No disponible en esta consulta
            supplier: masterConfig.supplier, // Usar el proveedor de la config maestra
            hasBeenEdited: false, // Default
            rules: masterConfig.rules, // Usar las reglas de la config maestra
          });
        });

        // Actualizar Dexie con todas las configuraciones (nuevas y existentes con posibles cambios de nombre)
        if (configsToUpdateOrAddInDexie.length > 0) {
          await db.productRules.bulkPut(configsToUpdateOrAddInDexie);
          console.log(`Updated/Added ${configsToUpdateOrAddInDexie.length} master product configs in Dexie.`);
        }
        
        // Sincronizar con Supabase solo los que tienen sync_pending: true
        if (supabase && state.isOnline && configsToUpsertToSupabase.length > 0) {
          const supabaseConfigs: Database['public']['Tables']['product_rules']['Insert'][] = configsToUpsertToSupabase.map(c => ({
            productId: c.productId,
            productName: c.productName,
            rules: c.rules,
            supplier: c.supplier,
            isHidden: c.isHidden || false,
            updated_at: c.updated_at, // Incluir updated_at
          }));
          const { error: supabaseUpsertError } = await (supabase
            .from('product_rules') as any) // Castear a any
            .upsert(supabaseConfigs, { onConflict: 'productId' });

          if (supabaseUpsertError) {
            console.error("Error bulk upserting master product configs to Supabase:", supabaseUpsertError);
            showError('Error al sincronizar configuraciones de producto con la nube. Se reintentará.');
          } else {
            // Marcar como sincronizado en Dexie para los que se subieron con éxito
            for (const config of configsToUpsertToSupabase) {
              await db.productRules.update(config.productId, { sync_pending: false });
            }
            showSuccess('Configuraciones de productos actualizadas y sincronizadas.');
          }
        } else if (configsToUpsertToSupabase.length > 0) {
          console.log("Supabase client not available or offline, skipping bulk upsert to Supabase. Marked as sync_pending.");
          showSuccess('Configuraciones de productos actualizadas localmente (pendientes de sincronizar).');
        }

        // Filtrar productos "KYR S.A.S" y "Desconocido" después de procesar
        const finalProcessedInventory = processedInventory.filter(item => item.supplier !== "KYR S.A.S" && item.supplier !== "Desconocido");

        dispatch({ type: 'SET_RAW_INVENTORY_ITEMS_FROM_DB', payload: finalProcessedInventory }); // Actualizar el nuevo estado
        dispatch({ type: 'SET_INVENTORY_TYPE', payload: type });

        const dateKey = format(new Date(), 'yyyy-MM-dd');
        const effectiveness = calculateEffectiveness(finalProcessedInventory); // Calcular con la lista completa

        // Guardar en Dexie y luego intentar sincronizar
        const newSession: InventorySession = {
          dateKey,
          inventoryType: type,
          inventoryData: finalProcessedInventory, // Guardar la lista completa para la sesión
          timestamp: new Date(),
          effectiveness,
          sync_pending: true, // Marcar como pendiente
          updated_at: nowIso, // Establecer updated_at
        };
        await db.sessions.put(newSession);
        dispatch({ type: 'SET_SESSION_ID', payload: dateKey });

        if (supabase && state.isOnline) {
          // Mapear explícitamente los campos para Supabase usando tipos correctos
          const supabaseSession: Database['public']['Tables']['inventory_sessions']['Insert'] = {
            dateKey: newSession.dateKey,
            inventoryType: newSession.inventoryType,
            inventoryData: newSession.inventoryData,
            timestamp: newSession.timestamp.toISOString(), // Convertir a ISO string para Supabase
            effectiveness: newSession.effectiveness,
            ordersBySupplier: newSession.ordersBySupplier,
            updated_at: newSession.updated_at, // Incluir updated_at
          };
          const { error } = await (supabase
            .from('inventory_sessions') as any) // Castear a any
            .upsert(supabaseSession, { onConflict: 'dateKey' });

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

      const configsToUpdateOrAddInDexie: MasterProductConfig[] = [];
      const configsToUpsertToSupabase: MasterProductConfig[] = [];
      let newProductsCount = 0;
      let updatedProductNamesCount = 0;
      const nowIso = new Date().toISOString(); // Timestamp de actualización

      for (const dbItem of rawInventoryItems) {
        if (dbItem.ProductId === null || dbItem.ProductId === undefined || isNaN(Number(dbItem.ProductId)) || Number(dbItem.ProductId) === 0) {
          console.warn("Skipping product due to invalid ProductId:", dbItem);
          continue;
        }
        const currentProductId = Number(dbItem.ProductId);

        let supplierNameFromDb = dbItem.SupplierName;
        const lowerCaseSupplierName = supplierNameFromDb.toLowerCase();

        if (lowerCaseSupplierName.includes("finca yaruqui") || lowerCaseSupplierName.includes("elbe")) {
          supplierNameFromDb = "ELBE S.A.";
        } else if (lowerCaseSupplierName.includes("ac bebidas")) {
          supplierNameFromDb = "AC Bebidas (Coca Cola)";
        }

        const productsToForceACBebidas = ["Coca Cola", "Fioravanti", "Fanta", "Sprite", "Imperial Toronja"];
        if (productsToForceACBebidas.some(p => dbItem.Producto.includes(p))) {
          supplierNameFromDb = "AC Bebidas (Coca Cola)";
        }

        let masterConfig = masterProductConfigsMap.get(currentProductId);
        let configChangedForSync = false; // Flag para saber si este item debe ir a Supabase

        if (!masterConfig) {
          // Nuevo producto: usar datos del DB
          masterConfig = {
            productId: currentProductId,
            productName: dbItem.Producto,
            rules: [], // Reglas vacías por defecto
            supplier: supplierNameFromDb, // Usar proveedor detectado
            isHidden: false,
            sync_pending: true, // Marcar como pendiente para Supabase
            updated_at: nowIso, // Establecer updated_at
          };
          newProductsCount++;
          configChangedForSync = true;
        } else {
          // Producto existente: preservar reglas, proveedor y estado oculto.
          // Solo actualizar productName si ha cambiado.
          const updatedConfig = { ...masterConfig };
          if (updatedConfig.productName !== dbItem.Producto) {
            updatedConfig.productName = dbItem.Producto;
            updatedProductNamesCount++;
            configChangedForSync = true;
          }
          // Los campos supplier, rules, isHidden se mantienen de la configuración existente (masterConfig)
          masterConfig = updatedConfig; // Usar la versión (potencialmente) actualizada para Dexie
        }

        // Si hubo un cambio (nuevo producto o nombre actualizado) o ya estaba pendiente, marcar para Supabase
        if (configChangedForSync || masterConfig.sync_pending) {
          masterConfig.sync_pending = true;
          masterConfig.updated_at = nowIso; // Actualizar timestamp
          configsToUpsertToSupabase.push(masterConfig);
        }
        configsToUpdateOrAddInDexie.push(masterConfig); // Siempre añadir a Dexie para asegurar que esté actualizado localmente
      }

      if (configsToUpdateOrAddInDexie.length > 0) {
        await db.productRules.bulkPut(configsToUpdateOrAddInDexie);
        console.log(`Updated/Added ${configsToUpdateOrAddInDexie.length} master product configs in Dexie.`);
      }
      
      // Sincronizar con Supabase solo los que tienen sync_pending: true
      const pendingForSupabase = configsToUpsertToSupabase.filter(c => c.sync_pending);
      if (supabase && state.isOnline && pendingForSupabase.length > 0) {
        const supabaseConfigs: Database['public']['Tables']['product_rules']['Insert'][] = pendingForSupabase.map(c => ({
          productId: c.productId,
          productName: c.productName,
          rules: c.rules,
          supplier: c.supplier,
          isHidden: c.isHidden || false,
          updated_at: c.updated_at, // Incluir updated_at
        }));
        const { error: supabaseUpsertError } = await (supabase
          .from('product_rules') as any) // Castear a any
          .upsert(supabaseConfigs, { onConflict: 'productId' });

        if (supabaseUpsertError) {
          console.error("Error bulk upserting master product configs to Supabase:", supabaseUpsertError);
          showError('Error al sincronizar configuraciones de producto con la nube. Se reintentará.');
        } else {
          // Marcar como sincronizado en Dexie para los que se subieron con éxito
          for (const config of pendingForSupabase) {
            await db.productRules.update(config.productId, { sync_pending: false });
          }
          let successMessage = '';
          if (newProductsCount > 0) {
            successMessage += `Se agregaron ${newProductsCount} nuevos productos. `;
          }
          if (updatedProductNamesCount > 0) {
            successMessage += `Se actualizaron ${updatedProductNamesCount} nombres de productos. `;
          }
          if (successMessage === '') {
            successMessage = 'Configuraciones de productos sincronizadas.';
          }
          showSuccess(successMessage.trim());
        }
      } else if (pendingForSupabase.length > 0) {
        let localMessage = '';
        if (newProductsCount > 0) {
          localMessage += `Se agregaron ${newProductsCount} nuevos productos. `;
        }
        if (updatedProductNamesCount > 0) {
          localMessage += `Se actualizaron ${updatedProductNamesCount} nombres de productos. `;
        }
        if (localMessage === '') {
          localMessage = 'Configuraciones de productos actualizadas localmente.';
        }
        showSuccess(`${localMessage.trim()} (pendientes de sincronizar).`);
      } else {
        showSuccess('No se encontraron nuevos productos o cambios de nombre para agregar/actualizar.');
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
  }, [state.isOnline, loadMasterProductConfigs, updateSyncStatus, state.masterProductConfigs]);


  // --- Auto-Retry Mechanism ---
  const retryPendingSyncs = useCallback(async () => {
    if (!supabase || !state.isOnline || state.isSupabaseSyncInProgress) { // Usar isSupabaseSyncInProgress
      return;
    }

    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true }); // Marcar como en progreso
    console.log("Attempting to retry pending syncs...");

    try {
      if (!db.isOpen()) await db.open(); // Emergency validation

      // Retry pending sessions
      const pendingSessions = await db.sessions.toCollection().filter(r => r.sync_pending === true).toArray(); // Explicitly query for true
      for (const session of pendingSessions) {
        console.log(`Retrying session: ${session.dateKey}`);
        // Mapear explícitamente los campos para Supabase usando tipos correctos
        const supabaseSession: Database['public']['Tables']['inventory_sessions']['Insert'] = {
          dateKey: session.dateKey,
          inventoryType: session.inventoryType,
          inventoryData: session.inventoryData,
          timestamp: session.timestamp.toISOString(),
          effectiveness: session.effectiveness,
          ordersBySupplier: session.ordersBySupplier,
          updated_at: session.updated_at, // Incluir updated_at
        };
        const { error } = await (supabase
          .from('inventory_sessions') as any) // Castear a any
          .upsert(supabaseSession, { onConflict: 'dateKey' });
        if (error) {
          console.error(`Failed to retry session ${session.dateKey}:`, error);
          dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
        } else {
          await db.sessions.update(session.dateKey, { sync_pending: false });
          console.log(`Session ${session.dateKey} synced successfully.`);
        }
      }

      // Retry pending product configs
      const pendingProductRules = await db.productRules.toCollection().filter(r => r.sync_pending === true).toArray(); // Explicitly query for true
      for (const config of pendingProductRules) {
        console.log(`Retrying product config: ${config.productName} (${config.productId})`);
        // Mapear explícitamente los campos para Supabase usando tipos correctos
        const supabaseConfig: Database['public']['Tables']['product_rules']['Insert'] = {
          productId: config.productId,
          productName: config.productName,
          rules: config.rules,
          supplier: config.supplier,
          isHidden: config.isHidden || false,
          updated_at: config.updated_at, // Incluir updated_at
        };
        const { error } = await (supabase
          .from('product_rules') as any) // Castear a any
          .upsert(supabaseConfig, { onConflict: 'productId' });
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
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false }); // Finalizar
      updateSyncStatus(); // Update status based on remaining pending items
    }
  }, [state.isOnline, state.isSupabaseSyncInProgress, updateSyncStatus]);


  // --- NEW: Perform Total Sync (Upload local, then Download cloud) ---
  // Esta función ahora se usará para la sincronización inicial y al cambiar de pestaña
  const syncFromSupabase = useCallback(async () => {
    if (!supabase || !state.isOnline || state.isSupabaseSyncInProgress) { // Usar isSupabaseSyncInProgress
      console.log('No se puede realizar la sincronización: sin conexión, ya procesando o Supabase no disponible.');
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' });
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true }); // Marcar como en progreso
    console.log("Iniciando sincronización bidireccional (subiendo cambios y descargando actualizaciones)...");

    try {
      if (!db.isOpen()) await db.open();

      // 1. Upload all local pending data to Supabase
      console.log("Uploading local pending sessions...");
      const pendingLocalSessions = await db.sessions.toCollection().filter(r => r.sync_pending === true).toArray();
      for (const session of pendingLocalSessions) {
        const supabaseSession: Database['public']['Tables']['inventory_sessions']['Insert'] = {
          dateKey: session.dateKey,
          inventoryType: session.inventoryType,
          inventoryData: session.inventoryData,
          timestamp: session.timestamp.toISOString(),
          effectiveness: session.effectiveness,
          ordersBySupplier: session.ordersBySupplier,
          updated_at: session.updated_at,
        };
        const { error } = await (supabase
          .from('inventory_sessions') as any)
          .upsert(supabaseSession, { onConflict: 'dateKey' });
        if (error) {
          console.error(`Error uploading pending session ${session.dateKey} to Supabase:`, error);
        } else {
          await db.sessions.update(session.dateKey, { sync_pending: false });
        }
      }
      console.log("Uploading local pending product configs...");
      const pendingLocalProductRules = await db.productRules.toCollection().filter(r => r.sync_pending === true).toArray();
      for (const config of pendingLocalProductRules) {
        const supabaseConfig: Database['public']['Tables']['product_rules']['Insert'] = {
          productId: config.productId,
          productName: config.productName,
          rules: config.rules,
          supplier: config.supplier,
          isHidden: config.isHidden || false,
          updated_at: config.updated_at,
        };
        const { error } = await (supabase
          .from('product_rules') as any)
          .upsert(supabaseConfig, { onConflict: 'productId' });
        if (error) {
          console.error(`Error uploading pending product config ${config.productId} to Supabase:`, error);
        } else {
          await db.productRules.update(config.productId, { sync_pending: false });
        }
      }
      console.log('Cambios locales subidos a la nube.');

      // 2. Download all Supabase data to local Dexie (with merge logic)
      console.log("Downloading all sessions from Supabase...");
      const { data: supabaseSessions, error: sessionsError } = await supabase
        .from('inventory_sessions')
        .select('*');
      if (sessionsError) throw sessionsError;

      const localSessionsMap = new Map((await db.sessions.toArray()).map(s => [s.dateKey, s]));
      const sessionsToPutLocally: InventorySession[] = [];

      if (supabaseSessions && supabaseSessions.length > 0) {
        for (const s of supabaseSessions) {
          const typedSession: InventorySession = {
            dateKey: s.dateKey,
            inventoryType: s.inventoryType,
            inventoryData: s.inventoryData,
            timestamp: new Date(s.timestamp), // Convertir de string a Date
            effectiveness: s.effectiveness,
            ordersBySupplier: s.ordersBySupplier,
            sync_pending: false, // Asumir que lo que viene de Supabase ya está sincronizado
            updated_at: s.updated_at,
          };
          const localSession = localSessionsMap.get(typedSession.dateKey);

          if (!localSession || new Date(typedSession.updated_at) > new Date(localSession.updated_at)) {
            // Si no existe localmente o la versión remota es más nueva, usar la remota
            sessionsToPutLocally.push(typedSession);
          } else if (new Date(localSession.updated_at) >= new Date(typedSession.updated_at) && localSession.sync_pending === true) {
            // Si la versión local es más nueva o igual Y está pendiente de sincronizar,
            // NO sobrescribir con la versión remota (ya que la local es la fuente de verdad más reciente)
            // La versión local ya se intentó subir en el paso 1.
            console.log(`Keeping local pending session ${localSession.dateKey} as it's newer or same and pending.`);
          } else {
            // Si la versión local es más antigua o igual y NO está pendiente,
            // significa que la remota es la fuente de verdad o son iguales.
            // En este caso, si no se añadió antes, se añade ahora.
            // Esto cubre el caso de que localSession.updated_at === typedSession.updated_at
            // y localSession.sync_pending === false.
            sessionsToPutLocally.push(typedSession);
          }
        }
        await db.sessions.bulkPut(sessionsToPutLocally);
      } else {
        // Si no hay sesiones en Supabase, limpiar solo las que no están pendientes localmente
        const localNonPendingSessions = await db.sessions.toCollection().filter(s => s.sync_pending === false).toArray();
        if (localNonPendingSessions.length > 0) {
          await db.sessions.bulkDelete(localNonPendingSessions.map(s => s.dateKey));
        }
      }

      console.log("Downloading all product configs from Supabase...");
      const { data: supabaseProductRules, error: productRulesError } = await supabase
        .from('product_rules')
        .select('*');
      if (productRulesError) throw productRulesError;

      const localProductRulesMap = new Map((await db.productRules.toArray()).map(c => [c.productId, c]));
      const productRulesToPutLocally: MasterProductConfig[] = [];

      if (supabaseProductRules && supabaseProductRules.length > 0) {
        for (const c of supabaseProductRules) {
          const typedConfig: MasterProductConfig = {
            productId: c.productId,
            productName: c.productName,
            rules: c.rules,
            supplier: c.supplier,
            isHidden: c.isHidden || false,
            sync_pending: false,
            updated_at: c.updated_at,
          };
          const localConfig = localProductRulesMap.get(typedConfig.productId);

          if (!localConfig || new Date(typedConfig.updated_at) > new Date(localConfig.updated_at)) {
            productRulesToPutLocally.push(typedConfig);
          } else if (new Date(localConfig.updated_at) >= new Date(typedConfig.updated_at) && localConfig.sync_pending === true) {
            console.log(`Keeping local pending product config ${localConfig.productId} as it's newer or same and pending.`);
          } else {
            productRulesToPutLocally.push(typedConfig);
          }
        }
        await db.productRules.bulkPut(productRulesToPutLocally);
      } else {
        // Si no hay reglas en Supabase, limpiar solo las que no están pendientes localmente
        const localNonPendingProductRules = await db.productRules.toCollection().filter(c => c.sync_pending === false).toArray();
        if (localNonPendingProductRules.length > 0) {
          await db.productRules.bulkDelete(localNonPendingProductRules.map(c => c.productId));
        }
      }
      console.log('Configuraciones y sesiones descargadas de la nube.');

      console.log("Sincronización bidireccional finalizada con éxito.");
      await loadMasterProductConfigs(); // Recargar configs para reflejar cualquier cambio
    } catch (e: any) {
      console.error("Error during syncFromSupabase (total sync):", e);
      dispatch({ type: 'SET_ERROR', payload: e.message });
      showError(`Error en la sincronización: ${e.message}`);
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false }); // Finalizar
      updateSyncStatus();
    }
  }, [state.isOnline, state.isSupabaseSyncInProgress, loadMasterProductConfigs, updateSyncStatus]);

  // Nueva función para sincronización al cambiar de pestaña
  const handleVisibilityChangeSync = useCallback(async () => {
    if (document.visibilityState === 'visible' && !state.isSupabaseSyncInProgress) { // Usar isSupabaseSyncInProgress
      console.log("Tab became visible, performing quick sync...");
      await syncFromSupabase(); // Reutilizar la función de sincronización total
    }
  }, [syncFromSupabase, state.isSupabaseSyncInProgress]);


  // --- NEW: Reset All Product Configurations ---
  const resetAllProductConfigs = useCallback(async (buffer: Uint8Array) => {
    if (!supabase || !state.isOnline || state.isSupabaseSyncInProgress) { // Usar isSupabaseSyncInProgress
      showError('No se puede reiniciar la configuración: sin conexión, ya procesando o Supabase no disponible.');
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' });
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true }); // Marcar como en progreso
    showSuccess('Reiniciando todas las configuraciones de productos...');
    console.log("Starting reset all product configurations...");

    try {
      if (!db.isOpen()) await db.open();

      // 1. Limpiar la tabla local de productRules
      await db.productRules.clear();

      // 2. Eliminar todas las product_rules de Supabase
      const { error: deleteError } = await supabase
        .from('product_rules')
        .delete()
        .neq('productId', 0); // Eliminar todos los registros (productId > 0)

      if (deleteError) throw deleteError;
      console.log("All product rules deleted from Supabase.");

      // 3. Recargar los productos del .db como si fuera la primera vez
      await processDbForMasterConfigs(buffer);
      showSuccess('Configuración de productos reiniciada y cargada desde el archivo DB.');

    } catch (e: any) {
      console.error("Error during resetAllProductConfigs:", e);
      dispatch({ type: 'SET_ERROR', payload: e.message });
      showError(`Error al reiniciar la configuración: ${e.message}`);
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false }); // Finalizar
      updateSyncStatus();
    }
  }, [state.isOnline, state.isSupabaseSyncInProgress, processDbForMasterConfigs, updateSyncStatus]);

  // --- NEW: Clear Local Database ---
  const clearLocalDatabase = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    showSuccess('Limpiando base de datos local...');
    console.log("Starting clear local database...");

    try {
      if (db.isOpen()) {
        await db.close(); // Cerrar la conexión antes de eliminar
      }
      await db.delete(); // Eliminar toda la base de datos IndexedDB
      await db.open(); // Volver a abrir la conexión para futuras operaciones

      // Resetear el estado de la aplicación
      dispatch({ type: 'RESET_STATE' });
      dispatch({ type: 'SET_MASTER_PRODUCT_CONFIGS', payload: [] }); // Asegurarse de que las configs maestras también se reseteen
      showSuccess('Base de datos local limpiada con éxito.');
      console.log("Local database cleared successfully.");
    } catch (e: any) {
      console.error("Error during clearLocalDatabase:", e);
      dispatch({ type: 'SET_ERROR', payload: e.message });
      showError(`Error al limpiar la base de datos local: ${e.message}`);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
      updateSyncStatus(); // Actualizar el estado de sincronización
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
    filteredInventoryData, // Exponer la propiedad computada
    setDbBuffer,
    setInventoryType,
    setRawInventoryItemsFromDb, // Nuevo setter
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
    handleVisibilityChangeSync,
    resetAllProductConfigs,
    clearLocalDatabase,
  }), [
    state,
    filteredInventoryData, // Añadir como dependencia
    setDbBuffer,
    setInventoryType,
    setRawInventoryItemsFromDb,
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
    handleVisibilityChangeSync,
    resetAllProductConfigs,
    clearLocalDatabase,
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