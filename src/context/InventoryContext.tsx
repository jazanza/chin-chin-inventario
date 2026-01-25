/**
 * @file src/context/InventoryContext.tsx
 * @description Contexto global simplificado para la gestión de inventarios, sesiones y sincronización con Supabase.
 * @version v1.5.0
 * @date 2024-07-26
 *
 * PROPÓSITO DE LA VERSIÓN v1.5.0:
 * Simplificar radicalmente la arquitectura para eliminar bloqueos y restaurar la usabilidad.
 * Eliminar Realtime, Sync Locks y lógica compleja.
 */

import React, { createContext, useReducer, useContext, useCallback, useEffect, useMemo, useRef } from "react";
import { initDb, loadDb, queryData } from "@/lib/db";
import productData from "@/data/product-data.json"; // Asegúrate de que este archivo exista si se usa
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
  quantityToOrder: number;
  finalOrderQuantity: number;
}

// --- Reducer Setup ---
type SyncStatus = 'idle' | 'syncing' | 'pending' | 'synced' | 'error';

interface InventoryState {
  dbBuffer: Uint8Array | null;
  inventoryType: "weekly" | "monthly" | null;
  rawInventoryItemsFromDb: InventoryItem[];
  masterProductConfigs: MasterProductConfig[];
  loading: boolean;
  error: string | null;
  sessionId: string | null;
  syncStatus: SyncStatus;
  isOnline: boolean;
  isSupabaseSyncInProgress: boolean;
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
  | { type: 'UPDATE_SINGLE_PRODUCT_RULE'; payload: MasterProductConfig }
  | { type: 'UPDATE_CURRENT_SESSION_DATA'; payload: { dateKey: string, inventoryData: InventoryItem[], effectiveness: number } }
  | { type: 'DELETE_SESSION'; payload: string }
  | { type: 'DELETE_PRODUCT_RULE'; payload: number }
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
    case 'UPDATE_SINGLE_PRODUCT_RULE': {
      const updatedConfig = action.payload;
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
        newConfigs = [...state.masterProductConfigs, updatedConfig];
      }
      return { ...state, masterProductConfigs: newConfigs };
    }
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
        };
      }
      return state;
    }
    case 'DELETE_PRODUCT_RULE': {
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
        isSupabaseSyncInProgress: false,
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
  saveCurrentSession: (data: InventoryItem[], type: "weekly" | "monthly", timestamp: Date, orders?: { [supplier: string]: OrderItem[] }) => Promise<void>;
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

  // Ref para la función debounced de guardado de sesión
  const debouncedSaveCurrentSessionRef = useRef<((data: InventoryItem[]) => void) & { flush: () => void } | null>(null);

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
    const previousDataMap = new Map(previousFilteredInventoryDataRef.current.map(item => [item.productId, item]));

    const newFilteredData: InventoryItem[] = [];

    state.rawInventoryItemsFromDb.forEach(item => {
      const masterConfig = masterConfigsMap.get(item.productId);
      if (!masterConfig || masterConfig.isHidden) {
        return;
      }

      const previousItem = previousDataMap.get(item.productId);
      newFilteredData.push({
        ...item,
        physicalQuantity: previousItem ? previousItem.physicalQuantity : item.systemQuantity,
        hasBeenEdited: previousItem ? previousItem.hasBeenEdited : false,
        rules: masterConfig.rules,
        supplier: masterConfig.supplier,
      });
    });

    previousFilteredInventoryDataRef.current = newFilteredData;
    return newFilteredData;
  }, [state.rawInventoryItemsFromDb, state.masterProductConfigs]);

  // --- Core Persistence Functions (Sessions) ---
  const saveCurrentSession = useCallback(async (
    data: InventoryItem[],
    type: "weekly" | "monthly",
    timestamp: Date,
    orders?: { [supplier: string]: OrderItem[] }
  ) => {
    if (!data || data.length === 0) return;

    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true });
    const dateKey = format(timestamp, 'yyyy-MM-dd'); // ISO 8601
    const effectiveness = calculateEffectiveness(data);
    const nowIso = new Date().toISOString(); // Local timestamp for Dexie

    try {
      if (!db.isOpen()) await db.open();
      const existingSession = await db.sessions.get(dateKey);
      const ordersToSave = orders !== undefined ? orders : existingSession?.ordersBySupplier;

      const sessionToSave: InventorySession = {
        dateKey,
        inventoryType: type,
        inventoryData: data,
        timestamp,
        effectiveness,
        ordersBySupplier: ordersToSave,
        sync_pending: true,
        updated_at: nowIso, // Use local timestamp for Dexie
      };

      await db.sessions.put(sessionToSave); // Persistir en Dexie primero

      if (!state.sessionId) {
        dispatch({ type: 'SET_SESSION_ID', payload: dateKey });
      }

      if (!supabase || !state.isOnline) {
        showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
        updateSyncStatus();
        return;
      }

      // Omit updated_at from Supabase payload to let the server manage it
      const supabaseSession: Omit<Database['public']['Tables']['inventory_sessions']['Insert'], 'updated_at'> = {
        dateKey: sessionToSave.dateKey,
        inventoryType: sessionToSave.inventoryType,
        inventoryData: sessionToSave.inventoryData,
        timestamp: sessionToSave.timestamp.toISOString(),
        effectiveness: sessionToSave.effectiveness,
        ordersBySupplier: sessionToSave.ordersBySupplier,
        // updated_at is omitted here
      };
      const { error } = await (supabase
        .from('inventory_sessions') as any)
        .upsert(supabaseSession, { onConflict: 'dateKey' });

      if (error) {
        console.error("Error saving session to Supabase:", error);
        showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
      } else {
        // After successful Supabase upsert, fetch the server-generated updated_at
        // and update Dexie to reflect it, marking as not pending.
        const { data: fetchedSession, error: fetchError } = await supabase
          .from('inventory_sessions')
          .select('updated_at')
          .eq('dateKey', dateKey)
          .single();

        if (fetchError || !fetchedSession) {
          console.error("Error fetching updated_at after upsert:", fetchError);
          // Fallback: just mark as not pending, keep local updated_at
          await db.sessions.update(dateKey, { sync_pending: false });
        } else {
          await db.sessions.update(dateKey, { sync_pending: false, updated_at: fetchedSession.updated_at });
        }
        console.log("Session saved to Supabase successfully.");
        warnedItems.current.delete(`session-${dateKey}`);
      }
    } catch (e) {
      console.error("Error saving session:", e);
      showError('Error al guardar la sesión localmente.');
      throw e;
    } finally {
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false });
      updateSyncStatus();
    }
  }, [state.sessionId, state.isOnline, updateSyncStatus]);

  const loadSession = useCallback(async (dateKey: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      if (!db.isOpen()) await db.open();
      const session = await db.sessions.get(dateKey);
      if (session) {
        dispatch({ type: 'SET_INVENTORY_TYPE', payload: session.inventoryType });
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
    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true });

    try {
      if (!db.isOpen()) await db.open();
      await db.sessions.delete(dateKey); // Eliminar de Dexie primero

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
          warnedItems.current.delete(`session-${dateKey}`);
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
  }, [updateSyncStatus, state.masterProductConfigs]);

  const saveMasterProductConfig = useCallback(async (config: MasterProductConfig) => {
    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true });
    try {
      if (!db.isOpen()) await db.open();
      const nowIso = new Date().toISOString(); // Local timestamp for Dexie
      const configToSave = { ...config, productId: Number(config.productId), sync_pending: true, updated_at: nowIso };
      await db.productRules.put(configToSave); // Persistir en Dexie primero

      if (!supabase || !state.isOnline) {
        showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
        updateSyncStatus();
        await loadMasterProductConfigs();
        return;
      }

      // Omit updated_at from Supabase payload to let the server manage it
      const supabaseConfig: Omit<Database['public']['Tables']['product_rules']['Insert'], 'updated_at'> = {
        productId: configToSave.productId,
        productName: configToSave.productName,
        rules: configToSave.rules,
        supplier: configToSave.supplier,
        isHidden: configToSave.isHidden || false,
        // updated_at is omitted here
      };
      const { error } = await (supabase
        .from('product_rules') as any)
        .upsert(supabaseConfig, { onConflict: 'productId' });

      if (error) {
        console.error("Error saving master product config to Supabase:", error);
        showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
      } else {
        // After successful Supabase upsert, fetch the server-generated updated_at
        // and update Dexie to reflect it, marking as not pending.
        const { data: fetchedConfig, error: fetchError } = await supabase
          .from('product_rules')
          .select('updated_at')
          .eq('productId', configToSave.productId)
          .single();

        if (fetchError || !fetchedConfig) {
          console.error("Error fetching updated_at after upsert:", fetchError);
          // Fallback: just mark as not pending, keep local updated_at
          await db.productRules.update(configToSave.productId, { sync_pending: false });
        } else {
          await db.productRules.update(configToSave.productId, { sync_pending: false, updated_at: fetchedConfig.updated_at });
        }
        console.log("Master product config saved to Supabase successfully.");
        warnedItems.current.delete(`product-${config.productId}`);
      }
      await loadMasterProductConfigs();
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
    dispatch({ type: 'SET_LOADING', payload: true });
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
        await loadMasterProductConfigs();
        if (state.sessionId && state.inventoryType && filteredInventoryData.length > 0) {
          await saveCurrentSession(filteredInventoryData, state.inventoryType, new Date());
        }
        return;
      }

      // Omit updated_at from Supabase payload to let the server manage it
      const { error } = await (supabase
        .from('product_rules') as any)
        .update({ isHidden: newIsHidden /* updated_at is omitted here */ })
        .eq('productId', numericProductId);

      if (error) {
        console.error("Error toggling master product config from Supabase:", error);
        showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
      } else {
        // After successful Supabase update, fetch the server-generated updated_at
        // and update Dexie to reflect it, marking as not pending.
        const { data: fetchedConfig, error: fetchError } = await supabase
          .from('product_rules')
          .select('updated_at')
          .eq('productId', numericProductId)
          .single();

        if (fetchError || !fetchedConfig) {
          console.error("Error fetching updated_at after toggle upsert:", fetchError);
          // Fallback: just mark as not pending, keep local updated_at
          await db.productRules.update(numericProductId, { sync_pending: false });
        } else {
          await db.productRules.update(numericProductId, { sync_pending: false, updated_at: fetchedConfig.updated_at });
        }
        console.log("Master product config visibility toggled in Supabase successfully.");
        warnedItems.current.delete(`product-${numericProductId}`);
      }
      showSuccess(`Configuración de producto ${newIsHidden ? 'ocultada' : 'restaurada'}.`);

      await loadMasterProductConfigs();

      if (state.sessionId && state.inventoryType && filteredInventoryData.length > 0) {
        await saveCurrentSession(filteredInventoryData, state.inventoryType, new Date());
      }
    } catch (e) {
      console.error("Error toggling master product config:", e);
      showError('Error al cambiar la visibilidad de la configuración de producto.');
      throw e;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false });
      updateSyncStatus();
    }
  }, [state.isOnline, updateSyncStatus, loadMasterProductConfigs, state.sessionId, state.inventoryType, filteredInventoryData, saveCurrentSession]);

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
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true });
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
          dispatch({ type: 'SET_RAW_INVENTORY_ITEMS_FROM_DB', payload: [] });
          dispatch({ type: 'SET_INVENTORY_TYPE', payload: type });
          dispatch({ type: 'SET_SESSION_ID', payload: format(new Date(), 'yyyy-MM-dd') });
          showError('No se encontraron productos de inventario en la base de datos.');
          return;
        }

        if (!db.isOpen()) await db.open();
        const allMasterProductConfigs = await db.productRules.toArray();
        const masterProductConfigsMap = new Map(allMasterProductConfigs.map(config => [config.productId, config]));

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
          await db.productRules.bulkPut(configsToUpdateOrAddInDexie);
          console.log(`Updated/Added ${configsToUpdateOrAddInDexie.length} master product configs in Dexie.`);
        }

        const pendingForSupabase = configsToUpsertToSupabase.filter(c => c.sync_pending);
        if (supabase && state.isOnline && pendingForSupabase.length > 0) {
          // Omit updated_at from Supabase payload to let the server manage it
          const supabaseConfigs: Omit<Database['public']['Tables']['product_rules']['Insert'], 'updated_at'>[] = pendingForSupabase.map(c => ({
            productId: c.productId,
            productName: c.productName,
            rules: c.rules,
            supplier: c.supplier,
            isHidden: c.isHidden || false,
            // updated_at is omitted here
          }));
          const { error: supabaseUpsertError } = await (supabase
            .from('product_rules') as any)
            .upsert(supabaseConfigs, { onConflict: 'productId' });

          if (supabaseUpsertError) {
            console.error("Error bulk upserting master product configs to Supabase:", supabaseUpsertError);
            showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
          } else {
            // After successful Supabase upsert, fetch the server-generated updated_at
            // and update Dexie to reflect it, marking as not pending.
            for (const config of pendingForSupabase) {
              const { data: fetchedConfig, error: fetchError } = await supabase
                .from('product_rules')
                .select('updated_at')
                .eq('productId', config.productId)
                .single();

              if (fetchError || !fetchedConfig) {
                console.error("Error fetching updated_at after upsert:", fetchError);
                // Fallback: just mark as not pending, keep local updated_at
                await db.productRules.update(config.productId, { sync_pending: false });
              } else {
                await db.productRules.update(config.productId, { sync_pending: false, updated_at: fetchedConfig.updated_at });
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
        }
      await loadMasterProductConfigs(); // Reload configs to reflect any server-generated updated_at

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

        dispatch({ type: 'SET_RAW_INVENTORY_ITEMS_FROM_DB', payload: finalProcessedInventory });
        dispatch({ type: 'SET_INVENTORY_TYPE', payload: type });

        const dateKey = format(new Date(), 'yyyy-MM-dd');
        const effectiveness = calculateEffectiveness(finalProcessedInventory);

        const newSession: InventorySession = {
          dateKey,
          inventoryType: type,
          inventoryData: finalProcessedInventory,
          timestamp: new Date(),
          effectiveness,
          sync_pending: true,
          updated_at: nowIso, // Use local timestamp for Dexie
        };
        await db.sessions.put(newSession); // Persistir en Dexie primero
        dispatch({ type: 'SET_SESSION_ID', payload: dateKey });

        if (supabase && state.isOnline) {
          // Omit updated_at from Supabase payload to let the server manage it
          const supabaseSession: Omit<Database['public']['Tables']['inventory_sessions']['Insert'], 'updated_at'> = {
            dateKey: newSession.dateKey,
            inventoryType: newSession.inventoryType,
            inventoryData: newSession.inventoryData,
            timestamp: newSession.timestamp.toISOString(),
            effectiveness: newSession.effectiveness,
            ordersBySupplier: newSession.ordersBySupplier,
            // updated_at is omitted here
          };
          const { error } = await (supabase
            .from('inventory_sessions') as any)
            .upsert(supabaseSession, { onConflict: 'dateKey' });

          if (error) {
            console.error("Error saving new session to Supabase:", error);
            showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
          } else {
            // After successful Supabase upsert, fetch the server-generated updated_at
            // and update Dexie to reflect it, marking as not pending.
            const { data: fetchedSession, error: fetchError } = await supabase
              .from('inventory_sessions')
              .select('updated_at')
              .eq('dateKey', dateKey)
              .single();

            if (fetchError || !fetchedSession) {
              console.error("Error fetching updated_at after upsert:", fetchError);
              // Fallback: just mark as not pending, keep local updated_at
              await db.sessions.update(dateKey, { sync_pending: false });
            } else {
              await db.sessions.update(dateKey, { sync_pending: false, updated_at: fetchedSession.updated_at });
            }
            showSuccess('Nueva sesión de inventario iniciada y guardada.');
            warnedItems.current.delete(`session-${dateKey}`);
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
        dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false });
        updateSyncStatus();
        console.log("Database inventory processing finished.");
      }
    },
    [state.isOnline, updateSyncStatus, loadMasterProductConfigs]
  );

  const processDbForMasterConfigs = useCallback(async (buffer: Uint8Array) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true });
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
        // Omit updated_at from Supabase payload to let the server manage it
        const supabaseConfigs: Omit<Database['public']['Tables']['product_rules']['Insert'], 'updated_at'>[] = pendingForSupabase.map(c => ({
          productId: c.productId,
          productName: c.productName,
          rules: c.rules,
          supplier: c.supplier,
          isHidden: c.isHidden || false,
          // updated_at is omitted here
        }));
        const { error: supabaseUpsertError } = await (supabase
          .from('product_rules') as any)
          .upsert(supabaseConfigs, { onConflict: 'productId' });

        if (supabaseUpsertError) {
          console.error("Error bulk upserting master product configs to Supabase:", supabaseUpsertError);
          showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
        } else {
          // After successful Supabase upsert, fetch the server-generated updated_at
          // and update Dexie to reflect it, marking as not pending.
          for (const config of pendingForSupabase) {
            const { data: fetchedConfig, error: fetchError } = await supabase
              .from('product_rules')
              .select('updated_at')
              .eq('productId', config.productId)
              .single();

            if (fetchError || !fetchedConfig) {
              console.error("Error fetching updated_at after upsert:", fetchError);
              // Fallback: just mark as not pending, keep local updated_at
              await db.productRules.update(config.productId, { sync_pending: false });
            } else {
              await db.productRules.update(config.productId, { sync_pending: false, updated_at: fetchedConfig.updated_at });
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
      dispatch({ type: 'SET_LOADING', payload: false });
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

    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true });
    console.log("Attempting to retry pending syncs..."); // Diagnóstico: Intento de reintentar sincronizaciones pendientes

    try {
      if (!db.isOpen()) await db.open();

      const pendingSessions = await db.sessions.toCollection().filter(r => r.sync_pending === true).toArray();
      for (const session of pendingSessions) {
        console.log(`Retrying session: ${session.dateKey}`); // Diagnóstico: Reintentando sesión específica
        // Omit updated_at from Supabase payload to let the server manage it
        const supabaseSession: Omit<Database['public']['Tables']['inventory_sessions']['Insert'], 'updated_at'> = {
          dateKey: session.dateKey,
          inventoryType: session.inventoryType,
          inventoryData: session.inventoryData,
          timestamp: session.timestamp.toISOString(),
          effectiveness: session.effectiveness,
          ordersBySupplier: session.ordersBySupplier,
          // updated_at is omitted here
        };
        const { error } = await (supabase
          .from('inventory_sessions') as any)
          .upsert(supabaseSession, { onConflict: 'dateKey' });
        if (error) {
          console.error(`Failed to retry session ${session.dateKey}:`, error);
          dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
          showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
        } else {
          // After successful Supabase upsert, fetch the server-generated updated_at
          // and update Dexie to reflect it, marking as not pending.
          const { data: fetchedSession, error: fetchError } = await supabase
            .from('inventory_sessions')
            .select('updated_at')
            .eq('dateKey', session.dateKey)
            .single();

          if (fetchError || !fetchedSession) {
            console.error("Error fetching updated_at after retry upsert:", fetchError);
            await db.sessions.update(session.dateKey, { sync_pending: false });
          } else {
            await db.sessions.update(session.dateKey, { sync_pending: false, updated_at: fetchedSession.updated_at });
          }
          console.log(`Session ${session.dateKey} synced successfully.`); // Diagnóstico: Sesión sincronizada con éxito
          warnedItems.current.delete(`session-${session.dateKey}`);
        }
      }

      const pendingProductRules = await db.productRules.toCollection().filter(r => r.sync_pending === true).toArray();
      for (const config of pendingProductRules) {
        console.log(`Retrying product config: ${config.productName} (${config.productId})`); // Diagnóstico: Reintentando configuración de producto
        // Omit updated_at from Supabase payload to let the server manage it
        const supabaseConfig: Omit<Database['public']['Tables']['product_rules']['Insert'], 'updated_at'> = {
          productId: config.productId,
          productName: config.productName,
          rules: config.rules,
          supplier: config.supplier,
          isHidden: config.isHidden || false,
          // updated_at is omitted here
        };
        const { error } = await (supabase
          .from('product_rules') as any)
          .upsert(supabaseConfig, { onConflict: 'productId' });
        if (error) {
          console.error(`Failed to retry product config ${config.productId}:`, error);
          dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
          showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
        } else {
          // After successful Supabase upsert, fetch the server-generated updated_at
          // and update Dexie to reflect it, marking as not pending.
          const { data: fetchedConfig, error: fetchError } = await supabase
            .from('product_rules')
            .select('updated_at')
            .eq('productId', config.productId)
            .single();

          if (fetchError || !fetchedConfig) {
            console.error("Error fetching updated_at after retry upsert:", fetchError);
            await db.productRules.update(config.productId, { sync_pending: false });
          } else {
            await db.productRules.update(config.productId, { sync_pending: false, updated_at: fetchedConfig.updated_at });
          }
          console.log(`Product config ${config.productId} synced successfully.`); // Diagnóstico: Configuración de producto sincronizada con éxito
          warnedItems.current.delete(`product-${config.productId}`);
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

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' });
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true });
    console.log(`🔄 [Sync] Iniciando sincronización bidireccional.`); // Diagnóstico: Inicio de sincronización

    try {
      if (!db.isOpen()) await db.open();

      console.log("[Sync] Uploading local pending sessions..."); // Diagnóstico: Subiendo sesiones pendientes
      const pendingLocalSessions = await db.sessions.toCollection().filter(r => r.sync_pending === true).toArray();
      for (const session of pendingLocalSessions) {
        // Omit updated_at from Supabase payload to let the server manage it
        const supabaseSession: Omit<Database['public']['Tables']['inventory_sessions']['Insert'], 'updated_at'> = {
          dateKey: session.dateKey,
          inventoryType: session.inventoryType,
          inventoryData: session.inventoryData,
          timestamp: session.timestamp.toISOString(),
          effectiveness: session.effectiveness,
          ordersBySupplier: session.ordersBySupplier,
          // updated_at is omitted here
        };
        const { error } = await (supabase
          .from('inventory_sessions') as any)
          .upsert(supabaseSession, { onConflict: 'dateKey' });
        if (error) {
          console.error(`[Sync] Error uploading pending session ${session.dateKey} to Supabase:`, error);
          showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
        } else {
          // After successful Supabase upsert, fetch the server-generated updated_at
          // and update Dexie to reflect it, marking as not pending.
          const { data: fetchedSession, error: fetchError } = await supabase
            .from('inventory_sessions')
            .select('updated_at')
            .eq('dateKey', session.dateKey)
            .single();

          if (fetchError || !fetchedSession) {
            console.error("Error fetching updated_at after sync upload upsert:", fetchError);
            await db.sessions.update(session.dateKey, { sync_pending: false });
          } else {
            await db.sessions.update(session.dateKey, { sync_pending: false, updated_at: fetchedSession.updated_at });
          }
          warnedItems.current.delete(`session-${session.dateKey}`);
        }
      }
      console.log("[Sync] Uploading local pending product configs..."); // Diagnóstico: Subiendo configuraciones de producto pendientes
      const pendingLocalProductRules = await db.productRules.toCollection().filter(r => r.sync_pending === true).toArray();
      for (const config of pendingLocalProductRules) {
        // Omit updated_at from Supabase payload to let the server manage it
        const supabaseConfig: Omit<Database['public']['Tables']['product_rules']['Insert'], 'updated_at'> = {
          productId: config.productId,
          productName: config.productName,
          rules: config.rules,
          supplier: config.supplier,
          isHidden: config.isHidden || false,
          // updated_at is omitted here
        };
        const { error } = await (supabase
          .from('product_rules') as any)
          .upsert(supabaseConfig, { onConflict: 'productId' });
        if (error) {
          console.error(`[Sync] Error uploading pending product config ${config.productId} to Supabase:`, error);
          showError('Sincronización demorada. Los cambios se guardarán localmente hasta que se restablezca la conexión total.');
        } else {
          // After successful Supabase upsert, fetch the server-generated updated_at
          // and update Dexie to reflect it, marking as not pending.
          const { data: fetchedConfig, error: fetchError } = await supabase
            .from('product_rules')
            .select('updated_at')
            .eq('productId', config.productId)
            .single();

          if (fetchError || !fetchedConfig) {
            console.error("Error fetching updated_at after sync upload upsert:", fetchError);
            await db.productRules.update(config.productId, { sync_pending: false });
          } else {
            await db.productRules.update(config.productId, { sync_pending: false, updated_at: fetchedConfig.updated_at });
          }
          warnedItems.current.delete(`product-${config.productId}`);
        }
      }
      console.log('[Sync] Cambios locales subidos a la nube.'); // Diagnóstico: Cambios locales subidos

      console.log("[Sync] Downloading all sessions from Supabase..."); // Diagnóstico: Descargando sesiones
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

          // Remote wins if newer or equal, unless local is pending
          if (!localSession || (new Date(typedSession.updated_at) >= new Date(localSession.updated_at) && localSession.sync_pending === false)) {
            sessionsToPutLocally.push(typedSession);
          } else if (localSession.sync_pending === true) {
            console.log(`[Sync] Keeping local pending session ${localSession.dateKey} as it's pending.`); // Diagnóstico: Manteniendo sesión local pendiente
          } else {
            console.log(`[Sync] Keeping local session ${localSession.dateKey} as it's newer than remote.`);
          }
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
          console.log(`[Sync] Limpieza local: Eliminando sesiones que ya no existen en la nube: [${sessionsToDeleteLocally.join(', ')}]`); // Diagnóstico: Limpieza de sesiones
        }
      } else {
        const localNonPendingSessions = localSessions.filter(s => s.sync_pending === false);
        if (localNonPendingSessions.length > 0) {
          await db.sessions.bulkDelete(localNonPendingSessions.map(s => s.dateKey));
          console.log(`[Sync] Limpieza local: Eliminando todas las sesiones no pendientes ya que Supabase está vacío: [${localNonPendingSessions.map(s => s.dateKey).join(', ')}]`); // Diagnóstico: Limpieza de sesiones (Supabase vacío)
        }
      }

      console.log("[Sync] Downloading all product configs from Supabase..."); // Diagnóstico: Descargando configuraciones de producto
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
            sync_pending: false,
            updated_at: c.updated_at,
          };
          const localConfig = localProductRulesMap.get(typedConfig.productId);

          // Remote wins if newer or equal, unless local is pending
          if (!localConfig || (new Date(typedConfig.updated_at) >= new Date(localConfig.updated_at) && localConfig.sync_pending === false)) {
            productRulesToPutLocally.push(typedConfig);
          } else if (localConfig.sync_pending === true) {
            console.log(`[Sync] Keeping local pending product config ${localConfig.productId} as it's pending.`); // Diagnóstico: Manteniendo configuración local pendiente
          } else {
            console.log(`[Sync] Keeping local product config ${localConfig.productId} as it's newer than remote.`);
          }
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
          console.log(`[Sync] Limpieza local: Eliminando configuraciones de producto que ya no existen en la nube: [${productRulesToDeleteLocally.join(', ')}]`); // Diagnóstico: Limpieza de configuraciones
        }
      } else {
        const localNonPendingProductRules = localProductRules.filter(c => c.sync_pending === false);
        if (localNonPendingProductRules.length > 0) {
          await db.productRules.bulkDelete(localNonPendingProductRules.map(c => c.productId));
          console.log(`[Sync] Limpieza local: Eliminando todas las configuraciones de producto no pendientes ya que Supabase está vacío: [${localNonPendingProductRules.map(c => c.productId).join(', ')}]`); // Diagnóstico: Limpieza de configuraciones (Supabase vacío)
        }
      }
      console.log('[Sync] Configuraciones y sesiones descargadas de la nube.'); // Diagnóstico: Descarga completada

      console.log("🔄 [Sync] Sincronización bidireccional finalizada con éxito."); // Diagnóstico: Sincronización finalizada
      lastSyncTimestampRef.current = Date.now();
      await loadMasterProductConfigs();
      await getSessionHistory();
    } catch (e: any) {
      console.error(`🔄 [Sync] Error during syncToSupabase:`, e); // Diagnóstico: Error en sincronización
      dispatch({ type: 'SET_ERROR', payload: e.message });
      showError(`Error en la sincronización: ${e.message}`);
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false });
      updateSyncStatus();
    }
  }, [state.isOnline, state.isSupabaseSyncInProgress, loadMasterProductConfigs, updateSyncStatus, getSessionHistory]);

  // Nueva función para sincronización al cambiar de pestaña
  const handleVisibilityChangeSync = useCallback(async () => {
    if (document.visibilityState === 'visible' && state.isOnline) {
      console.log('[Sync] Tab became visible, performing recovery sync...'); // Diagnóstico: Pestaña visible, realizando sincronización de recuperación
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
      console.log('Sincronización ya en curso, ignorando solicitud de reinicio de configuración.'); // Diagnóstico: Sincronización en curso, ignorando reinicio
      showError('Sincronización ya en curso. Por favor, espera a que termine el proceso actual.');
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' });
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true });
    showSuccess('Reiniciando todas las configuraciones de productos...');
    console.log("Starting reset all product configurations..."); // Diagnóstico: Iniciando reinicio de configuraciones

    try {
      if (!db.isOpen()) await db.open();

      await db.productRules.clear();

      const { error: deleteError } = await supabase
        .from('product_rules')
        .delete()
        .neq('productId', 0);

      if (deleteError) throw deleteError;
      console.log("All product rules deleted from Supabase."); // Diagnóstico: Reglas de producto eliminadas de Supabase

      await processDbForMasterConfigs(buffer);
      showSuccess('Configuración de productos reiniciada y cargada desde el archivo DB.');

    } catch (e: any) {
      console.error("Error during resetAllProductConfigs:", e);
      dispatch({ type: 'SET_ERROR', payload: e.message });
      showError(`Error al reiniciar la configuración: ${e.message}`);
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
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

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true });
    showSuccess('Limpiando base de datos local...');
    console.log("Starting clear local database..."); // Diagnóstico: Iniciando limpieza de DB local

    try {
      if (db.isOpen()) {
        await db.close();
      }
      await db.delete();
      await db.open();

      dispatch({ type: 'RESET_STATE' });
      dispatch({ type: 'SET_MASTER_PRODUCT_CONFIGS', payload: [] });
      showSuccess('Base de datos local limpiada con éxito.');
      console.log("Local database cleared successfully."); // Diagnóstico: DB local limpiada
    } catch (e: any) {
      console.error("Error during clearLocalDatabase:", e);
      dispatch({ type: 'SET_ERROR', payload: e.message });
      showError(`Error al limpiar la base de datos local: ${e.message}`);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
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

  // --- Supabase Realtime Subscriptions ---
  const setupRealtime = useCallback(() => {
    // --- SYSTEM --- Este log confirma que la función setupRealtime se está ejecutando.
    console.log('--- SYSTEM: setupRealtime function is firing ---');
    // --- SYSTEM --- Este log indica el intento de montar los listeners de Realtime.
    console.log('--- SYSTEM: Intentando montar Realtime ---');

    if (!supabase) {
      console.warn("Supabase client not initialized, Realtime subscriptions skipped.");
      return;
    }

    let retryTimeout: NodeJS.Timeout | null = null;

    // Sessions Realtime Channel
    const sessionsChannel = supabase
      .channel('inventory_sessions_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_sessions' }, async (payload) => {
        // --- SYSTEM --- Este log indica que un cambio remoto fue detectado.
        // Se puede desactivar en producción si el volumen de logs es muy alto.
        console.log('[Realtime] Session change detected from another device:', payload);

        try {
          // Validar formato de dateKey
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            if (!payload.new?.dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(payload.new.dateKey)) {
              console.error('[Realtime] Invalid dateKey format:', payload.new?.dateKey);
              return;
            }

            const newRecord = payload.new as Database['public']['Tables']['inventory_sessions']['Row'];
            const typedSession: InventorySession = {
              dateKey: newRecord.dateKey,
              inventoryType: newRecord.inventoryType,
              inventoryData: newRecord.inventoryData,
              timestamp: new Date(newRecord.timestamp),
              effectiveness: newRecord.effectiveness,
              ordersBySupplier: newRecord.ordersBySupplier,
              sync_pending: false,
              updated_at: newRecord.updated_at, // This is the server's updated_at
            };

            const localSession = await db.sessions.get(typedSession.dateKey);
            // Remote wins if newer or equal, unless local is pending
            if (!localSession || (new Date(typedSession.updated_at) >= new Date(localSession.updated_at) && localSession.sync_pending === false)) {
              if (state.sessionId === typedSession.dateKey) { // Acceder a state.sessionId directamente
                dispatch({
                  type: 'UPDATE_CURRENT_SESSION_DATA',
                  payload: {
                    dateKey: typedSession.dateKey,
                    inventoryData: typedSession.inventoryData,
                    effectiveness: typedSession.effectiveness
                  }
                });
                console.log(`[Realtime] UI Updated automatically for session ${typedSession.dateKey}.`); // UX Feedback
              }

              await db.sessions.put(typedSession);
              console.log(`[Realtime] Session ${typedSession.dateKey} updated from remote.`);
              showSuccess(`Sesión del ${typedSession.dateKey} actualizada remotamente.`);
              await getSessionHistory();
            } else if (localSession.sync_pending === true) {
              console.log(`[Realtime] Keeping local pending session ${typedSession.dateKey} as it's pending.`);
            } else {
              console.log(`[Realtime] Keeping local session ${typedSession.dateKey} as it's newer than remote.`);
            }
          } else if (payload.eventType === 'DELETE') {
            const dateKey = payload.old?.dateKey;
            if (!dateKey) {
              // --- SYSTEM --- Este error es CRÍTICO si REPLICA IDENTITY FULL no está configurado en Supabase.
              console.error('[Realtime] DELETE event without dateKey. Ensure REPLICA IDENTITY FULL is set on the table.');
              return;
            }

            await db.sessions.delete(dateKey);
            console.log(`[Realtime] Session ${dateKey} deleted from remote.`);
            showSuccess(`Sesión del ${dateKey} eliminada remotamente.`);

            if (state.sessionId === dateKey) { // Acceder a state.sessionId directamente
              dispatch({ type: 'RESET_STATE' });
              dispatch({ type: 'SET_SESSION_ID', payload: null });
              console.log(`[Realtime] UI Reset automatically for deleted session ${dateKey}.`); // UX Feedback
            }
            await getSessionHistory();
          }
          updateSyncStatus();
        } catch (e) {
          console.error('[Realtime] Error processing session change:', e);
          showError('Error al procesar actualización de sesión remota.');
        }
      })
      .subscribe((status: 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR') => {
        console.log(`[Realtime] Sessions channel status: ${status}`);
        dispatch({ type: 'SET_REALTIME_STATUS', payload: status });

        if (status === 'CHANNEL_ERROR') {
          console.warn('[Realtime] Sessions channel error, retrying in 5s...');
          retryTimeout = setTimeout(setupRealtime, 5000);
        }
      });

    // Product Rules Realtime Channel
    const productRulesChannel = supabase
      .channel('product_rules_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_rules' }, async (payload) => {
        // --- SYSTEM --- Este log indica que un cambio remoto fue detectado.
        // Se puede desactivar en producción si el volumen de logs es muy alto.
        console.log('[Realtime] Product rule change detected from another device:', payload);

        try {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newRecord = payload.new as Database['public']['Tables']['product_rules']['Row'];
            const typedConfig: MasterProductConfig = {
              productId: newRecord.productId,
              productName: newRecord.productName,
              rules: newRecord.rules,
              supplier: newRecord.supplier,
              isHidden: newRecord.isHidden || false,
              sync_pending: false,
              updated_at: newRecord.updated_at, // This is the server's updated_at
            };

            const localConfig = await db.productRules.get(typedConfig.productId);
            // Remote wins if newer or equal, unless local is pending
            if (!localConfig || (new Date(typedConfig.updated_at) >= new Date(localConfig.updated_at) && localConfig.sync_pending === false)) {
              dispatch({ type: 'UPDATE_SINGLE_PRODUCT_RULE', payload: typedConfig });
              await db.productRules.put(typedConfig);
              console.log(`[Realtime] Product config ${typedConfig.productName} updated from remote.`);
              showSuccess(`Configuración de producto ${typedConfig.productName} actualizada remotamente.`);
              console.log(`[Realtime] UI Updated automatically for product config ${typedConfig.productName}.`); // UX Feedback
            } else if (localConfig.sync_pending === true) {
              console.log(`[Realtime] Keeping local pending product config ${typedConfig.productId} as it's pending.`);
            } else {
              console.log(`[Realtime] Keeping local product config ${typedConfig.productId} as it's newer than remote.`);
            }
          } else if (payload.eventType === 'DELETE') {
            const productId = payload.old?.productId;
            if (!productId) {
              // --- SYSTEM --- Este error es CRÍTICO si REPLICA IDENTITY FULL no está configurado en Supabase.
              console.error('[Realtime] DELETE event without productId. Ensure REPLICA IDENTITY FULL is set on the table.');
              return;
            }

            await db.productRules.delete(productId);
            console.log(`[Realtime] Product config ${productId} deleted from remote.`);
            showSuccess(`Configuración de producto ${productId} eliminada remotamente.`);

            dispatch({
              type: 'UPDATE_SINGLE_PRODUCT_RULE',
              payload: { productId: productId, isHidden: true } as MasterProductConfig
            });
            console.log(`[Realtime] UI Updated automatically for deleted product config ${productId}.`); // UX Feedback
          }
          updateSyncStatus();
        } catch (e) {
          console.error('[Realtime] Error processing product rule change:', e);
          showError('Error al procesar actualización de configuración de producto remota.');
        }
      })
      .subscribe((status: 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR') => {
        console.log(`[Realtime] Product rules channel status: ${status}`);
        dispatch({ type: 'SET_REALTIME_STATUS', payload: status });

        if (status === 'CHANNEL_ERROR') {
          console.warn('[Realtime] Product rules channel error, retrying in 5s...');
          retryTimeout = setTimeout(setupRealtime, 5000);
        }
      });

    return () => {
      // --- SYSTEM --- Este log indica que los listeners de Realtime se están limpiando.
      console.log('[Realtime] Cleaning up listeners...');
      if (retryTimeout) clearTimeout(retryTimeout);
      sessionsChannel?.unsubscribe();
      productRulesChannel?.unsubscribe();
    };
  }, [supabase, dispatch, db, getSessionHistory, updateSyncStatus, state.sessionId, showSuccess, showError]); // state.sessionId is a dependency because it's used inside the callback, but it doesn't cause re-subscription of the channel itself.

  useEffect(() => {
    // --- SYSTEM --- Este log confirma que el useEffect de Realtime se está ejecutando.
    console.log('--- SYSTEM: Realtime useEffect is firing ---');
    // --- SYSTEM --- Este log indica el intento de montar los listeners de Realtime.
    console.log('--- SYSTEM: Intentando montar Realtime ---');

    // La función setupRealtime ahora es un useCallback estable
    const cleanupRealtime = setupRealtime();

    return () => {
      // --- SYSTEM --- Este log indica que el cleanup del useEffect de Realtime se está ejecutando.
      console.log('--- SYSTEM: Realtime useEffect cleanup is firing ---');
      cleanupRealtime();
    };
  }, [supabase, setupRealtime]); // Dependencias estables para que el useEffect se ejecute solo una vez al montar

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && state.isOnline) {
        console.log('[Realtime] App became visible, performing recovery sync...'); // Diagnóstico: App visible, realizando sincronización de recuperación
        // No necesitamos re-suscribir aquí, solo forzar una sincronización si Realtime no está activo
        if (state.realtimeStatus !== 'SUBSCRIBED') {
          handleVisibilityChangeSync();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [state.isOnline, state.realtimeStatus, handleVisibilityChangeSync]);

  useEffect(() => {
    if (state.dbBuffer && state.inventoryType && !state.sessionId) {
      processInventoryData(state.dbBuffer, state.inventoryType);
    }
  }, [state.dbBuffer, state.inventoryType, state.sessionId, processInventoryData]);

  useEffect(() => {
    loadMasterProductConfigs();
  }, [loadMasterProductConfigs]);

  useEffect(() => {
    updateSyncStatus();
  }, [updateSyncStatus]);

  // --- NEW: Debounced Save for Current Session ---
  // Inicializar la función debounced una vez
  useEffect(() => {
    debouncedSaveCurrentSessionRef.current = debounce(async (data: InventoryItem[]) => {
      if (state.sessionId && state.inventoryType) {
        console.log('[Debounced Save] Executing debounced save for current session.');
        await saveCurrentSession(data, state.inventoryType, new Date());
      }
    }, 1000); // Guardar 1 segundo después de la última edición

    // Cleanup para el debounce
    return () => {
      debouncedSaveCurrentSessionRef.current?.cancel();
    };
  }, [state.sessionId, state.inventoryType, saveCurrentSession]);

  // Función para actualizar el estado y disparar el guardado debounced
  const updateAndDebounceSaveInventoryItem = useCallback((index: number, key: keyof InventoryItem, value: number | boolean) => {
    setSyncStatus('pending'); // Establecer estado de sincronización a 'pending' inmediatamente
    dispatch(prevState => {
      const updatedData = [...prevState.rawInventoryItemsFromDb];
      if (key === "physicalQuantity") {
        updatedData[index][key] = Math.max(0, value as number);
        updatedData[index].hasBeenEdited = true;
      } else if (key === "averageSales") {
        updatedData[index][key] = value as number;
      } else if (key === "hasBeenEdited") {
        updatedData[index][key] = value as boolean;
      }

      // Disparar el guardado debounced con los datos actualizados
      if (debouncedSaveCurrentSessionRef.current && prevState.sessionId && prevState.inventoryType) {
        debouncedSaveCurrentSessionRef.current(updatedData);
      }

      return { ...prevState, rawInventoryItemsFromDb: updatedData };
    });
  }, [setSyncStatus]);

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