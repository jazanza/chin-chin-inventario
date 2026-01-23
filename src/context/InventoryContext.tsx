import React, { createContext, useReducer, useContext, useCallback, useEffect, useMemo, useRef } from "react";
import { initDb, loadDb, queryData } from "@/lib/db";
import productData from "@/data/product-data.json"; // Mantener por ahora, aunque su uso se reducirá
import { db, InventorySession, MasterProductConfig, ProductRule, SupplierConfig } from "@/lib/persistence";
import { format } from "date-fns";
import { showSuccess, showError } from "@/utils/toast";
import debounce from "lodash.debounce";
import { supabase } from "@/lib/supabase";
import { Database } from '@/lib/supabase'; // Importar tipos de base de datos
import { RealtimeChannel, RealtimeChannelStatus } from '@supabase/supabase-js'; // Importar RealtimeChannel y RealtimeChannelStatus

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
  isSyncBlockedWarningActive: boolean; // Nuevo estado para controlar la advertencia de bloqueo
  realtimeStatus: RealtimeChannelStatus; // Nuevo estado para el estado del canal de Realtime
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
  isSyncBlockedWarningActive: false, // Inicializar en false
  realtimeStatus: 'disconnected', // Inicializar en desconectado
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
  | { type: 'SET_SYNC_BLOCKED_WARNING_ACTIVE'; payload: boolean } // Nueva acción
  | { type: 'SET_REALTIME_STATUS'; payload: RealtimeChannelStatus } // Nueva acción
  | { type: 'UPDATE_SINGLE_PRODUCT_RULE'; payload: MasterProductConfig } // Nueva acción
  | { type: 'UPDATE_CURRENT_SESSION_DATA'; payload: { dateKey: string, inventoryData: InventoryItem[], effectiveness: number } } // Nueva acción para current session
  | { type: 'DELETE_SESSION'; payload: string } // Nueva acción para eliminar sesión de la lista
  | { type: 'DELETE_PRODUCT_RULE'; payload: number } // Nueva acción para eliminar regla de producto
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
    case 'SET_SUPABASE_SYNC_IN_PROGRESS':
      return { ...state, isSupabaseSyncInProgress: action.payload };
    case 'SET_SYNC_BLOCKED_WARNING_ACTIVE':
      return { ...state, isSyncBlockedWarningActive: action.payload };
    case 'SET_REALTIME_STATUS':
      return { ...state, realtimeStatus: action.payload };
    case 'UPDATE_SINGLE_PRODUCT_RULE': {
      const updatedConfig = action.payload;
      
      // Si el producto está oculto, removerlo de la lista visible
      if (updatedConfig.isHidden) {
        return { 
          ...state, 
          masterProductConfigs: state.masterProductConfigs.filter(c => c.productId !== updatedConfig.productId)
        };
      }

      const existingIndex = state.masterProductConfigs.findIndex(c => c.productId === updatedConfig.productId);
      
      let newConfigs;
      if (existingIndex !== -1) {
        newConfigs = [...state.masterProductConfigs];
        newConfigs[existingIndex] = updatedConfig;
      } else {
        // Si es una nueva configuración y no está oculta, añadirla
        newConfigs = [...state.masterProductConfigs, updatedConfig];
      }
      
      return { ...state, masterProductConfigs: newConfigs };
    }
    case 'UPDATE_CURRENT_SESSION_DATA': {
      if (state.sessionId === action.payload.dateKey) {
        // Solo actualizar si esta es la sesión activa
        return { 
          ...state, 
          rawInventoryItemsFromDb: action.payload.inventoryData,
          // No es necesario actualizar la efectividad aquí, ya que filteredInventoryData la recalculará
        };
      }
      return state;
    }
    case 'DELETE_SESSION': {
      // Eliminar la sesión de la lista de historial (si se almacenara en el estado)
      // Nota: El historial se obtiene de Dexie, pero podemos limpiar la sesión activa si coincide
      if (state.sessionId === action.payload) {
        return {
          ...state,
          sessionId: null,
          rawInventoryItemsFromDb: [], // Limpiar datos de inventario
          inventoryType: null,
        };
      }
      return state;
    }
    case 'DELETE_PRODUCT_RULE': {
      // Eliminar la regla de producto de la lista de configuraciones
      return {
        ...state,
        masterProductConfigs: state.masterProductConfigs.filter(c => c.productId !== action.payload),
      };
    }
    case 'RESET_STATE':
      return {
        ...initialState,
        dbBuffer: state.dbBuffer,
        masterProductConfigs: state.masterProductConfigs,
        isOnline: state.isOnline,
        isSupabaseSyncInProgress: false, // Resetear también este estado
        isSyncBlockedWarningActive: false, // Resetear también este estado
        realtimeStatus: 'disconnected', // Resetear también este estado
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
  setSyncStatus: (status: SyncStatus) => void; // Nuevo setter para el estado de sincronización
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
  syncFromSupabase: (origin: string, isUserAction?: boolean) => Promise<void>; // Ahora acepta origen y si es acción de usuario
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
  const warnedItems = useRef(new Set<string>()); // Para evitar advertencias repetidas
  const syncBlockedWarningTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Ref para el timeout de la advertencia de bloqueo
  const lastSyncTimestampRef = useRef(0); // Nuevo: Referencia para el último timestamp de sincronización exitosa
  const channelsRef = useRef<{ sessions: RealtimeChannel | null; productRules: RealtimeChannel | null }>({ sessions: null, productRules: null }); // Ref para almacenar los canales

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

  const setSyncStatus = useCallback((status: SyncStatus) => {
    dispatch({ type: 'SET_SYNC_STATUS', payload: status });
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

    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true }); // Marcar como en progreso
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

      // Alerta de persistencia: Si no hay Supabase o no hay conexión, advertir inmediatamente
      if (!supabase || !state.isOnline) {
        showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
        updateSyncStatus(); // Actualizar estado de sincronización a 'pending'
        return; // Salir, ya que no se puede sincronizar con Supabase
      }

      // Intentar sincronizar con Supabase
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
        showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
        // Keep sync_pending: true in Dexie
      } else {
        await db.sessions.update(dateKey, { sync_pending: false }); // Marcar como sincronizado en Dexie
        console.log("Session saved to Supabase successfully.");
        warnedItems.current.delete(`session-${dateKey}`); // Limpiar advertencia si se sincronizó
      }
    } catch (e) {
      console.error("Error saving session:", e);
      showError('Error al guardar la sesión localmente.');
      throw e;
    } finally {
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false }); // Liberar el bloqueo
      updateSyncStatus(); // Asegurarse de que el estado de sincronización se actualice
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
    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true }); // Marcar como en progreso

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
          warnedItems.current.delete(`session-${dateKey}`); // Limpiar advertencia si se eliminó
        }
      } else {
        console.log("Supabase client not available or offline, skipping delete from Supabase.");
      }

      showSuccess(`Sesión del ${dateKey} eliminada.`);

      if (state.sessionId === dateKey) {
        dispatch({ type: 'RESET_STATE' });
        dispatch({ type: 'SET_SESSION_ID', payload: null });
      }
    } catch (e) {
      console.error("Error deleting session:", e);
      showError('Error al eliminar la sesión.');
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false }); // Liberar el bloqueo
      updateSyncStatus();
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
      
      // Optimización: Solo disparar dispatch si los datos realmente han cambiado
      const currentConfigs = state.masterProductConfigs;
      const hasChanged = filteredConfigs.length !== currentConfigs.length ||
                         filteredConfigs.some((newConfig, index) => 
                           newConfig.productId !== currentConfigs[index]?.productId ||
                           newConfig.productName !== currentConfigs[index]?.productName ||
                           newConfig.supplier !== currentConfigs[index]?.supplier ||
                           newConfig.isHidden !== currentConfigs[index]?.isHidden ||
                           JSON.stringify(newConfig.rules) !== JSON.stringify(currentConfigs[index]?.rules)
                         );

      if (hasChanged) {
        dispatch({ type: 'SET_MASTER_PRODUCT_CONFIGS', payload: filteredConfigs });
      }
      return filteredConfigs;
    } catch (e) {
      console.error("Error fetching master product configs from Dexie:", e);
      dispatch({ type: 'SET_MASTER_PRODUCT_CONFIGS', payload: [] });
      showError('Error al obtener las configuraciones de producto. Cargando configuración vacía.');
      return [];
    } finally {
      updateSyncStatus();
    }
  }, [updateSyncStatus, state.masterProductConfigs]); // Añadir state.masterProductConfigs como dependencia para la comparación

  const saveMasterProductConfig = useCallback(async (config: MasterProductConfig) => {
    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true }); // Marcar como en progreso
    try {
      if (!db.isOpen()) await db.open(); // Emergency validation
      const nowIso = new Date().toISOString(); // Timestamp de actualización
      const configToSave = { ...config, productId: Number(config.productId), sync_pending: true, updated_at: nowIso }; // Marcar como pendiente y establecer updated_at
      await db.productRules.put(configToSave);
      
      // Alerta de persistencia: Si no hay Supabase o no hay conexión, advertir inmediatamente
      if (!supabase || !state.isOnline) {
        showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
        updateSyncStatus(); // Actualizar estado de sincronización a 'pending'
        await loadMasterProductConfigs(); // Recargar para reflejar cambios locales
        return; // Salir, ya que no se puede sincronizar con Supabase
      }

      // Intentar sincronizar con Supabase
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
        showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
      } else {
        await db.productRules.update(configToSave.productId, { sync_pending: false });
        console.log("Master product config saved to Supabase successfully.");
        warnedItems.current.delete(`product-${configToSave.productId}`); // Limpiar advertencia si se sincronizó
      }
      await loadMasterProductConfigs(); 
    } catch (e) {
      console.error("Error saving master product config:", e);
      showError('Error al guardar la configuración del producto localmente.');
      throw e;
    } finally {
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false }); // Liberar el bloqueo
      updateSyncStatus(); // Asegurarse de que el estado de sincronización se actualice
    }
  }, [state.isOnline, updateSyncStatus, loadMasterProductConfigs]);

  const deleteMasterProductConfig = useCallback(async (productId: number) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true }); // Marcar como en progreso

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
      
      // Alerta de persistencia: Si no hay Supabase o no hay conexión, advertir inmediatamente
      if (!supabase || !state.isOnline) {
        showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
        updateSyncStatus(); // Actualizar estado de sincronización a 'pending'
        await loadMasterProductConfigs(); // Recargar para reflejar cambios locales
        // Si hay una sesión activa, guardar el estado actual de filteredInventoryData
        if (state.sessionId && state.inventoryType && filteredInventoryData.length > 0) {
          await saveCurrentSession(filteredInventoryData, state.inventoryType, new Date());
        }
        return; // Salir
      }

      // Intentar sincronizar con Supabase
      const { error } = await (supabase
        .from('product_rules') as any) // Castear a any
        .update({ isHidden: newIsHidden, updated_at: nowIso })
        .eq('productId', numericProductId);

      if (error) {
        console.error("Error toggling master product config from Supabase:", error);
        showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
      } else {
        await db.productRules.update(numericProductId, { sync_pending: false }); // Marcar como sincronizado en Dexie
        console.log("Master product config visibility toggled in Supabase successfully.");
        warnedItems.current.delete(`product-${numericProductId}`); // Limpiar advertencia si se sincronizó
      }
      showSuccess(`Configuración de producto ${newIsHidden ? 'ocultada' : 'restaurada'}.`);

      await loadMasterProductConfigs(); 

      // Si hay una sesión activa, guardar el estado actual de filteredInventoryData
      if (state.sessionId && state.inventoryType && filteredInventoryData.length > 0) {
        await saveCurrentSession(filteredInventoryData, state.inventoryType, new Date());
      }
    } catch (e) {
      console.error("Error toggling master product config:", e);
      showError('Error al cambiar la visibilidad de la configuración de producto.');
      throw e;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false }); // Liberar el bloqueo
      updateSyncStatus(); // Asegurarse de que el estado de sincronización se actualice
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
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true }); // Marcar como en progreso
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
            showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
          } else {
            // Marcar como sincronizado en Dexie para los que se subieron con éxito
            for (const config of configsToUpsertToSupabase) {
              await db.productRules.update(config.productId, { sync_pending: false });
              warnedItems.current.delete(`product-${config.productId}`); // Limpiar advertencia
            }
            showSuccess('Configuraciones de productos actualizadas y sincronizadas.');
          }
        } else if (configsToUpsertToSupabase.length > 0) {
          console.log("Supabase client not available or offline, skipping bulk upsert to Supabase. Marked as sync_pending.");
          showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
        }

        // Filtrar productos "KYR S.A.S" y "Desconocido" después de procesar
        const finalProcessedInventory = rawInventoryItems.map(dbItem => {
          const currentProductId = Number(dbItem.ProductId);
          const masterConfig = masterProductConfigsMap.get(currentProductId);
          
          // Usar la configuración maestra para reglas y proveedor
          const rules = masterConfig?.rules || [];
          const supplier = masterConfig?.supplier || dbItem.SupplierName; // Fallback a DB si no hay config maestra
          const isHidden = masterConfig?.isHidden || false;

          return {
            productId: currentProductId,
            productName: dbItem.Producto,
            category: dbItem.Categoria,
            systemQuantity: dbItem.Stock_Actual,
            physicalQuantity: dbItem.Stock_Actual, // Inicializar con la cantidad del sistema
            averageSales: 0, // No disponible en esta consulta, mantener 0
            supplier: supplier,
            hasBeenEdited: false,
            rules: rules,
            isHidden: isHidden, // Incluir isHidden para el filtrado posterior
          };
        }).filter(item => !item.isHidden && item.supplier !== "KYR S.A.S" && item.supplier !== "Desconocido");


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
            showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
          } else {
            await db.sessions.update(dateKey, { sync_pending: false });
            showSuccess('Nueva sesión de inventario iniciada y guardada.');
            warnedItems.current.delete(`session-${dateKey}`); // Limpiar advertencia
          }
        } else {
          console.log("Supabase client not available or offline, skipping save to Supabase. Marked as sync_pending.");
          showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
        }
      } catch (e: any) {
        console.error("Error processing database for inventory:", e);
        dispatch({ type: 'SET_ERROR', payload: e.message });
        showError(`Error al procesar el inventario: ${e.message}`);
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
        dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false }); // Liberar el bloqueo
        updateSyncStatus();
        console.log("Database inventory processing finished.");
      }
    },
    [state.isOnline, updateSyncStatus]
  );

  const processDbForMasterConfigs = useCallback(async (buffer: Uint8Array) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true }); // Marcar como en progreso
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
          showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
        } else {
          // Marcar como sincronizado en Dexie para los que se subieron con éxito
          for (const config of pendingForSupabase) {
            await db.productRules.update(config.productId, { sync_pending: false });
            warnedItems.current.delete(`product-${config.productId}`); // Limpiar advertencia
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
        showError(`${localMessage.trim()} (Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total).`);
      } else {
        showSuccess('No se encontraron nuevos productos o cambios de nombre para agregar/actualizar.');
      }
      await loadMasterProductConfigs(); // Recargar para actualizar el estado global
    } catch (e: any) {
      console.error("Error during processing database for master configs:", e);
      showError(`Error al procesar el archivo DB para configuraciones: ${e.message}`);
      dispatch({ type: 'SET_ERROR', payload: e.message });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false }); // Liberar el bloqueo
      updateSyncStatus();
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
          showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
        } else {
          await db.sessions.update(session.dateKey, { sync_pending: false });
          console.log(`Session ${session.dateKey} synced successfully.`);
          warnedItems.current.delete(`session-${session.dateKey}`); // Limpiar advertencia
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
          showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
        } else {
          await db.productRules.update(config.productId, { sync_pending: false });
          console.log(`Product config ${config.productId} synced successfully.`);
          warnedItems.current.delete(`product-${config.productId}`); // Limpiar advertencia
        }
      }
      showSuccess('Sincronización automática completada.');
    } catch (e) {
      console.error("Error during retryPendingSyncs:", e);
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
      showError('Error en la sincronización automática.');
    } finally {
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false }); // Liberar el bloqueo
      updateSyncStatus(); // Update status based on remaining pending items
    }
  }, [state.isOnline, state.isSupabaseSyncInProgress, updateSyncStatus]);


  // --- NEW: Perform Total Sync (Upload local, then Download cloud) ---
  // Esta función ahora se usará para la sincronización inicial y al cambiar de pestaña
  const syncFromSupabase = useCallback(async (origin: string, isUserAction: boolean = false) => {
    if (!supabase || !state.isOnline) {
      showError('No se puede sincronizar: sin conexión a internet o Supabase no disponible.');
      return;
    }

    const now = Date.now();
    const THIRTY_SECONDS = 30 * 1000;

    // Bloqueo de seguridad: No permitir sincronizaciones muy seguidas a menos que sea una acción de usuario explícita
    if (!isUserAction && (now - lastSyncTimestampRef.current < THIRTY_SECONDS)) {
      console.log(`🔄 Sincronización bloqueada por debounce de 30s. Origen: ${origin}`);
      return;
    }

    if (state.isSupabaseSyncInProgress) {
      console.log(`🔄 Sincronización ya en curso, ignorando solicitud. Origen: ${origin}`);
      // Iniciar un timeout para mostrar la advertencia si el bloqueo persiste
      if (!state.isSyncBlockedWarningActive && !syncBlockedWarningTimeoutRef.current) {
        syncBlockedWarningTimeoutRef.current = setTimeout(() => {
          dispatch({ type: 'SET_SYNC_BLOCKED_WARNING_ACTIVE', payload: true });
          showError('Sincronización ya en curso. Por favor, espera a que termine el proceso actual.');
        }, 10000); // 10 segundos
      }
      return;
    }

    // Limpiar cualquier timeout de advertencia de bloqueo si la sincronización comienza
    if (syncBlockedWarningTimeoutRef.current) {
      clearTimeout(syncBlockedWarningTimeoutRef.current);
      syncBlockedWarningTimeoutRef.current = null;
    }
    if (state.isSyncBlockedWarningActive) {
      dispatch({ type: 'SET_SYNC_BLOCKED_WARNING_ACTIVE', payload: false });
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' });
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true }); // Marcar como en progreso
    console.log(`🔄 Iniciando sincronización bidireccional. Origen: ${origin}`);

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
          showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
        } else {
          await db.sessions.update(session.dateKey, { sync_pending: false });
          warnedItems.current.delete(`session-${session.dateKey}`); // Limpiar advertencia
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
          showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
        } else {
          await db.productRules.update(config.productId, { sync_pending: false });
          warnedItems.current.delete(`product-${config.productId}`); // Limpiar advertencia
        }
      }
      console.log('Cambios locales subidos a la nube.');

      // 2. Download all Supabase data to local Dexie (with merge logic)
      console.log("Downloading all sessions from Supabase...");
      const { data: supabaseSessions, error: sessionsError } = await supabase
        .from('inventory_sessions')
        .select('*');
      if (sessionsError) throw sessionsError;

      const localSessions = await db.sessions.toArray();
      const localSessionsMap = new Map(localSessions.map(s => [s.dateKey, s]));
      const supabaseSessionDateKeys = new Set(supabaseSessions.map(s => s.dateKey));
      const sessionsToPutLocally: InventorySession[] = [];
      const sessionsToDeleteLocally: string[] = [];

      if (supabaseSessions && supabaseSessions.length > 0) {
        for (const s of supabaseSessions as Database['public']['Tables']['inventory_sessions']['Row'][]) { // Explicitly cast 's'
          const typedSession: InventorySession = { // Cast to correct type
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
            sessionsToPutLocally.push(typedSession);
          }
        }
        await db.sessions.bulkPut(sessionsToPutLocally);

        // Identificar sesiones locales que no están en Supabase y no están pendientes de sincronizar
        const localSessionsAfterPut = await db.sessions.toArray(); // Obtener el estado actual de Dexie
        localSessionsAfterPut.forEach(localSession => {
          if (!supabaseSessionDateKeys.has(localSession.dateKey) && localSession.sync_pending === false) {
            sessionsToDeleteLocally.push(localSession.dateKey);
          }
        });
        if (sessionsToDeleteLocally.length > 0) {
          await db.sessions.bulkDelete(sessionsToDeleteLocally);
          console.log(`[Sync] Limpieza local: Eliminando sesiones que ya no existen en la nube: [${sessionsToDeleteLocally.join(', ')}]`);
        }
      } else {
        // Si no hay sesiones en Supabase, limpiar todas las que no están pendientes localmente
        const localNonPendingSessions = localSessions.filter(s => s.sync_pending === false);
        if (localNonPendingSessions.length > 0) {
          await db.sessions.bulkDelete(localNonPendingSessions.map(s => s.dateKey));
          console.log(`[Sync] Limpieza local: Eliminando todas las sesiones no pendientes ya que Supabase está vacío: [${localNonPendingSessions.map(s => s.dateKey).join(', ')}]`);
        }
      }

      console.log("Downloading all product configs from Supabase...");
      const { data: supabaseProductRules, error: productRulesError } = await supabase
        .from('product_rules')
        .select('*');
      if (productRulesError) throw productRulesError;

      const localProductRules = await db.productRules.toArray();
      const localProductRulesMap = new Map(localProductRules.map(c => [c.productId, c]));
      const supabaseProductRuleIds = new Set(supabaseProductRules.map(c => c.productId));
      const productRulesToPutLocally: MasterProductConfig[] = [];
      const productRulesToDeleteLocally: number[] = [];

      if (supabaseProductRules && supabaseProductRules.length > 0) {
        for (const c of supabaseProductRules as Database['public']['Tables']['product_rules']['Row'][]) { // Explicitly cast 'c'
          const typedConfig: MasterProductConfig = { // Cast to correct type
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

        // Identificar configuraciones de producto locales que no están en Supabase y no están pendientes de sincronizar
        const localProductRulesAfterPut = await db.productRules.toArray(); // Obtener el estado actual de Dexie
        localProductRulesAfterPut.forEach(localConfig => {
          if (!supabaseProductRuleIds.has(localConfig.productId) && localConfig.sync_pending === false) {
            productRulesToDeleteLocally.push(localConfig.productId);
          }
        });
        if (productRulesToDeleteLocally.length > 0) {
          await db.productRules.bulkDelete(productRulesToDeleteLocally);
          console.log(`[Sync] Limpieza local: Eliminando configuraciones de producto que ya no existen en la nube: [${productRulesToDeleteLocally.join(', ')}]`);
        }
      } else {
        // Si no hay reglas en Supabase, limpiar todas las que no están pendientes localmente
        const localNonPendingProductRules = localProductRules.filter(c => c.sync_pending === false);
        if (localNonPendingProductRules.length > 0) {
          await db.productRules.bulkDelete(localNonPendingProductRules.map(c => c.productId));
          console.log(`[Sync] Limpieza local: Eliminando todas las configuraciones de producto no pendientes ya que Supabase está vacío: [${localNonPendingProductRules.map(c => c.productId).join(', ')}]`);
        }
      }
      console.log('Configuraciones y sesiones descargadas de la nube.');

      console.log("Sincronización bidireccional finalizada con éxito.");
      lastSyncTimestampRef.current = Date.now(); // Actualizar el timestamp de la última sincronización exitosa
      await loadMasterProductConfigs(); // Recargar configs para reflejar cualquier cambio
      await getSessionHistory(); // Recargar historial de sesiones
    } catch (e: any) {
      console.error(`Error during syncFromSupabase (total sync) from origin ${origin}:`, e);
      dispatch({ type: 'SET_ERROR', payload: e.message });
      showError(`Error en la sincronización: ${e.message}`);
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false }); // Liberar el bloqueo
      updateSyncStatus();
    }
  }, [state.isOnline, state.isSupabaseSyncInProgress, loadMasterProductConfigs, updateSyncStatus, state.isSyncBlockedWarningActive, getSessionHistory]);

  // Nueva función para sincronización al cambiar de pestaña
  const handleVisibilityChangeSync = useCallback(async () => {
    // Si el canal de Realtime está conectado, no hacemos nada (el canal ya está escuchando)
    if (state.realtimeStatus === 'connected') {
      console.log("Realtime channel is already connected, skipping full sync.");
      return;
    }
    // Si el canal no está conectado, intentamos reconectarlo
    if (state.realtimeStatus !== 'connected' && !state.isSupabaseSyncInProgress) {
      console.log("Realtime channel is not connected, attempting to reconnect...");
      // Forzar una reconexión del canal de Realtime
      // Esto se logra cambiando las dependencias del useEffect que crea los canales
      // Para forzarlo, podemos cambiar un estado que no afecte la lógica, pero es más limpio
      // simplemente ejecutar una sincronización completa si el canal no está conectado.
      // Sin embargo, la mejor práctica es reconectar el canal.
      // Como no tenemos un método directo de reconexión, usaremos syncFromSupabase como fallback.
      await syncFromSupabase("VisibilityChange_ChannelDisconnected");
    }
  }, [state.realtimeStatus, state.isSupabaseSyncInProgress, syncFromSupabase]);


  // --- NEW: Reset All Product Configurations ---
  const resetAllProductConfigs = useCallback(async (buffer: Uint8Array) => {
    if (!supabase || !state.isOnline) {
      showError('No se puede reiniciar la configuración: sin conexión a internet o Supabase no disponible.');
      return;
    }
    if (state.isSupabaseSyncInProgress) {
      console.log('Sincronización ya en curso, ignorando solicitud de reinicio de configuración.');
      showError('Sincronización ya en curso. Por favor, espera a que termine el proceso actual.');
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
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false }); // Liberar el bloqueo
      updateSyncStatus();
    }
  }, [state.isOnline, state.isSupabaseSyncInProgress, processDbForMasterConfigs, updateSyncStatus]);

  // --- NEW: Clear Local Database ---
  const clearLocalDatabase = useCallback(async () => {
    if (state.isSupabaseSyncInProgress) {
      showError('Sincronización ya en curso. Por favor, espera a que termine el proceso actual antes de limpiar la base de datos.');
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true }); // Marcar como en progreso
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
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false }); // Liberar el bloqueo
      updateSyncStatus(); // Actualizar el estado de sincronización
    }
  }, [state.isSupabaseSyncInProgress, updateSyncStatus]);

  // --- Persistence Alert: Check for long-pending syncs ---
  useEffect(() => {
    const checkLongPendingSyncs = async () => {
      if (!state.isOnline || !supabase) {
        return; // No hay conexión o Supabase no está disponible, no se puede sincronizar
      }
      if (state.isSupabaseSyncInProgress) {
        return; // Una sincronización ya está en curso, no mostrar advertencias redundantes
      }

      try {
        if (!db.isOpen()) await db.open();
        const now = Date.now();
        const THIRTY_SECONDS = 30 * 1000;

        // Check sessions
        const pendingSessions = await db.sessions.toCollection().filter(s => s.sync_pending === true).toArray();
        for (const session of pendingSessions) {
          const itemId = `session-${session.dateKey}`;
          if (!warnedItems.current.has(itemId) && (now - new Date(session.updated_at).getTime()) > THIRTY_SECONDS) {
            showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
            warnedItems.current.add(itemId);
          }
        }

        // Check product configs
        const pendingProductRules = await db.productRules.toCollection().filter(c => c.sync_pending === true).toArray();
        for (const config of pendingProductRules) {
          const itemId = `product-${config.productId}`;
          if (!warnedItems.current.has(itemId) && (now - new Date(config.updated_at).getTime()) > THIRTY_SECONDS) {
            showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
            warnedItems.current.add(itemId);
          }
        }
      } catch (e) {
        console.error("Error checking long pending syncs:", e);
      }
    };

    const intervalId = setInterval(checkLongPendingSyncs, 15000); // Check every 15 seconds

    return () => {
      clearInterval(intervalId); // Cleanup on unmount
      // Limpiar el timeout de advertencia de bloqueo si existe
      if (syncBlockedWarningTimeoutRef.current) {
        clearTimeout(syncBlockedWarningTimeoutRef.current);
        syncBlockedWarningTimeoutRef.current = null;
      }
    };
  }, [state.isOnline, state.isSupabaseSyncInProgress]);

  // --- Supabase Realtime Subscriptions ---
  useEffect(() => {
    if (!supabase) {
      console.warn("Supabase client not initialized, Realtime subscriptions skipped.");
      return;
    }

    const setupRealtime = async () => {
      if (!db.isOpen()) await db.open(); // Ensure Dexie DB is open for Realtime handlers

      // Sessions Realtime Channel
      const sessionsChannel = supabase
        .channel('inventory_sessions_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_sessions' }, async (payload) => {
          console.log('[Realtime] Session change received:', payload);
          // REMOVED: if (state.isSupabaseSyncInProgress) return; 

          try {
            if (payload.eventType === 'DELETE') {
              const dateKey = (payload.old as { dateKey: string }).dateKey;
              // 1. Write to Dexie (non-blocking)
              db.sessions.delete(dateKey).catch(e => console.error("Dexie delete error:", e)); 
              
              showSuccess(`Sesión del ${dateKey} eliminada remotamente.`);
              await getSessionHistory(); // Must await to update SessionManager UI
              if (state.sessionId === dateKey) {
                dispatch({ type: 'RESET_STATE' });
                dispatch({ type: 'SET_SESSION_ID', payload: null });
              }
            } else if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const newRecord = payload.new as Database['public']['Tables']['inventory_sessions']['Row'];
              const typedSession: InventorySession = {
                dateKey: newRecord.dateKey,
                inventoryType: newRecord.inventoryType,
                inventoryData: newRecord.inventoryData,
                timestamp: new Date(newRecord.timestamp),
                effectiveness: newRecord.effectiveness,
                ordersBySupplier: newRecord.ordersBySupplier,
                sync_pending: false, // Data from Supabase is synced
                updated_at: newRecord.updated_at,
              };

              const localSession = await db.sessions.get(typedSession.dateKey);
              if (!localSession || new Date(typedSession.updated_at) > new Date(localSession.updated_at)) {
                // 1. Update UI immediately if it's the active session
                if (state.sessionId === typedSession.dateKey) {
                  dispatch({ 
                    type: 'UPDATE_CURRENT_SESSION_DATA', 
                    payload: { 
                      dateKey: typedSession.dateKey, 
                      inventoryData: typedSession.inventoryData, 
                      effectiveness: typedSession.effectiveness 
                    } 
                  });
                }
                
                // 2. Write to Dexie (non-blocking)
                db.sessions.put(typedSession).catch(e => console.error("Dexie put error:", e));
                
                showSuccess(`Sesión del ${typedSession.dateKey} actualizada remotamente.`);
                await getSessionHistory(); // Must await to update SessionManager UI
              } else {
                console.log(`[Realtime] Keeping local session ${typedSession.dateKey} as it's newer or same.`);
              }
            }
            updateSyncStatus();
          } catch (e) {
            console.error('[Realtime] Error processing session change:', e);
            showError('Error al procesar actualización de sesión remota.');
          }
        })
        .subscribe((status) => {
          console.log(`[Realtime] Sessions channel status: ${status}`);
          dispatch({ type: 'SET_REALTIME_STATUS', payload: status });
        });

      // Product Rules Realtime Channel
      const productRulesChannel = supabase
        .channel('product_rules_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'product_rules' }, async (payload) => {
          console.log('[Realtime] Product rule change received:', payload);
          // REMOVED: if (state.isSupabaseSyncInProgress) return; 

          try {
            if (payload.eventType === 'DELETE') {
              const productId = (payload.old as { productId: number }).productId;
              // 1. Write to Dexie (non-blocking)
              db.productRules.delete(productId).catch(e => console.error("Dexie delete error:", e)); 
              
              showSuccess(`Configuración de producto ${productId} eliminada remotamente.`);
              
              // 2. Update UI immediately by simulating removal (isHidden: true)
              dispatch({ 
                type: 'UPDATE_SINGLE_PRODUCT_RULE', 
                payload: { productId: productId, isHidden: true } as MasterProductConfig 
              });
              
            } else if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const newRecord = payload.new as Database['public']['Tables']['product_rules']['Row'];
              const typedConfig: MasterProductConfig = {
                productId: newRecord.productId,
                productName: newRecord.productName,
                rules: newRecord.rules,
                supplier: newRecord.supplier,
                isHidden: newRecord.isHidden || false,
                sync_pending: false, // Data from Supabase is synced
                updated_at: newRecord.updated_at,
              };

              const localConfig = await db.productRules.get(typedConfig.productId);
              if (!localConfig || new Date(typedConfig.updated_at) > new Date(localConfig.updated_at)) {
                // 1. Update UI immediately
                dispatch({ type: 'UPDATE_SINGLE_PRODUCT_RULE', payload: typedConfig });
                
                // 2. Write to Dexie (non-blocking)
                db.productRules.put(typedConfig).catch(e => console.error("Dexie put error:", e));
                
                showSuccess(`Configuración de producto ${typedConfig.productName} actualizada remotamente.`);
              } else {
                console.log(`[Realtime] Keeping local product config ${typedConfig.productId} as it's newer or same.`);
              }
            }
            updateSyncStatus();
          } catch (e) {
            console.error('[Realtime] Error processing product rule change:', e);
            showError('Error al procesar actualización de configuración de producto remota.');
          }
        })
        .subscribe((status) => {
          console.log(`[Realtime] Product rules channel status: ${status}`);
          dispatch({ type: 'SET_REALTIME_STATUS', payload: status });
        });

      // Store channels in ref for cleanup
      channelsRef.current = { sessions: sessionsChannel, productRules: productRulesChannel };
    };

    setupRealtime();

    return () => {
      console.log('[Realtime] Unsubscribing from channels.');
      channelsRef.current.sessions?.unsubscribe();
      channelsRef.current.productRules?.unsubscribe();
    };
  }, [state.isSupabaseSyncInProgress, getSessionHistory, updateSyncStatus, state.sessionId]); // Dependencias para asegurar que se re-suscriba si cambia el estado de sync in progress

  // Effect to re-subscribe to Realtime channels when the app becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[Realtime] App became visible, re-subscribing to channels...');
        // Trigger a re-subscription by updating a dependency
        // We can do this by calling a dummy function that updates a ref or state
        // For simplicity, we'll just log and rely on the existing subscription
        // A more robust way would be to force a re-subscription by changing a dependency
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []); // Empty dependency array to run only once

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
    setSyncStatus, // Exponer el nuevo setter
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
    setSyncStatus, // Añadir como dependencia
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