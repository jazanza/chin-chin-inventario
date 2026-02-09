/**
 * @file src/context/InventoryContext.tsx
 * @description Contexto global simplificado para la gestión de inventarios, sesiones y sincronización con Supabase.
 * @version v1.5.6
 * @date 2024-07-26
 *
 * PROPÓSITO DE LA VERSIÓN v1.5.6:
 * Corregir el error conceptual de sobrescribir la fecha de la sesión (timestamp) al guardar.
 * - saveCurrentSession ahora preserva el `timestamp` original de la sesión si ya existe.
 * - El campo `updated_at` es el único que se actualiza con `new Date().toISOString()` para reflejar la última modificación.
 */

import React, { createContext, useReducer, useContext, useCallback, useEffect, useMemo, useRef } from "react";
import { initDb, loadDb, queryData } from "@/lib/db";
import { db, InventorySession, MasterProductConfig, ProductRule, SupplierConfig } from "@/lib/persistence";
import { format } from "date-fns";
import { showSuccess, showError } from "@/utils/toast";
import debounce from "lodash.debounce";
import { supabase } from "@/lib/supabase";
import { Database } from '@/lib/supabase';

// Interfaces
export interface InventoryItemFromDB {
  ProductId: number;
  Categoria: string;
  Producto: string;
  Stock_Actual: number;
  SupplierName: string;
}

export interface InventoryItem {
  productId: number;
  productName: string;
  category: string;
  systemQuantity: number;
  physicalQuantity: number;
  averageSales: number;
  supplier: string;
  hasBeenEdited?: boolean;
  rules: ProductRule[];
  isHidden?: boolean; // Añadido para consistencia con MasterProductConfig
}

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
  rawInventoryItemsFromDb: InventoryItem[];
  masterProductConfigs: MasterProductConfig[];
  loading: boolean; // Global loading for major operations
  error: string | null;
  sessionId: string | null;
  syncStatus: SyncStatus;
  isOnline: boolean;
  isSupabaseSyncInProgress: boolean; // For background syncs
  currentSessionOrders: { [supplier: string]: OrderItem[] } | null; // NEW: Pedidos de la sesión actual
}

const initialState: InventoryState = {
  dbBuffer: null,
  inventoryType: null,
  rawInventoryItemsFromDb: [],
  masterProductConfigs: [],
  loading: false,
  error: null,
  sessionId: null,
  syncStatus: 'idle',
  isOnline: navigator.onLine,
  isSupabaseSyncInProgress: false,
  currentSessionOrders: null, // NEW: Inicializar como null
};

type InventoryAction =
  | { type: 'SET_DB_BUFFER'; payload: Uint8Array | null }
  | { type: 'SET_INVENTORY_TYPE'; payload: "weekly" | "monthly" | null }
  | { type: 'SET_RAW_INVENTORY_ITEMS_FROM_DB'; payload: InventoryItem[] }
  | { type: 'SET_MASTER_PRODUCT_CONFIGS'; payload: MasterProductConfig[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_SESSION_ID'; payload: string | null }
  | { type: 'SET_SYNC_STATUS'; payload: SyncStatus }
  | { type: 'SET_IS_ONLINE'; payload: boolean }
  | { type: 'SET_SUPABASE_SYNC_IN_PROGRESS'; payload: boolean }
  | { type: 'SET_CURRENT_SESSION_ORDERS'; payload: { [supplier: string]: OrderItem[] } | null } // NEW ACTION
  | { type: 'UPDATE_CURRENT_SESSION_DATA'; payload: { dateKey: string, inventoryData: InventoryItem[], effectiveness: number } }
  | { type: 'DELETE_SESSION'; payload: string }
  | { type: 'RESET_STATE' };

const inventoryReducer = (state: InventoryState, action: InventoryAction): InventoryState => {
  switch (action.type) {
    case 'SET_DB_BUFFER':
      return { ...state, dbBuffer: action.payload, error: null };
    case 'SET_INVENTORY_TYPE':
      return { ...state, inventoryType: action.payload, error: null };
    case 'SET_RAW_INVENTORY_ITEMS_FROM_DB':
      return { ...state, rawInventoryItemsFromDb: action.payload, error: null };
    case 'SET_MASTER_PRODUCT_CONFIGS':
      // Only update if the content has actually changed to prevent unnecessary re-renders
      if (JSON.stringify(state.masterProductConfigs) === JSON.stringify(action.payload)) {
        return state;
      }
      return { ...state, masterProductConfigs: action.payload };
    case 'SET_LOADING':
      console.log(`InventoryContext: SET_LOADING to ${action.payload}`);
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
    case 'SET_CURRENT_SESSION_ORDERS': // NEW REDUCER CASE
      return { ...state, currentSessionOrders: action.payload };
    case 'UPDATE_CURRENT_SESSION_DATA': {
      if (state.sessionId === action.payload.dateKey) {
        return {
          ...state,
          rawInventoryItemsFromDb: action.payload.inventoryData,
        };
      }
      return state;
    }
    case 'DELETE_SESSION': {
      if (state.sessionId === action.payload) {
        return {
          ...state,
          sessionId: null,
          rawInventoryItemsFromDb: [],
          inventoryType: null,
          currentSessionOrders: null, // NEW: Limpiar pedidos al eliminar sesión activa
        };
      }
      return state;
    }
    case 'RESET_STATE':
      return {
        ...initialState,
        dbBuffer: state.dbBuffer,
        masterProductConfigs: state.masterProductConfigs,
        isOnline: state.isOnline,
        isSupabaseSyncInProgress: false,
        currentSessionOrders: null, // NEW: Limpiar pedidos al resetear estado
      };
    default:
      return state;
  }
};

interface InventoryContextType extends InventoryState {
  filteredInventoryData: InventoryItem[];
  setDbBuffer: (buffer: Uint8Array | null) => void;
  setInventoryType: (type: "weekly" | "monthly" | null) => void;
  setRawInventoryItemsFromDb: (data: InventoryItem[]) => void;
  setMasterProductConfigs: (configs: MasterProductConfig[]) => void;
  setSyncStatus: (status: SyncStatus) => void;
  processInventoryData: (buffer: Uint8Array, type: "weekly" | "monthly") => Promise<void>;
  processDbForMasterConfigs: (buffer: Uint8Array) => Promise<void>;
  saveCurrentSession: (data: InventoryItem[], type: "weekly" | "monthly", timestamp: Date, orders?: { [supplier: string]: OrderItem[] }, forcedSessionId?: string) => Promise<void>; // MODIFIED
  loadSession: (dateKey: string) => Promise<void>;
  deleteSession: (dateKey: string) => Promise<void>;
  getSessionHistory: () => Promise<InventorySession[]>;
  resetInventoryState: () => void;
  syncToSupabase: () => Promise<void>; // Nueva función simplificada
  saveMasterProductConfig: (config: MasterProductConfig) => Promise<void>;
  deleteMasterProductConfig: (productId: number) => Promise<void>;
  loadMasterProductConfigs: (includeHidden?: boolean) => Promise<MasterProductConfig[]>;
  handleVisibilityChangeSync: () => Promise<void>;
  resetAllProductConfigs: (buffer: Uint8Array) => Promise<void>;
  clearLocalDatabase: () => Promise<void>;
  updateAndDebounceSaveInventoryItem: (index: number, key: keyof InventoryItem, value: number | boolean) => void;
  flushPendingSessionSave: () => void;
  fetchInitialData: () => Promise<void>; // Añadido fetchInitialData
  updateSyncStatus: () => Promise<void>; // Añadido updateSyncStatus a la interfaz
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

const calculateEffectiveness = (data: InventoryItem[]): number => {
  if (data.length === 0) return 0;
  const matches = data.filter(item => item.systemQuantity === item.physicalQuantity).length;
  return (matches / data.length) * 100;
};

export const InventoryProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, dispatch] = useReducer(inventoryReducer, initialState);
  const previousFilteredInventoryDataRef = useRef<InventoryItem[]>([]);
  const warnedItems = useRef(new Set<string>());
  const syncBlockedWarningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncTimestampRef = useRef(0);
  const initialFetchDoneRef = useRef(false); // Nueva bandera para la carga inicial

  // Ref para la función debounced de guardado de sesión
  const debouncedSaveCurrentSessionRef = useRef<((data: InventoryItem[], forcedSessionId?: string) => void) & { flush: () => void; cancel: () => void } | null>(null); // MODIFIED

  console.log("InventoryContext Render:", { loading: state.loading, sessionId: state.sessionId, dbBuffer: !!state.dbBuffer, inventoryType: state.inventoryType });

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
    dispatch({ type: 'SET_CURRENT_SESSION_ORDERS', payload: null }); // NEW: Limpiar pedidos al resetear estado
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
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'pending' });
      return;
    }
    if (!supabase) {
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'idle' });
      return;
    }

    try {
      if (!db.isOpen()) await db.open();
      const pendingSessions = await db.sessions.toCollection().filter(r => r.sync_pending === true).count();
      const pendingProductRules = await db.productRules.toCollection().filter(r => r.sync_pending === true).count();

      if (pendingSessions > 0 || pendingProductRules > 0) {
        dispatch({ type: 'SET_SYNC_STATUS', payload: 'pending' });
      } else {
        dispatch({ type: 'SET_SYNC_STATUS', payload: 'synced' });
      }
    } catch (e) {
      console.error("Error checking sync status from Dexie:", e);
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
    }
  }, [state.isOnline]);

  // --- DERIVED STATE: filteredInventoryData ---
  const filteredInventoryData = useMemo(() => {
    if (!state.rawInventoryItemsFromDb || state.rawInventoryItemsFromDb.length === 0) {
      previousFilteredInventoryDataRef.current = [];
      return [];
    }

    const masterConfigsMap = new Map(state.masterProductConfigs.map(config => [config.productId, config]));
    // No necesitamos previousDataMap aquí, ya que physicalQuantity y hasBeenEdited
    // se actualizan directamente en state.rawInventoryItemsFromDb

    const newFilteredData: InventoryItem[] = [];

    state.rawInventoryItemsFromDb.forEach(item => {
      const masterConfig = masterConfigsMap.get(item.productId);
      if (!masterConfig || masterConfig.isHidden) {
        return; // Filter out hidden products
      }

      // New filtering logic based on inventory_type
      const productInventoryType = masterConfig.inventory_type || 'monthly'; // Default to 'monthly' if not set

      if (productInventoryType === 'ignored') {
        return; // Filter out ignored products
      }

      if (state.inventoryType === 'weekly' && productInventoryType !== 'weekly') {
        return; // In weekly view, only show 'weekly' products
      }

      // In monthly view, show 'weekly' and 'monthly' products
      // No need for an explicit check for 'monthly' here, as 'ignored' is already filtered out
      // and 'weekly' products are included by default if not filtered by the above 'weekly' condition.
      // So, if state.inventoryType is 'monthly', and productInventoryType is 'weekly' or 'monthly', it will pass.

      // Existing supplier filter
      if (item.supplier === "KYR S.A.S" || item.supplier === "Desconocido") {
        return;
      }

      newFilteredData.push({
        ...item,
        rules: masterConfig.rules,
        supplier: masterConfig.supplier,
        isHidden: masterConfig.isHidden,
      });
    });

    // Añadir log para verificar los datos del primer elemento
    if (newFilteredData.length > 0) {
      console.log("InventoryContext: filteredInventoryData (primer elemento de muestra):", {
        productId: newFilteredData[0].productId,
        productName: newFilteredData[0].productName,
        supplier: newFilteredData[0].supplier,
        rules: newFilteredData[0].rules,
        physicalQuantity: newFilteredData[0].physicalQuantity,
      });
    }

    previousFilteredInventoryDataRef.current = newFilteredData; // Mantener para futuras referencias si es necesario
    return newFilteredData;
  }, [state.rawInventoryItemsFromDb, state.masterProductConfigs, state.inventoryType]);

  // --- Core Persistence Functions (Sessions) ---
  const saveCurrentSession = useCallback(async (
    data: InventoryItem[],
    type: "weekly" | "monthly",
    initialTimestamp: Date, // Renombrado para mayor claridad
    orders?: { [supplier: string]: OrderItem[] },
    forcedSessionId?: string
  ) => {
    if (!data || data.length === 0) return;

    // Determine dateKey based on priority: forcedSessionId > state.sessionId > current date
    const dateKey = forcedSessionId || state.sessionId || format(initialTimestamp, 'yyyy-MM-dd');
    const effectiveness = calculateEffectiveness(data);
    const nowIso = new Date().toISOString(); // Local timestamp for Dexie (for updated_at)

    try {
      if (!db.isOpen()) await db.open();
      const existingSession = await db.sessions.get(dateKey); // Use the determined dateKey

      // Preserve original timestamp if session exists, otherwise use the provided initialTimestamp
      const sessionTimestamp = existingSession ? existingSession.timestamp : initialTimestamp;
      const ordersToSave = orders !== undefined ? orders : existingSession?.ordersBySupplier;

      const sessionToSave: InventorySession = {
        dateKey,
        inventoryType: type,
        inventoryData: data,
        timestamp: sessionTimestamp, // Use the preserved or initial timestamp
        effectiveness,
        ordersBySupplier: ordersToSave,
        sync_pending: true,
        updated_at: nowIso, // Only updated_at reflects the last modification time
      };

      await db.sessions.put(sessionToSave); // Persistir en Dexie primero

      // Always set the session ID in context to the one just saved/updated
      dispatch({ type: 'SET_SESSION_ID', payload: dateKey });
      dispatch({ type: 'SET_CURRENT_SESSION_ORDERS', payload: ordersToSave || null });

      // If there is connection, try to sync immediately (but don't block)
      if (supabase && state.isOnline) {
        const supabaseSession: Database['public']['Tables']['inventory_sessions']['Insert'] = {
          dateKey: sessionToSave.dateKey,
          inventoryType: sessionToSave.inventoryType,
          inventoryData: sessionToSave.inventoryData,
          timestamp: sessionToSave.timestamp, // Sending as Date (original creation date)
          effectiveness: sessionToSave.effectiveness,
          ordersBySupplier: sessionToSave.ordersBySupplier,
        };
        const { data, error } = await (supabase
          .from('inventory_sessions') as any) // Cast to any
          .upsert(supabaseSession, { onConflict: 'dateKey' })
          .select('dateKey, updated_at') // Select dateKey for consistency
          .single();

        const fetchedSession = data as Pick<Database['public']['Tables']['inventory_sessions']['Row'], 'dateKey' | 'updated_at'> | null;

        if (error) {
          console.error("Error saving session to Supabase:", error);
          showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
        } else if (fetchedSession) {
            await db.sessions.update(dateKey, { sync_pending: false, updated_at: fetchedSession.updated_at });
          console.log("Session saved to Supabase successfully.");
          warnedItems.current.delete(`session-${dateKey}`);
        } else {
            await db.sessions.update(dateKey, { sync_pending: false });
        }
      } else {
        showError('Guardado local exitoso. Sincronización demorada hasta que haya conexión.');
      }
    } catch (e) {
      console.error("Error saving session:", e);
      showError('Error al guardar la sesión localmente.');
      throw e;
    } finally {
      updateSyncStatus();
    }
  }, [state.sessionId, state.isOnline, updateSyncStatus]); // state.sessionId is now a dependency

  const loadSession = useCallback(async (dateKey: string) => {
    dispatch({ type: 'SET_LOADING', payload: true }); // Keep global loading for this blocking operation
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      if (!db.isOpen()) await db.open();
      const session = await db.sessions.get(dateKey);
      if (session) {
        dispatch({ type: 'SET_INVENTORY_TYPE', payload: session.inventoryType });
        dispatch({ type: 'SET_RAW_INVENTORY_ITEMS_FROM_DB', payload: session.inventoryData });
        dispatch({ type: 'SET_SESSION_ID', payload: dateKey });
        dispatch({ type: 'SET_CURRENT_SESSION_ORDERS', payload: session.ordersBySupplier || null }); // NEW: Cargar pedidos de la sesión
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
    dispatch({ type: 'SET_LOADING', payload: true }); // Keep global loading for this blocking operation
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true });

    try {
      if (!db.isOpen()) await db.open();
      await db.sessions.delete(dateKey); // Eliminar de Dexie primero

      if (supabase && state.isOnline) {
        const { error } = await (supabase
          .from('inventory_sessions') as any) // Cast to any
          .delete()
          .eq('dateKey', dateKey);

        if (error) {
          console.error("Error deleting session from Supabase:", error);
          showError('Error al eliminar sesión de la nube. Puede que reaparezca en una sincronización forzada.');
        } else {
          console.log("Session deleted from Supabase successfully.");
          warnedItems.current.delete(`session-${dateKey}`);
        }
      } else {
        console.log("Supabase client not available or offline, skipping delete from Supabase.");
      }

      showSuccess(`Sesión del ${dateKey} eliminada.`);

      if (state.sessionId === dateKey) {
        dispatch({ type: 'RESET_STATE' });
        dispatch({ type: 'SET_SESSION_ID', payload: null });
        dispatch({ type: 'SET_CURRENT_SESSION_ORDERS', payload: null }); // NEW: Limpiar pedidos al eliminar sesión activa
      }
    } catch (e) {
      console.error("Error deleting session:", e);
      showError('Error al eliminar la sesión.');
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false });
      updateSyncStatus();
    }
  }, [state.sessionId, state.isOnline, updateSyncStatus]);

  const getSessionHistory = useCallback(async (): Promise<InventorySession[]> => {
    try {
      if (!db.isOpen()) await db.open();
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
      if (!db.isOpen()) await db.open();
      const allConfigs = await db.productRules.toArray();
      const filteredConfigs = includeHidden ? allConfigs : allConfigs.filter(config => !config.isHidden);

      const currentConfigs = state.masterProductConfigs;
      // Deep comparison to prevent unnecessary re-renders if only internal properties like sync_pending change
      const hasChanged = JSON.stringify(filteredConfigs) !== JSON.stringify(currentConfigs);

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
  }, [updateSyncStatus, state.masterProductConfigs]); // state.masterProductConfigs is a dependency for JSON.stringify comparison

  const saveMasterProductConfig = useCallback(async (config: MasterProductConfig) => {
    // No global loading here, only sync status and local savingStatus in SettingsPage
    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true });
    try {
      if (!db.isOpen()) await db.open();
      const nowIso = new Date().toISOString(); // Local timestamp for Dexie
      const configToSave = { ...config, productId: Number(config.productId), sync_pending: true, updated_at: nowIso };
      await db.productRules.put(configToSave); // Persistir en Dexie primero

      if (!supabase || !state.isOnline) {
        showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
        updateSyncStatus();
        await loadMasterProductConfigs(); // Refresh the list to reflect local changes
        return;
      }

      const supabaseConfig: Database['public']['Tables']['product_rules']['Insert'] = {
        productId: configToSave.productId,
        productName: configToSave.productName,
        rules: configToSave.rules,
        supplier: configToSave.supplier,
        isHidden: configToSave.isHidden || false,
        inventory_type: configToSave.inventory_type || 'monthly', // Default to 'monthly' for Supabase
      };
      const { data, error } = await (supabase
        .from('product_rules') as any) // Cast to any
        .upsert(supabaseConfig, { onConflict: 'productId' })
        .select('productId, updated_at') // Select productId for consistency
        .single();

      const fetchedConfig = data as Pick<Database['public']['Tables']['product_rules']['Row'], 'productId' | 'updated_at'> | null;

      if (error) {
        console.error("Error saving master product config to Supabase:", error);
        showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
      } else if (fetchedConfig) {
          await db.productRules.update(configToSave.productId, { sync_pending: false, updated_at: fetchedConfig.updated_at });
        console.log("Master product config saved to Supabase successfully.");
        warnedItems.current.delete(`product-${config.productId}`);
      } else {
          // Fallback if fetchedConfig is null but no error
          await db.productRules.update(config.productId, { sync_pending: false });
      }
      await loadMasterProductConfigs(); // Reload configs to reflect any server-generated updated_at and sync_pending status
    } catch (e) {
      console.error("Error saving master product config:", e);
      showError('Error al guardar la configuración del producto localmente.');
      throw e;
    } finally {
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false });
      updateSyncStatus();
    }
  }, [state.isOnline, updateSyncStatus, loadMasterProductConfigs]);

  const deleteMasterProductConfig = useCallback(async (productId: number) => {
    // No global loading here, only sync status and local savingStatus in SettingsPage
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true });

    try {
      if (!db.isOpen()) await db.open();
      const numericProductId = Number(productId);

      const currentConfig = await db.productRules.get(numericProductId);
      if (!currentConfig) {
        throw new Error(`Product config with ID ${numericProductId} not found.`);
      }

      const newIsHidden = !currentConfig.isHidden;
      const nowIso = new Date().toISOString(); // Local timestamp for Dexie

      await db.productRules.update(numericProductId, { isHidden: newIsHidden, sync_pending: true, updated_at: nowIso }); // Actualizar en Dexie primero

      if (!supabase || !state.isOnline) {
        showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
        updateSyncStatus();
        await loadMasterProductConfigs(); // Refresh the list to reflect local changes
        if (state.sessionId && state.inventoryType && state.rawInventoryItemsFromDb.length > 0) { // Use rawInventoryItemsFromDb
          await saveCurrentSession(state.rawInventoryItemsFromDb, state.inventoryType, new Date(), undefined, state.sessionId); // MODIFIED
        }
        return;
      }

      const updatePayload: Database['public']['Tables']['product_rules']['Update'] = { isHidden: newIsHidden };
      const { data, error } = await (supabase
        .from('product_rules') as any) // Cast to any
        .update(updatePayload)
        .eq('productId', numericProductId)
        .select('productId, updated_at') // Select productId for consistency
        .single();

      const fetchedConfig = data as Pick<Database['public']['Tables']['product_rules']['Row'], 'productId' | 'updated_at'> | null;

      if (error) {
        console.error("Error toggling master product config from Supabase:", error);
        showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
      } else if (fetchedConfig) {
          await db.productRules.update(numericProductId, { sync_pending: false, updated_at: fetchedConfig.updated_at });
        console.log("Master product config visibility toggled in Supabase successfully.");
        warnedItems.current.delete(`product-${numericProductId}`);
      } else {
          // Fallback if fetchedConfig is null but no error
          await db.productRules.update(numericProductId, { sync_pending: false });
      }
      showSuccess(`Configuración de producto ${newIsHidden ? 'ocultada' : 'restaurada'}.`);

      await loadMasterProductConfigs(); // Refresh the list to reflect server-generated updated_at and sync_pending status

      if (state.sessionId && state.inventoryType && state.rawInventoryItemsFromDb.length > 0) { // Use rawInventoryItemsFromDb
        await saveCurrentSession(state.rawInventoryItemsFromDb, state.inventoryType, new Date(), undefined, state.sessionId); // MODIFIED
      }
    } catch (e) {
      console.error("Error toggling master product config:", e);
      showError('Error al cambiar la visibilidad de la configuración de producto.');
      throw e;
    } finally {
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false });
      updateSyncStatus();
    }
  }, [state.isOnline, updateSyncStatus, loadMasterProductConfigs, state.sessionId, state.inventoryType, state.rawInventoryItemsFromDb, saveCurrentSession]);

  // Consultas SQL
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
        AND DT_sub.Code = '100'
        AND C_sub.IsSupplier = 1
        AND C_sub.IsEnabled = 1
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
        AND DT_sub.Code = '100'
        AND C_sub.IsSupplier = 1
        AND C_sub.IsEnabled = 1
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
        AND DT_sub.Code = '100'
        AND C_sub.IsSupplier = 1
        AND C_sub.IsEnabled = 1
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
      console.log(`InventoryContext: processInventoryData called for ${type} inventory.`);
      dispatch({ type: 'SET_LOADING', payload: true }); // Keep global loading
      dispatch({ type: 'SET_ERROR', payload: null });
      // Removed SET_SUPABASE_SYNC_IN_PROGRESS from here, it's in finally
      console.log(`Starting database processing for ${type} inventory.`);

      try { // Outer try block to catch any unexpected errors
        try { // Inner try block for main logic
          console.log("InventoryContext: processInventoryData - Initializing DB.");
          await initDb();
          const dbInstance = loadDb(buffer);
          let inventoryQuery: string;

          // Now both weekly and monthly queries fetch all enabled products
          inventoryQuery = ALL_PRODUCTS_QUERY;

          console.log("InventoryContext: processInventoryData - Querying raw inventory items.");
          const rawInventoryItems: InventoryItemFromDB[] = queryData(
            dbInstance,
            inventoryQuery
          );
          dbInstance.close();
          console.log("InventoryContext: processInventoryData - Raw inventory items queried:", rawInventoryItems.length);

          if (rawInventoryItems.length === 0) {
            console.warn("No inventory items found in the database for processing.");
            dispatch({ type: 'SET_RAW_INVENTORY_ITEMS_FROM_DB', payload: [] });
            dispatch({ type: 'SET_INVENTORY_TYPE', payload: type });
            dispatch({ type: 'SET_SESSION_ID', payload: format(new Date(), 'yyyy-MM-dd') });
            showError('No se encontraron productos de inventario en la base de datos.');
            return; // Early exit, loading should be false in finally
          }

          console.log("InventoryContext: processInventoryData - Opening Dexie DB and fetching master configs.");
          if (!db.isOpen()) await db.open();
          const allMasterProductConfigs = await db.productRules.toArray();
          const masterProductConfigsMap = new Map(allMasterProductConfigs.map(config => [config.productId, config]));
          console.log("InventoryContext: processInventoryData - Master configs fetched:", allMasterProductConfigs.length);

          const configsToUpdateOrAddInDexie: MasterProductConfig[] = [];
          const configsToUpsertToSupabase: MasterProductConfig[] = [];
          let newProductsCount = 0;
          let updatedProductNamesCount = 0;
          const nowIso = new Date().toISOString(); // Local timestamp for Dexie

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
              masterConfig = {
                productId: currentProductId,
                productName: dbItem.Producto,
                rules: [],
                supplier: supplierNameFromDb,
                isHidden: false,
                inventory_type: 'monthly', // Default to 'monthly' for new products
                sync_pending: true,
                updated_at: nowIso, // Use local timestamp for Dexie
              };
              newProductsCount++;
              configChanged = true;
            } else {
              const updatedConfig = { ...masterConfig };
              if (updatedConfig.productName !== dbItem.Producto) {
                updatedConfig.productName = dbItem.Producto;
                updatedProductNamesCount++;
                configChanged = true;
              }
              // Ensure inventory_type is set for existing products if it's missing
              if (updatedConfig.inventory_type === undefined || updatedConfig.inventory_type === null) {
                updatedConfig.inventory_type = 'monthly';
                configChanged = true;
              }
              masterConfig = updatedConfig;
            }

            if (configChanged) {
              masterConfig.sync_pending = true;
              masterConfig.updated_at = nowIso; // Use local timestamp for Dexie
              configsToUpsertToSupabase.push(masterConfig);
            }
            configsToUpdateOrAddInDexie.push(masterConfig);
          });

          if (configsToUpdateOrAddInDexie.length > 0) {
            console.log("InventoryContext: processInventoryData - Bulk putting master configs to Dexie.");
            await db.productRules.bulkPut(configsToUpdateOrAddInDexie);
            console.log(`Updated/Added ${configsToUpdateOrAddInDexie.length} master product configs in Dexie.`);
          }

          const pendingForSupabase = configsToUpsertToSupabase.filter(c => c.sync_pending);
          if (supabase && state.isOnline && pendingForSupabase.length > 0) {
            console.log("InventoryContext: processInventoryData - Upserting master configs to Supabase.");
            // Use the Database['public']['Tables']['product_rules']['Insert'] type directly
            const supabaseConfigs: Database['public']['Tables']['product_rules']['Insert'][] = pendingForSupabase.map(c => ({
              productId: c.productId,
              productName: c.productName,
              rules: c.rules,
              supplier: c.supplier,
              isHidden: c.isHidden || false,
              inventory_type: c.inventory_type || 'monthly', // Default to 'monthly' for Supabase
            }));
            const { data: fetchedData, error: supabaseUpsertError } = await (supabase
              .from('product_rules') as any) // Cast to any
              .upsert(supabaseConfigs, { onConflict: 'productId' })
              .select('productId, updated_at'); // Select productId for finding

            if (supabaseUpsertError) {
              console.error("Error bulk upserting master product configs to Supabase:", supabaseUpsertError);
              showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
            } else if (fetchedData && fetchedData.length > 0) {
              const fetchedDataTyped = fetchedData as Pick<Database['public']['Tables']['product_rules']['Row'], 'productId' | 'updated_at'>[];
              const fetchedConfigsMap = new Map(fetchedDataTyped.map(item => [item.productId, item])); // Use a map for efficient lookup
              for (const config of pendingForSupabase) {
                const fetchedConfig = fetchedConfigsMap.get(config.productId); // Use map for lookup
                if (fetchedConfig) {
                  await db.productRules.update(config.productId, { sync_pending: false, updated_at: fetchedConfig.updated_at });
                } else {
                  await db.productRules.update(config.productId, { sync_pending: false });
                }
                warnedItems.current.delete(`product-${config.productId}`);
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
            } else {
              // Fallback if fetchedData is null or empty but no error
              for (const config of pendingForSupabase) {
                await db.productRules.update(config.productId, { sync_pending: false });
              }
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
          await loadMasterProductConfigs(); // Reload configs to reflect any server-generated updated_at
          console.log("InventoryContext: processInventoryData - Master configs reloaded.");

          const finalProcessedInventory = rawInventoryItems.map(dbItem => {
            const currentProductId = Number(dbItem.ProductId);
            const masterConfig = masterProductConfigsMap.get(currentProductId);
            const rules = masterConfig?.rules || [];
            const supplier = masterConfig?.supplier || dbItem.SupplierName;
            const isHidden = masterConfig?.isHidden || false;

            return {
              productId: currentProductId,
              productName: dbItem.Producto,
              category: dbItem.Categoria,
              systemQuantity: dbItem.Stock_Actual,
              physicalQuantity: dbItem.Stock_Actual,
              averageSales: 0,
              supplier: supplier,
              hasBeenEdited: false,
              rules: rules,
              isHidden: isHidden,
            };
          }).filter(item => !item.isHidden && item.supplier !== "KYR S.A.S" && item.supplier !== "Desconocido");
          console.log("InventoryContext: processInventoryData - Final inventory processed:", finalProcessedInventory.length);

          dispatch({ type: 'SET_RAW_INVENTORY_ITEMS_FROM_DB', payload: finalProcessedInventory });
          dispatch({ type: 'SET_INVENTORY_TYPE', payload: type });

          const dateKey = format(new Date(), 'yyyy-MM-dd'); // For new sessions, always use current date
          const effectiveness = calculateEffectiveness(finalProcessedInventory);

          const newSession: InventorySession = {
            dateKey,
            inventoryType: type,
            inventoryData: finalProcessedInventory,
            timestamp: new Date(), // This is correct for a truly new session
            effectiveness,
            ordersBySupplier: undefined, // Initialize as undefined
            sync_pending: true,
            updated_at: nowIso, // Use local timestamp for Dexie
          };
          console.log("InventoryContext: processInventoryData - Putting new session to Dexie.");
          await db.sessions.put(newSession); // Persistir en Dexie primero
          dispatch({ type: 'SET_SESSION_ID', payload: dateKey });
          dispatch({ type: 'SET_CURRENT_SESSION_ORDERS', payload: null }); // NEW: Limpiar pedidos al iniciar nueva sesión
          console.log("InventoryContext: processInventoryData - New session put to Dexie.");

          if (supabase && state.isOnline) {
            console.log("InventoryContext: processInventoryData - Upserting new session to Supabase.");
            const supabaseSession: Database['public']['Tables']['inventory_sessions']['Insert'] = {
              dateKey: newSession.dateKey,
              inventoryType: newSession.inventoryType,
              inventoryData: newSession.inventoryData,
              timestamp: newSession.timestamp, // Sending as Date
              effectiveness: newSession.effectiveness,
              ordersBySupplier: newSession.ordersBySupplier,
            };
            const { data, error } = await (supabase
              .from('inventory_sessions') as any) // Cast to any
              .upsert(supabaseSession, { onConflict: 'dateKey' })
              .select('dateKey, updated_at') // Select dateKey for consistency
              .single();

            const fetchedSession = data as Pick<Database['public']['Tables']['inventory_sessions']['Row'], 'dateKey' | 'updated_at'> | null;

            if (error) {
              console.error("Error saving new session to Supabase:", error);
              showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
            } else if (fetchedSession) {
                await db.sessions.update(dateKey, { sync_pending: false, updated_at: fetchedSession.updated_at });
              showSuccess('Nueva sesión de inventario iniciada y guardada.');
              warnedItems.current.delete(`session-${dateKey}`);
            } else {
                // Fallback if fetchedSession is null but no error
                await db.sessions.update(dateKey, { sync_pending: false });
            }
          } else {
            console.log("Supabase client not available or offline, skipping save to Supabase. Marked as sync_pending.");
            showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total).');
          }
        } catch (innerError: any) { // Inner catch block
          console.error("Inner Error processing database for inventory:", innerError);
          dispatch({ type: 'SET_ERROR', payload: innerError.message });
          showError(`Error al procesar el inventario: ${innerError.message}`);
        }
      } catch (outerError: any) { // Outer catch block
        console.error("Outer Error processing database for inventory:", outerError);
        dispatch({ type: 'SET_ERROR', payload: outerError.message });
        showError(`Error inesperado al procesar el inventario: ${outerError.message}`);
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false }); // Keep global loading
        dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false });
        updateSyncStatus();
        console.log("Database inventory processing finished.");
      }
    },
    [state.isOnline, updateSyncStatus, loadMasterProductConfigs]
  );

  const processDbForMasterConfigs = useCallback(async (buffer: Uint8Array) => {
    dispatch({ type: 'SET_LOADING', payload: true }); // Keep global loading
    dispatch({ type: 'SET_ERROR', payload: null });
    // Removed SET_SUPABASE_SYNC_IN_PROGRESS from here, it's in finally
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

      if (!db.isOpen()) await db.open();
      const existingMasterProductConfigs = await db.productRules.toArray();
      const masterProductConfigsMap = new Map(existingMasterProductConfigs.map(config => [config.productId, config]));

      const configsToUpdateOrAddInDexie: MasterProductConfig[] = [];
      const configsToUpsertToSupabase: MasterProductConfig[] = [];
      let newProductsCount = 0;
      let updatedProductNamesCount = 0;
      const nowIso = new Date().toISOString(); // Local timestamp for Dexie

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
        let configChangedForSync = false;

        if (!masterConfig) {
          masterConfig = {
            productId: currentProductId,
            productName: dbItem.Producto,
            rules: [],
            supplier: supplierNameFromDb,
            isHidden: false,
            inventory_type: 'monthly', // Default to 'monthly' for new products
            sync_pending: true,
            updated_at: nowIso, // Use local timestamp for Dexie
          };
          newProductsCount++;
          configChangedForSync = true;
        } else {
          const updatedConfig = { ...masterConfig };
          if (updatedConfig.productName !== dbItem.Producto) {
            updatedConfig.productName = dbItem.Producto;
            updatedProductNamesCount++;
            configChangedForSync = true;
          }
          // Ensure inventory_type is set for existing products if it's missing
          if (updatedConfig.inventory_type === undefined || updatedConfig.inventory_type === null) {
            updatedConfig.inventory_type = 'monthly';
            configChangedForSync = true;
          }
          masterConfig = updatedConfig;
        }

        if (configChangedForSync || masterConfig.sync_pending) {
          masterConfig.sync_pending = true;
          masterConfig.updated_at = nowIso; // Use local timestamp for Dexie
          configsToUpsertToSupabase.push(masterConfig);
        }
        configsToUpdateOrAddInDexie.push(masterConfig);
      }

      if (configsToUpdateOrAddInDexie.length > 0) {
        await db.productRules.bulkPut(configsToUpdateOrAddInDexie);
        console.log(`Updated/Added ${configsToUpdateOrAddInDexie.length} master product configs in Dexie.`);
      }

      const pendingForSupabase = configsToUpsertToSupabase.filter(c => c.sync_pending);
      if (supabase && state.isOnline && pendingForSupabase.length > 0) {
        // Use the Database['public']['Tables']['product_rules']['Insert'] type directly
        const supabaseConfigs: Database['public']['Tables']['product_rules']['Insert'][] = pendingForSupabase.map(c => ({
          productId: c.productId,
          productName: c.productName,
          rules: c.rules,
          supplier: c.supplier,
          isHidden: c.isHidden || false,
          inventory_type: c.inventory_type || 'monthly', // Default to 'monthly' for Supabase
        }));
        const { data: fetchedData, error: supabaseUpsertError } = await (supabase
          .from('product_rules') as any) // Cast to any
          .upsert(supabaseConfigs, { onConflict: 'productId' })
          .select('productId, updated_at'); // Select productId for finding

        if (supabaseUpsertError) {
          console.error("Error bulk upserting master product configs to Supabase:", supabaseUpsertError);
          showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
        } else if (fetchedData && fetchedData.length > 0) {
          const fetchedDataTyped = fetchedData as Pick<Database['public']['Tables']['product_rules']['Row'], 'productId' | 'updated_at'>[];
          const fetchedConfigsMap = new Map(fetchedDataTyped.map(item => [item.productId, item])); // Use a map for efficient lookup
          for (const config of pendingForSupabase) {
            const fetchedConfig = fetchedConfigsMap.get(config.productId); // Use map for lookup
            if (fetchedConfig) {
              await db.productRules.update(config.productId, { sync_pending: false, updated_at: fetchedConfig.updated_at });
            } else {
              await db.productRules.update(config.productId, { sync_pending: false });
            }
            warnedItems.current.delete(`product-${config.productId}`);
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
        } else {
          // Fallback if fetchedData is null or empty but no error
          for (const config of pendingForSupabase) {
            await db.productRules.update(config.productId, { sync_pending: false });
          }
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
      await loadMasterProductConfigs(); // Reload configs to reflect any server-generated updated_at
    } catch (e: any) {
      console.error("Error during processing database for master configs:", e);
      showError(`Error al procesar el archivo DB para configuraciones: ${e.message}`);
      dispatch({ type: 'SET_ERROR', payload: e.message });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false }); // Keep global loading
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false });
      updateSyncStatus();
      console.log("Database master config processing finished.");
    }
  }, [state.isOnline, loadMasterProductConfigs, updateSyncStatus, state.masterProductConfigs]);

  // --- Auto-Retry Mechanism ---
  const retryPendingSyncs = useCallback(async () => {
    if (!supabase || !state.isOnline || state.isSupabaseSyncInProgress) {
      return;
    }

    // No global loading for this background retry
    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true });
    console.log("Attempting to retry pending syncs...");

    try {
      if (!db.isOpen()) await db.open();

      const pendingSessions = await db.sessions.toCollection().filter(r => r.sync_pending === true).toArray();
      for (const session of pendingSessions) {
        console.log(`Retrying session: ${session.dateKey}`);
        const supabaseSession: Database['public']['Tables']['inventory_sessions']['Insert'] = {
          dateKey: session.dateKey,
          inventoryType: session.inventoryType,
          inventoryData: session.inventoryData,
          timestamp: session.timestamp, // Sending as Date
          effectiveness: session.effectiveness,
          ordersBySupplier: session.ordersBySupplier,
        };
        const { data, error } = await (supabase
          .from('inventory_sessions') as any) // Cast to any
          .upsert(supabaseSession, { onConflict: 'dateKey' })
          .select('dateKey, updated_at') // Select dateKey for consistency
          .single();

        const fetchedSession = data as Pick<Database['public']['Tables']['inventory_sessions']['Row'], 'dateKey' | 'updated_at'> | null;

        if (error) {
          console.error(`Failed to retry session ${session.dateKey}:`, error);
          dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
          showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
        } else if (fetchedSession) {
            await db.sessions.update(session.dateKey, { sync_pending: false, updated_at: fetchedSession.updated_at });
          console.log(`Session ${session.dateKey} synced successfully.`);
          warnedItems.current.delete(`session-${session.dateKey}`);
        } else {
            await db.sessions.update(session.dateKey, { sync_pending: false });
        }
      }

      const pendingProductRules = await db.productRules.toCollection().filter(r => r.sync_pending === true).toArray();
      for (const config of pendingProductRules) {
        console.log(`Retrying product config: ${config.productName} (${config.productId})`);
        const supabaseConfig: Database['public']['Tables']['product_rules']['Insert'] = {
          productId: config.productId,
          productName: config.productName,
          rules: config.rules,
          supplier: config.supplier,
          isHidden: config.isHidden || false,
          inventory_type: config.inventory_type || 'monthly', // Default to 'monthly' for Supabase
        };
        const { data, error } = await (supabase
          .from('product_rules') as any) // Cast to any
          .upsert(supabaseConfig, { onConflict: 'productId' })
          .select('productId, updated_at');
          
        const fetchedConfig = (data && data.length > 0) ? data[0] as Pick<Database['public']['Tables']['product_rules']['Row'], 'productId' | 'updated_at'> : null;

        if (error) {
          console.error(`Failed to retry product config ${config.productId}:`, error);
          dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
          showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
        } else if (fetchedConfig) {
            await db.productRules.update(config.productId, { sync_pending: false, updated_at: fetchedConfig.updated_at });
          console.log(`Product config ${config.productId} synced successfully.`);
          warnedItems.current.delete(`product-${config.productId}`);
        } else {
            // Fallback if fetchedConfig is null but no error
            await db.productRules.update(config.productId, { sync_pending: false });
        }
      }
      showSuccess('Sincronización automática completada.');
    } catch (e) {
      console.error("Error during retryPendingSyncs:", e);
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
      showError('Error en la sincronización automática.');
    } finally {
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false });
      updateSyncStatus();
    }
  }, [state.isOnline, state.isSupabaseSyncInProgress, updateSyncStatus]);

  // --- NEW: Perform Total Sync (Upload local, then Download cloud) ---
  const syncToSupabase = useCallback(async () => {
    if (!supabase || !state.isOnline) {
      showError('No se puede sincronizar: sin conexión a internet o Supabase no disponible.');
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true }); // Keep global loading for this blocking operation
    dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' });
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true });
    console.log(`🔄 [Sync] Iniciando sincronización bidireccional.`);

    try {
      if (!db.isOpen()) await db.open();

      console.log("[Sync] Uploading local pending sessions...");
      const pendingLocalSessions = await db.sessions.toCollection().filter(r => r.sync_pending === true).toArray();
      for (const session of pendingLocalSessions) {
        const supabaseSession: Database['public']['Tables']['inventory_sessions']['Insert'] = {
          dateKey: session.dateKey,
          inventoryType: session.inventoryType,
          inventoryData: session.inventoryData,
          timestamp: session.timestamp, // Sending as Date
          effectiveness: session.effectiveness,
          ordersBySupplier: session.ordersBySupplier,
        };
        const { data, error } = await (supabase
          .from('inventory_sessions') as any) // Cast to any
          .upsert(supabaseSession, { onConflict: 'dateKey' })
          .select('dateKey, updated_at') // Select dateKey for consistency
          .single();

        const fetchedSession = data as Pick<Database['public']['Tables']['inventory_sessions']['Row'], 'dateKey' | 'updated_at'> | null;

        if (error) {
          console.error(`[Sync] Error uploading pending session ${session.dateKey} to Supabase:`, error);
          showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
        } else if (fetchedSession) {
            await db.sessions.update(session.dateKey, { sync_pending: false, updated_at: fetchedSession.updated_at });
          warnedItems.current.delete(`session-${session.dateKey}`);
        } else {
            await db.sessions.update(session.dateKey, { sync_pending: false });
        }
      }
      console.log("[Sync] Uploading local pending product configs...");
      const pendingLocalProductRules = await db.productRules.toCollection().filter(r => r.sync_pending === true).toArray();
      for (const config of pendingLocalProductRules) {
        const supabaseConfig: Database['public']['Tables']['product_rules']['Insert'] = {
          productId: config.productId,
          productName: config.productName,
          rules: config.rules,
          supplier: config.supplier,
          isHidden: config.isHidden || false,
          inventory_type: config.inventory_type || 'monthly', // Default to 'monthly' for Supabase
        };
        const { data, error } = await (supabase
          .from('product_rules') as any) // Cast to any
          .upsert(supabaseConfig, { onConflict: 'productId' })
          .select('productId, updated_at');
          
        const fetchedConfig = (data && data.length > 0) ? data[0] as Pick<Database['public']['Tables']['product_rules']['Row'], 'productId' | 'updated_at'> : null;

        if (error) {
          console.error(`[Sync] Error uploading pending product config ${config.productId} to Supabase:`, error);
          showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
        } else if (fetchedConfig) {
            await db.productRules.update(config.productId, { sync_pending: false, updated_at: fetchedConfig.updated_at });
          warnedItems.current.delete(`product-${config.productId}`);
        } else {
            await db.productRules.update(config.productId, { sync_pending: false });
        }
      }
      console.log('[Sync] Cambios locales subidos a la nube.');

      console.log("[Sync] Downloading all sessions from Supabase...");
      const { data: supabaseSessions, error: sessionsError } = await supabase
        .from('inventory_sessions')
        .select('*');
      if (sessionsError) throw sessionsError;

      const localSessions = await db.sessions.toArray();
      const localSessionsMap = new Map(localSessions.map(s => [s.dateKey, s]));
      const supabaseSessionDateKeys = new Set((supabaseSessions as Database['public']['Tables']['inventory_sessions']['Row'][]).map(s => s.dateKey));
      const sessionsToPutLocally: InventorySession[] = [];
      const sessionsToDeleteLocally: string[] = [];

      if (supabaseSessions && supabaseSessions.length > 0) {
        for (const s of supabaseSessions as Database['public']['Tables']['inventory_sessions']['Row'][]) {
          const typedSession: InventorySession = {
            dateKey: s.dateKey,
            inventoryType: s.inventoryType,
            inventoryData: s.inventoryData,
            timestamp: new Date(s.timestamp),
            effectiveness: s.effectiveness,
            ordersBySupplier: s.ordersBySupplier,
            sync_pending: false,
            updated_at: s.updated_at,
          };
          const localSession = localSessionsMap.get(typedSession.dateKey);

          // Remote wins (Last Write Wins)
          sessionsToPutLocally.push(typedSession);
        }
        await db.sessions.bulkPut(sessionsToPutLocally);

        const localSessionsAfterPut = await db.sessions.toArray();
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
        const localNonPendingSessions = localSessions.filter(s => s.sync_pending === false);
        if (localNonPendingSessions.length > 0) {
          await db.sessions.bulkDelete(localNonPendingSessions.map(s => s.dateKey));
          console.log(`[Sync] Limpieza local: Eliminando todas las sesiones no pendientes ya que Supabase está vacío: [${localNonPendingSessions.map(s => s.dateKey).join(', ')}]`);
        }
      }

      console.log("[Sync] Downloading all product configs from Supabase...");
      const { data: supabaseProductRules, error: productRulesError } = await supabase
        .from('product_rules')
        .select('*');
      if (productRulesError) throw productRulesError;

      const localProductRules = await db.productRules.toArray();
      const localProductRulesMap = new Map(localProductRules.map(c => [c.productId, c]));
      const supabaseProductRuleIds = new Set((supabaseProductRules as Database['public']['Tables']['product_rules']['Row'][]).map(c => c.productId));
      const productRulesToPutLocally: MasterProductConfig[] = [];
      const productRulesToDeleteLocally: number[] = [];

      if (supabaseProductRules && supabaseProductRules.length > 0) {
        for (const c of supabaseProductRules as Database['public']['Tables']['product_rules']['Row'][]) {
          const typedConfig: MasterProductConfig = {
            productId: c.productId,
            productName: c.productName,
            rules: c.rules,
            supplier: c.supplier,
            isHidden: c.isHidden || false,
            inventory_type: c.inventory_type || 'monthly', // Default to 'monthly' if not set
            sync_pending: false,
            updated_at: c.updated_at,
          };
          const localConfig = localProductRulesMap.get(typedConfig.productId);

          // Remote wins (Last Write Wins)
          productRulesToPutLocally.push(typedConfig);
        }
        await db.productRules.bulkPut(productRulesToPutLocally);

        const localProductRulesAfterPut = await db.productRules.toArray();
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
        const localNonPendingProductRules = localProductRules.filter(c => c.sync_pending === false);
        if (localNonPendingProductRules.length > 0) {
          await db.productRules.bulkDelete(localNonPendingProductRules.map(c => c.productId));
          console.log(`[Sync] Limpieza local: Eliminando todas las configuraciones de producto no pendientes ya que Supabase está vacío: [${localNonPendingProductRules.map(c => c.productId).join(', ')}]`);
        }
      }
      console.log('[Sync] Configuraciones y sesiones descargadas de la nube.');

      console.log("🔄 [Sync] Sincronización bidireccional finalizada con éxito.");
      lastSyncTimestampRef.current = Date.now();
      await loadMasterProductConfigs();
      await getSessionHistory();
    } catch (e: any) {
      console.error(`🔄 [Sync] Error during syncToSupabase:`, e);
      dispatch({ type: 'SET_ERROR', payload: e.message });
      showError(`Error en la sincronización: ${e.message}`);
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false }); // Keep global loading
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false });
      updateSyncStatus();
    }
  }, [state.isOnline, state.isSupabaseSyncInProgress, loadMasterProductConfigs, updateSyncStatus, getSessionHistory]);

  // Nueva función para sincronización al cambiar de pestaña
  const handleVisibilityChangeSync = useCallback(async () => {
    if (document.visibilityState === 'visible' && state.isOnline) {
      console.log('[Sync] Tab became visible, performing recovery sync...');
      await syncToSupabase();
    }
  }, [state.isOnline, syncToSupabase]);

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

    dispatch({ type: 'SET_LOADING', payload: true }); // Keep global loading
    dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' });
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true });
    showSuccess('Reiniciando todas las configuraciones de productos...');
    console.log("Starting reset all product configurations...");

    try {
      if (!db.isOpen()) await db.open();

      await db.productRules.clear();

      const { error: deleteError } = await (supabase
        .from('product_rules') as any) // Cast to any
        .delete()
        .neq('productId', 0);

      if (deleteError) throw deleteError;
      console.log("All product rules deleted from Supabase.");

      await processDbForMasterConfigs(buffer);
      showSuccess('Configuración de productos reiniciada y cargada desde el archivo DB.');

    } catch (e: any) {
      console.error("Error during resetAllProductConfigs:", e);
      dispatch({ type: 'SET_ERROR', payload: e.message });
      showError(`Error al reiniciar la configuración: ${e.message}`);
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false }); // Keep global loading
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false });
      updateSyncStatus();
    }
  }, [state.isOnline, state.isSupabaseSyncInProgress, processDbForMasterConfigs, updateSyncStatus]);

  // --- NEW: Clear Local Database ---
  const clearLocalDatabase = useCallback(async () => {
    if (state.isSupabaseSyncInProgress) {
      showError('Sincronización ya en curso. Por favor, espera a que termine el proceso actual antes de limpiar la base de datos.');
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true }); // Keep global loading
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true });
    showSuccess('Limpiando base de datos local...');
    console.log("Starting clear local database...");

    try {
      if (db.isOpen()) {
        await db.close();
      }
      await db.delete();
      await db.open();

      dispatch({ type: 'RESET_STATE' });
      dispatch({ type: 'SET_MASTER_PRODUCT_CONFIGS', payload: [] });
      dispatch({ type: 'SET_CURRENT_SESSION_ORDERS', payload: null }); // NEW: Limpiar pedidos al limpiar DB
      showSuccess('Base de datos local limpiada con éxito.');
      console.log("Local database cleared successfully.");
    } catch (e: any) {
      console.error("Error during clearLocalDatabase:", e);
      dispatch({ type: 'SET_ERROR', payload: e.message });
      showError(`Error al limpiar la base de datos local: ${e.message}`);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false }); // Keep global loading
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false });
      updateSyncStatus();
    }
  }, [state.isSupabaseSyncInProgress, updateSyncStatus]);

  // --- Persistence Alert: Check for long-pending syncs ---
  useEffect(() => {
    const checkLongPendingSyncs = async () => {
      if (!state.isOnline || !supabase) {
        return;
      }
      if (state.isSupabaseSyncInProgress) {
        return;
      }

      try {
        if (!db.isOpen()) await db.open();
        const now = Date.now();
        const THIRTY_SECONDS = 30 * 1000;

        const pendingSessions = await db.sessions.toCollection().filter(s => s.sync_pending === true).toArray();
        for (const session of pendingSessions) {
          const itemId = `session-${session.dateKey}`;
          if (!warnedItems.current.has(itemId) && (now - new Date(session.updated_at).getTime()) > THIRTY_SECONDS) {
            showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
            warnedItems.current.add(itemId);
          }
        }

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

    const intervalId = setInterval(checkLongPendingSyncs, 15000);

    return () => {
      clearInterval(intervalId);
      if (syncBlockedWarningTimeoutRef.current) {
        clearTimeout(syncBlockedWarningTimeoutRef.current);
        syncBlockedWarningTimeoutRef.current = null;
      }
    };
  }, [state.isOnline, state.isSupabaseSyncInProgress]);

  // --- NEW: Fetch Initial Data from Supabase ---
  const fetchInitialData = useCallback(async () => {
    if (!supabase || !state.isOnline) {
      console.log("Supabase not available or offline, skipping initial data fetch.");
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true }); // Keep global loading
    console.log("Fetching initial data from Supabase...");

    try {
      if (!db.isOpen()) await db.open();

      // 1. Fetch product_rules from Supabase
      const { data: supabaseProductRules, error: productRulesError } = await supabase
        .from('product_rules')
        .select('*');

      if (productRulesError) {
        console.error("Error fetching product_rules from Supabase:", productRulesError);
      } else if (supabaseProductRules && supabaseProductRules.length > 0) {
        // Convert Supabase data to Dexie format
        const productRulesToPut: MasterProductConfig[] = (supabaseProductRules as Database['public']['Tables']['product_rules']['Row'][]).map(rule => ({
          productId: rule.productId,
          productName: rule.productName,
          rules: rule.rules,
          supplier: rule.supplier,
          isHidden: rule.isHidden || false,
          inventory_type: rule.inventory_type || 'monthly', // Default to 'monthly' if not set
          sync_pending: false,
          updated_at: rule.updated_at,
        }));

        // Save to Dexie
        await db.productRules.bulkPut(productRulesToPut);
        console.log(`Loaded ${productRulesToPut.length} product rules from Supabase into Dexie.`);

        // Update state
        dispatch({ type: 'SET_MASTER_PRODUCT_CONFIGS', payload: productRulesToPut.filter(r => !r.isHidden) });
      }

      // 2. Fetch inventory_sessions from Supabase
      const { data: supabaseSessions, error: sessionsError } = await supabase
        .from('inventory_sessions')
        .select('*');

      if (sessionsError) {
        console.error("Error fetching inventory_sessions from Supabase:", sessionsError);
      } else if (supabaseSessions && supabaseSessions.length > 0) {
        // Convert Supabase data to Dexie format
        const sessionsToPut: InventorySession[] = (supabaseSessions as Database['public']['Tables']['inventory_sessions']['Row'][]).map(session => ({
          dateKey: session.dateKey,
          inventoryType: session.inventoryType,
          inventoryData: session.inventoryData,
          timestamp: new Date(session.timestamp),
          effectiveness: session.effectiveness,
          ordersBySupplier: session.ordersBySupplier,
          sync_pending: false,
          updated_at: session.updated_at,
        }));

        // Save to Dexie
        await db.sessions.bulkPut(sessionsToPut);
        console.log(`Loaded ${sessionsToPut.length} sessions from Supabase into Dexie.`);

        // Update state if there's a current session
        if (state.sessionId) {
          const currentSession = sessionsToPut.find(s => s.dateKey === state.sessionId);
          if (currentSession) {
            dispatch({ type: 'UPDATE_CURRENT_SESSION_DATA', payload: {
              dateKey: currentSession.dateKey,
              inventoryData: currentSession.inventoryData,
              effectiveness: currentSession.effectiveness
            }});
            dispatch({ type: 'SET_CURRENT_SESSION_ORDERS', payload: currentSession.ordersBySupplier || null }); // NEW: Cargar pedidos de la sesión
          }
        }
      }

      console.log("Initial data fetch completed successfully.");
    } catch (e) {
      console.error("Error during initial data fetch:", e);
      showError('Error al cargar datos iniciales desde la nube.');
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false }); // Keep global loading
    }
  }, [supabase, state.isOnline, state.sessionId]);

  // --- NEW: Fetch Initial Data on Mount ---
  useEffect(() => {
    const checkDexieEmptyAndFetch = async () => {
      console.log("InventoryContext useEffect: checkDexieEmptyAndFetch triggered.");
      // Evitar la ejecución si ya se hizo la carga inicial o si ya hay una operación de carga en curso
      if (initialFetchDoneRef.current || state.loading) {
        console.log("Skipping initial fetch: already done or loading is true.");
        return;
      }

      if (!db.isOpen()) await db.open();
      const productRulesCount = await db.productRules.count();
      const sessionsCount = await db.sessions.count();
      console.log(`Dexie counts: productRules=${productRulesCount}, sessions=${sessionsCount}`);

      if (productRulesCount === 0 && sessionsCount === 0) {
        console.log("Dexie is empty, fetching initial data from Supabase...");
        await fetchInitialData();
      } else {
        console.log("Dexie already has data, loading master configs...");
        await loadMasterProductConfigs();
      }
      initialFetchDoneRef.current = true; // Marcar como completado después de la ejecución
    };

    checkDexieEmptyAndFetch();
  }, [fetchInitialData, loadMasterProductConfigs, state.loading]); // state.loading es una dependencia para reaccionar a su cambio, pero la guarda interna evita la ejecución.

  // --- Debounced Save Setup ---
  useEffect(() => {
    // MODIFIED: debounced function now accepts forcedSessionId
    debouncedSaveCurrentSessionRef.current = debounce(async (data: InventoryItem[], forcedSessionId?: string) => {
      if (state.sessionId && state.inventoryType) {
        console.log('[Debounced Save] Executing debounced save for current session.');
        // Usamos la data pasada como argumento, que es la última versión del estado
        // MODIFIED: Pass forcedSessionId to saveCurrentSession
        await saveCurrentSession(data, state.inventoryType, new Date(), state.currentSessionOrders || undefined, forcedSessionId);
      }
    }, 1000); // Guardar 1 segundo después de la última edición

    // Cleanup para el debounce
    return () => {
      debouncedSaveCurrentSessionRef.current?.cancel();
    };
  }, [state.sessionId, state.inventoryType, saveCurrentSession, state.currentSessionOrders]); // state.sessionId is now a dependency

  // Función para actualizar el estado y disparar el guardado debounced
  const updateAndDebounceSaveInventoryItem = useCallback((index: number, key: keyof InventoryItem, value: number | boolean) => {
    setSyncStatus('pending');

    const currentRawInventoryItems = state.rawInventoryItemsFromDb;
    const updatedData = [...currentRawInventoryItems]; // Crear una nueva referencia de array
    if (updatedData[index]) {
      if (key === "physicalQuantity") {
        updatedData[index] = { // Crear una nueva referencia para el objeto modificado
          ...updatedData[index],
          physicalQuantity: Math.max(0, value as number),
          hasBeenEdited: true,
        };
      } else if (key === "averageSales") {
        updatedData[index] = { // Crear una nueva referencia para el objeto modificado
          ...updatedData[index],
          averageSales: value as number,
        };
      } else if (key === "hasBeenEdited") {
        updatedData[index] = { // Crear una nueva referencia para el objeto modificado
          ...updatedData[index],
          hasBeenEdited: value as boolean,
        };
      }
    }

    dispatch({ type: 'SET_RAW_INVENTORY_ITEMS_FROM_DB', payload: updatedData });

    // Disparar el guardado debounced con la data actualizada
    if (debouncedSaveCurrentSessionRef.current && state.sessionId && state.inventoryType) {
      // MODIFIED: Pass state.sessionId as forcedSessionId
      debouncedSaveCurrentSessionRef.current(updatedData, state.sessionId);
    }
  }, [setSyncStatus, state.rawInventoryItemsFromDb, state.sessionId, state.inventoryType]); // state.sessionId is now a dependency

  // Función para forzar la ejecución del guardado debounced
  const flushPendingSessionSave = useCallback(() => {
    if (debouncedSaveCurrentSessionRef.current) {
      debouncedSaveCurrentSessionRef.current.flush();
      console.log('[Flush Save] Forced execution of pending debounced save.');
    }
  }, []);

  // --- NEW: beforeunload listener for emergency save ---
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (state.sessionId && state.inventoryType && state.rawInventoryItemsFromDb.length > 0) {
        console.log('[BeforeUnload] Flushing pending session save...');
        flushPendingSessionSave();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [state.sessionId, state.inventoryType, state.rawInventoryItemsFromDb, flushPendingSessionSave]);

  const value = useMemo(() => ({
    ...state,
    filteredInventoryData,
    setDbBuffer,
    setInventoryType,
    setRawInventoryItemsFromDb,
    setMasterProductConfigs,
    setSyncStatus,
    processInventoryData,
    processDbForMasterConfigs,
    saveCurrentSession,
    loadSession,
    deleteSession,
    getSessionHistory,
    resetInventoryState,
    syncToSupabase,
    saveMasterProductConfig,
    deleteMasterProductConfig,
    loadMasterProductConfigs,
    handleVisibilityChangeSync,
    resetAllProductConfigs,
    clearLocalDatabase,
    updateAndDebounceSaveInventoryItem,
    flushPendingSessionSave,
    fetchInitialData,
    updateSyncStatus,
  }), [
    state,
    filteredInventoryData,
    setDbBuffer,
    setInventoryType,
    setRawInventoryItemsFromDb,
    setMasterProductConfigs,
    setSyncStatus,
    processInventoryData,
    processDbForMasterConfigs,
    saveCurrentSession,
    loadSession,
    deleteSession,
    getSessionHistory,
    resetInventoryState,
    syncToSupabase,
    saveMasterProductConfig,
    deleteMasterProductConfig,
    loadMasterProductConfigs,
    handleVisibilityChangeSync,
    resetAllProductConfigs,
    clearLocalDatabase,
    updateAndDebounceSaveInventoryItem,
    flushPendingSessionSave,
    fetchInitialData,
    updateSyncStatus,
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