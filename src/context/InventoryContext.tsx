/**
 * @file src/context/InventoryContext.tsx
 * @description Contexto global optimizado para alto rendimiento con listas grandes.
 * @version v1.6.1
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
  isHidden?: boolean;
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
  currentSessionOrders: { [supplier: string]: OrderItem[] } | null;
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
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isSupabaseSyncInProgress: false,
  currentSessionOrders: null,
};

type InventoryAction =
  | { type: 'SET_DB_BUFFER'; payload: Uint8Array | null }
  | { type: 'SET_INVENTORY_TYPE'; payload: "weekly" | "monthly" | null }
  | { type: 'SET_RAW_INVENTORY_ITEMS_FROM_DB'; payload: InventoryItem[] }
  | { type: 'UPDATE_INVENTORY_ITEM'; payload: { productId: number, updates: Partial<InventoryItem> } }
  | { type: 'SET_MASTER_PRODUCT_CONFIGS'; payload: MasterProductConfig[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_SESSION_ID'; payload: string | null }
  | { type: 'SET_SYNC_STATUS'; payload: SyncStatus }
  | { type: 'SET_IS_ONLINE'; payload: boolean }
  | { type: 'SET_SUPABASE_SYNC_IN_PROGRESS'; payload: boolean }
  | { type: 'SET_CURRENT_SESSION_ORDERS'; payload: { [supplier: string]: OrderItem[] } | null }
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
    case 'UPDATE_INVENTORY_ITEM':
      return {
        ...state,
        rawInventoryItemsFromDb: state.rawInventoryItemsFromDb.map(item =>
          item.productId === action.payload.productId
            ? { ...item, ...action.payload.updates }
            : item
        )
      };
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
    case 'SET_CURRENT_SESSION_ORDERS':
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
          currentSessionOrders: null,
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
  saveCurrentSession: (data: InventoryItem[], type: "weekly" | "monthly", timestamp: Date, orders?: { [supplier: string]: OrderItem[] }, forcedSessionId?: string) => Promise<void>;
  loadSession: (dateKey: string) => Promise<void>;
  deleteSession: (dateKey: string) => Promise<void>;
  getSessionHistory: () => Promise<InventorySession[]>;
  resetInventoryState: () => void;
  syncToSupabase: () => Promise<void>;
  saveMasterProductConfig: (config: MasterProductConfig) => Promise<void>;
  deleteMasterProductConfig: (productId: number) => Promise<void>;
  loadMasterProductConfigs: (includeHidden?: boolean) => Promise<MasterProductConfig[]>;
  handleVisibilityChangeSync: () => Promise<void>;
  resetAllProductConfigs: (buffer: Uint8Array) => Promise<void>;
  clearLocalDatabase: () => Promise<void>;
  updateAndDebounceSaveInventoryItem: (productId: number, updates: Partial<InventoryItem>) => void;
  flushPendingSessionSave: () => void;
  fetchInitialData: () => Promise<void>;
  updateSyncStatus: () => Promise<void>;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

const calculateEffectiveness = (data: InventoryItem[]): number => {
  if (data.length === 0) return 0;
  const matches = data.filter(item => item.systemQuantity === item.physicalQuantity).length;
  return (matches / data.length) * 100;
};

export const InventoryProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, dispatch] = useReducer(inventoryReducer, initialState);
  const warnedItems = useRef(new Set<string>());
  const initialFetchDoneRef = useRef(false);

  const debouncedSaveCurrentSessionRef = useRef<((data: InventoryItem[], forcedSessionId?: string) => void) & { flush: () => void; cancel: () => void } | null>(null);

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
      console.error("Error checking sync status:", e);
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
    }
  }, [state.isOnline]);

  const filteredInventoryData = useMemo(() => {
    if (!state.rawInventoryItemsFromDb || state.rawInventoryItemsFromDb.length === 0) return [];
    const masterConfigsMap = new Map<number, MasterProductConfig>(state.masterProductConfigs.map(config => [config.productId, config]));
    return state.rawInventoryItemsFromDb.filter(item => {
      const masterConfig = masterConfigsMap.get(item.productId);
      if (!masterConfig || masterConfig.isHidden) return false;
      const productInventoryType = masterConfig.inventory_type || 'monthly';
      if (productInventoryType === 'ignored') return false;
      if (state.inventoryType === 'weekly' && productInventoryType !== 'weekly') return false;
      if (item.supplier === "KYR S.A.S" || item.supplier === "Desconocido") return false;
      return true;
    }).map(item => {
      const masterConfig = masterConfigsMap.get(item.productId)!;
      return {
        ...item,
        rules: masterConfig.rules,
        supplier: masterConfig.supplier,
        isHidden: masterConfig.isHidden,
      };
    });
  }, [state.rawInventoryItemsFromDb, state.masterProductConfigs, state.inventoryType]);

  const saveCurrentSession = useCallback(async (
    data: InventoryItem[],
    type: "weekly" | "monthly",
    initialTimestamp: Date,
    orders?: { [supplier: string]: OrderItem[] },
    forcedSessionId?: string
  ) => {
    if (!data || data.length === 0) return;
    const dateKey = forcedSessionId || state.sessionId || format(initialTimestamp, 'yyyy-MM-dd');
    const effectiveness = calculateEffectiveness(data);
    const nowIso = new Date().toISOString();
    try {
      if (!db.isOpen()) await db.open();
      const existingSession = await db.sessions.get(dateKey);
      const sessionTimestamp = existingSession ? existingSession.timestamp : initialTimestamp;
      const ordersToSave = orders !== undefined ? orders : existingSession?.ordersBySupplier;
      const sessionToSave: InventorySession = {
        dateKey,
        inventoryType: type,
        inventoryData: data,
        timestamp: sessionTimestamp,
        effectiveness,
        ordersBySupplier: ordersToSave,
        sync_pending: true,
        updated_at: nowIso,
      };
      await db.sessions.put(sessionToSave);
      dispatch({ type: 'SET_SESSION_ID', payload: dateKey });
      dispatch({ type: 'SET_CURRENT_SESSION_ORDERS', payload: ordersToSave || null });
      if (supabase && state.isOnline) {
        const supabaseSession: any = {
          dateKey: sessionToSave.dateKey,
          inventoryType: sessionToSave.inventoryType,
          inventoryData: sessionToSave.inventoryData,
          timestamp: sessionToSave.timestamp,
          effectiveness: sessionToSave.effectiveness,
          ordersBySupplier: sessionToSave.ordersBySupplier,
        };
        const { data: fetchedData, error } = await (supabase.from('inventory_sessions') as any)
          .upsert(supabaseSession, { onConflict: 'dateKey' })
          .select('dateKey, updated_at')
          .single();
        if (error) {
          console.error("Error saving to Supabase:", error);
        } else if (fetchedData) {
          await db.sessions.update(dateKey, { sync_pending: false, updated_at: fetchedData.updated_at });
          warnedItems.current.delete(`session-${dateKey}`);
        }
      }
    } catch (e) {
      console.error("Error saving session:", e);
      throw e;
    } finally {
      updateSyncStatus();
    }
  }, [state.sessionId, state.isOnline, updateSyncStatus]);

  const loadSession = useCallback(async (dateKey: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      if (!db.isOpen()) await db.open();
      const session = await db.sessions.get(dateKey);
      if (session) {
        dispatch({ type: 'SET_INVENTORY_TYPE', payload: session.inventoryType });
        dispatch({ type: 'SET_RAW_INVENTORY_ITEMS_FROM_DB', payload: session.inventoryData });
        dispatch({ type: 'SET_SESSION_ID', payload: dateKey });
        dispatch({ type: 'SET_CURRENT_SESSION_ORDERS', payload: session.ordersBySupplier || null });
        showSuccess(`Sesión del ${dateKey} cargada.`);
      }
    } catch (e) {
      console.error("Error loading session:", e);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const deleteSession = useCallback(async (dateKey: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true });
    try {
      if (!db.isOpen()) await db.open();
      await db.sessions.delete(dateKey);
      if (supabase && state.isOnline) {
        await (supabase.from('inventory_sessions') as any).delete().eq('dateKey', dateKey);
      }
      showSuccess(`Sesión del ${dateKey} eliminada.`);
      if (state.sessionId === dateKey) {
        dispatch({ type: 'RESET_STATE' });
      }
    } catch (e) {
      console.error("Error deleting session:", e);
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
      return [];
    }
  }, []);

  const loadMasterProductConfigs = useCallback(async (includeHidden: boolean = false): Promise<MasterProductConfig[]> => {
    try {
      if (!db.isOpen()) await db.open();
      const allConfigs = await db.productRules.toArray();
      const filteredConfigs = includeHidden ? allConfigs : allConfigs.filter(config => !config.isHidden);
      dispatch({ type: 'SET_MASTER_PRODUCT_CONFIGS', payload: filteredConfigs });
      return filteredConfigs;
    } catch (e) {
      return [];
    } finally {
      updateSyncStatus();
    }
  }, [updateSyncStatus]);

  const saveMasterProductConfig = useCallback(async (config: MasterProductConfig) => {
    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true });
    try {
      if (!db.isOpen()) await db.open();
      const nowIso = new Date().toISOString();
      const configToSave = { ...config, productId: Number(config.productId), sync_pending: true, updated_at: nowIso };
      await db.productRules.put(configToSave);
      if (supabase && state.isOnline) {
        const supabaseConfig: any = {
          productId: configToSave.productId,
          productName: configToSave.productName,
          rules: configToSave.rules,
          supplier: configToSave.supplier,
          isHidden: configToSave.isHidden || false,
          inventory_type: configToSave.inventory_type || 'monthly',
        };
        const { data, error } = await (supabase.from('product_rules') as any)
          .upsert(supabaseConfig, { onConflict: 'productId' })
          .select('productId, updated_at')
          .single();
        if (data) {
          await db.productRules.update(configToSave.productId, { sync_pending: false, updated_at: data.updated_at });
        }
      }
      await loadMasterProductConfigs();
    } catch (e) {
      console.error("Error saving config:", e);
    } finally {
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false });
      updateSyncStatus();
    }
  }, [state.isOnline, updateSyncStatus, loadMasterProductConfigs]);

  const deleteMasterProductConfig = useCallback(async (productId: number) => {
    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true });
    try {
      if (!db.isOpen()) await db.open();
      const currentConfig = await db.productRules.get(productId);
      if (currentConfig) {
        const newIsHidden = !currentConfig.isHidden;
        const nowIso = new Date().toISOString();
        await db.productRules.update(productId, { isHidden: newIsHidden, sync_pending: true, updated_at: nowIso });
        if (supabase && state.isOnline) {
          await (supabase.from('product_rules') as any).update({ isHidden: newIsHidden }).eq('productId', productId);
        }
        await loadMasterProductConfigs();
      }
    } catch (e) {
      console.error("Error toggling config:", e);
    } finally {
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false });
      updateSyncStatus();
    }
  }, [state.isOnline, updateSyncStatus, loadMasterProductConfigs]);

  const processInventoryData = useCallback(async (buffer: Uint8Array, type: "weekly" | "monthly") => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      await initDb();
      const dbInstance = loadDb(buffer);
      const rawInventoryItems: InventoryItemFromDB[] = queryData(dbInstance, ALL_PRODUCTS_QUERY);
      dbInstance.close();
      if (!db.isOpen()) await db.open();
      const allMasterProductConfigs = await db.productRules.toArray();
      const masterProductConfigsMap = new Map<number, MasterProductConfig>(allMasterProductConfigs.map(config => [config.productId, config]));
      const nowIso = new Date().toISOString();
      const finalProcessedInventory = rawInventoryItems.map(dbItem => {
        const currentProductId = Number(dbItem.ProductId);
        const masterConfig = masterProductConfigsMap.get(currentProductId);
        return {
          productId: currentProductId,
          productName: dbItem.Producto,
          category: dbItem.Categoria,
          systemQuantity: dbItem.Stock_Actual,
          physicalQuantity: dbItem.Stock_Actual,
          averageSales: 0,
          supplier: masterConfig?.supplier || dbItem.SupplierName,
          hasBeenEdited: false,
          rules: masterConfig?.rules || [],
          isHidden: masterConfig?.isHidden || false,
        };
      }).filter(item => !item.isHidden && item.supplier !== "KYR S.A.S" && item.supplier !== "Desconocido");
      dispatch({ type: 'SET_RAW_INVENTORY_ITEMS_FROM_DB', payload: finalProcessedInventory });
      dispatch({ type: 'SET_INVENTORY_TYPE', payload: type });
      const dateKey = format(new Date(), 'yyyy-MM-dd');
      await saveCurrentSession(finalProcessedInventory, type, new Date(), undefined, dateKey);
    } catch (e) {
      console.error("Error processing DB:", e);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [saveCurrentSession]);

  const processDbForMasterConfigs = useCallback(async (buffer: Uint8Array) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      await initDb();
      const dbInstance = loadDb(buffer);
      const rawInventoryItems: InventoryItemFromDB[] = queryData(dbInstance, ALL_PRODUCTS_QUERY);
      dbInstance.close();
      if (!db.isOpen()) await db.open();
      const existingMasterProductConfigs = await db.productRules.toArray();
      const masterProductConfigsMap = new Map<number, MasterProductConfig>(existingMasterProductConfigs.map(config => [config.productId, config]));
      const nowIso = new Date().toISOString();
      const configsToUpdate: MasterProductConfig[] = rawInventoryItems.map(dbItem => {
        const currentProductId = Number(dbItem.ProductId);
        const existing = masterProductConfigsMap.get(currentProductId);
        return {
          productId: currentProductId,
          productName: dbItem.Producto,
          rules: existing?.rules || [],
          supplier: existing?.supplier || dbItem.SupplierName,
          isHidden: existing?.isHidden || false,
          inventory_type: existing?.inventory_type || 'monthly',
          sync_pending: true,
          updated_at: nowIso,
        };
      });
      await db.productRules.bulkPut(configsToUpdate);
      await loadMasterProductConfigs();
    } catch (e) {
      console.error("Error processing master configs:", e);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [loadMasterProductConfigs]);

  const syncToSupabase = useCallback(async () => {
    if (!supabase || !state.isOnline) return;
    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true });
    try {
      if (!db.isOpen()) await db.open();
      const { data: supabaseSessions } = await supabase.from('inventory_sessions').select('*');
      if (supabaseSessions) {
        const sessionsToPut = (supabaseSessions as any[]).map(s => ({ ...s, timestamp: new Date(s.timestamp), sync_pending: false }));
        await db.sessions.bulkPut(sessionsToPut);
      }
      const { data: supabaseProductRules } = await supabase.from('product_rules').select('*');
      if (supabaseProductRules) {
        const rulesToPut = (supabaseProductRules as any[]).map(r => ({ ...r, sync_pending: false }));
        await db.productRules.bulkPut(rulesToPut);
      }
      await loadMasterProductConfigs();
    } catch (e) {
      console.error("Sync error:", e);
    } finally {
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false });
      updateSyncStatus();
    }
  }, [state.isOnline, loadMasterProductConfigs, updateSyncStatus]);

  const handleVisibilityChangeSync = useCallback(async () => {
    if (document.visibilityState === 'visible' && state.isOnline) {
      await syncToSupabase();
    }
  }, [state.isOnline, syncToSupabase]);

  const clearLocalDatabase = useCallback(async () => {
    try {
      await db.delete();
      await db.open();
      dispatch({ type: 'RESET_STATE' });
      showSuccess('Base de datos local limpiada.');
    } catch (e) {
      console.error("Clear error:", e);
    }
  }, []);

  const fetchInitialData = useCallback(async () => {
    if (!supabase || !state.isOnline) return;
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      await syncToSupabase();
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.isOnline, syncToSupabase]);

  useEffect(() => {
    if (!initialFetchDoneRef.current) {
      fetchInitialData();
      initialFetchDoneRef.current = true;
    }
  }, [fetchInitialData]);

  useEffect(() => {
    debouncedSaveCurrentSessionRef.current = debounce(async (data: InventoryItem[], forcedSessionId?: string) => {
      if (state.sessionId && state.inventoryType) {
        await saveCurrentSession(data, state.inventoryType, new Date(), state.currentSessionOrders || undefined, forcedSessionId);
      }
    }, 2000);
    return () => {
      debouncedSaveCurrentSessionRef.current?.cancel();
    };
  }, [state.sessionId, state.inventoryType, saveCurrentSession, state.currentSessionOrders]);

  const updateAndDebounceSaveInventoryItem = useCallback((productId: number, updates: Partial<InventoryItem>) => {
    setSyncStatus('pending');
    dispatch({ type: 'UPDATE_INVENTORY_ITEM', payload: { productId, updates } });
  }, [setSyncStatus]);

  useEffect(() => {
    if (state.rawInventoryItemsFromDb.length > 0 && state.sessionId && debouncedSaveCurrentSessionRef.current) {
      debouncedSaveCurrentSessionRef.current(state.rawInventoryItemsFromDb, state.sessionId);
    }
  }, [state.rawInventoryItemsFromDb, state.sessionId]);

  const flushPendingSessionSave = useCallback(() => {
    debouncedSaveCurrentSessionRef.current?.flush();
  }, []);

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
    resetAllProductConfigs: async () => {},
    clearLocalDatabase,
    updateAndDebounceSaveInventoryItem,
    flushPendingSessionSave,
    fetchInitialData,
    updateSyncStatus,
  }), [state, filteredInventoryData, setDbBuffer, setInventoryType, setRawInventoryItemsFromDb, setMasterProductConfigs, setSyncStatus, processInventoryData, processDbForMasterConfigs, saveCurrentSession, loadSession, deleteSession, getSessionHistory, resetInventoryState, syncToSupabase, saveMasterProductConfig, deleteMasterProductConfig, loadMasterProductConfigs, handleVisibilityChangeSync, clearLocalDatabase, updateAndDebounceSaveInventoryItem, flushPendingSessionSave, fetchInitialData, updateSyncStatus]);

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
};

export const useInventoryContext = () => {
  const context = useContext(InventoryContext);
  if (context === undefined) throw new Error("useInventoryContext must be used within an InventoryProvider");
  return context;
};

const ALL_PRODUCTS_QUERY = `
  SELECT P.Id AS ProductId, PG.Name AS Categoria, P.Name AS Producto, S.Quantity AS Stock_Actual,
  COALESCE((SELECT C_sub.Name FROM DocumentItem DI_sub JOIN Document D_sub ON D_sub.Id = DI_sub.DocumentId JOIN DocumentType DT_sub ON DT_sub.Id = D_sub.DocumentTypeId JOIN Customer C_sub ON C_sub.Id = D_sub.CustomerId WHERE DI_sub.ProductId = P.Id AND DT_sub.Code = '100' AND C_sub.IsSupplier = 1 AND C_sub.IsEnabled = 1 ORDER BY D_sub.Date DESC LIMIT 1), 'Desconocido') AS SupplierName
  FROM Stock S JOIN Product P ON P.Id = S.ProductId JOIN ProductGroup PG ON PG.Id = P.ProductGroupId WHERE P.IsEnabled = 1 ORDER BY PG.Name ASC, P.Name ASC;
`;