/**
 * @file src/context/InventoryContext.tsx
 * @description Contexto global con rastreo de cambios pendientes (dirty state).
 * @version v1.8.5
 */

import React, { createContext, useReducer, useContext, useCallback, useEffect, useMemo, useRef } from "react";
import { initDb, loadDb, queryData } from "@/lib/db";
import { db, InventorySession, MasterProductConfig, ProductRule, SupplierConfig } from "@/lib/persistence";
import { format } from "date-fns";
import { showSuccess, showError } from "@/utils/toast";
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

// SQL Queries
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
  hasUnsavedChanges: boolean;
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
  currentSessionOrders: null,
  hasUnsavedChanges: false,
};

type InventoryAction =
  | { type: 'SET_DB_BUFFER'; payload: Uint8Array | null }
  | { type: 'SET_INVENTORY_TYPE'; payload: "weekly" | "monthly" | null }
  | { type: 'SET_RAW_INVENTORY_ITEMS_FROM_DB'; payload: InventoryItem[] }
  | { type: 'UPDATE_SINGLE_ITEM'; payload: { index: number, key: keyof InventoryItem, value: any } }
  | { type: 'SET_MASTER_PRODUCT_CONFIGS'; payload: MasterProductConfig[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_SESSION_ID'; payload: string | null }
  | { type: 'SET_SYNC_STATUS'; payload: SyncStatus }
  | { type: 'SET_IS_ONLINE'; payload: boolean }
  | { type: 'SET_SUPABASE_SYNC_IN_PROGRESS'; payload: boolean }
  | { type: 'SET_CURRENT_SESSION_ORDERS'; payload: { [supplier: string]: OrderItem[] } | null }
  | { type: 'SET_HAS_UNSAVED_CHANGES'; payload: boolean }
  | { type: 'RESET_STATE' };

const inventoryReducer = (state: InventoryState, action: InventoryAction): InventoryState => {
  switch (action.type) {
    case 'SET_DB_BUFFER':
      return { ...state, dbBuffer: action.payload, error: null };
    case 'SET_INVENTORY_TYPE':
      return { ...state, inventoryType: action.payload, error: null };
    case 'SET_RAW_INVENTORY_ITEMS_FROM_DB':
      return { ...state, rawInventoryItemsFromDb: action.payload, error: null };
    
    case 'UPDATE_SINGLE_ITEM': {
      const { index, key, value } = action.payload;
      const currentItems = state.rawInventoryItemsFromDb;
      
      if (!currentItems[index]) return state;

      const updatedItem = { 
        ...currentItems[index], 
        [key]: value,
        ...(key === 'physicalQuantity' ? { hasBeenEdited: true } : {})
      };

      const newItems = [...currentItems];
      newItems[index] = updatedItem;

      return { 
        ...state, 
        rawInventoryItemsFromDb: newItems,
        hasUnsavedChanges: true
      };
    }

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
    case 'SET_HAS_UNSAVED_CHANGES':
      return { ...state, hasUnsavedChanges: action.payload };
    case 'RESET_STATE':
      return {
        ...initialState,
        dbBuffer: state.dbBuffer,
        masterProductConfigs: state.masterProductConfigs,
        isOnline: state.isOnline,
        isSupabaseSyncInProgress: false,
        currentSessionOrders: null,
        hasUnsavedChanges: false,
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
  setHasUnsavedChanges: (value: boolean) => void;
  processInventoryData: (buffer: Uint8Array, type: "weekly" | "monthly") => Promise<void>;
  processDbForMasterConfigs: (buffer: Uint8Array) => Promise<void>;
  saveCurrentSession: (data: InventoryItem[], type: "weekly" | "monthly", timestamp: Date, orders?: { [supplier: string]: OrderItem[] }, forcedSessionId?: string) => Promise<void>;
  loadSession: (dateKey: string) => Promise<void>;
  deleteSession: (dateKey: string) => Promise<void>;
  getSessionHistory: () => Promise<InventorySession[]>;
  resetInventoryState: () => void;
  syncToSupabase: () => Promise<void>;
  forceDownloadConfigFromSupabase: () => Promise<void>;
  saveMasterProductConfig: (config: MasterProductConfig) => Promise<void>;
  saveAllMasterProductConfigs: (configs: MasterProductConfig[]) => Promise<void>;
  deleteMasterProductConfig: (productId: number) => Promise<void>;
  loadMasterProductConfigs: (includeHidden?: boolean) => Promise<MasterProductConfig[]>;
  handleVisibilityChangeSync: () => Promise<void>;
  resetAllProductConfigs: (buffer: Uint8Array) => Promise<void>;
  clearLocalDatabase: () => Promise<void>;
  updateInventoryItemLocal: (index: number, key: keyof InventoryItem, value: number | boolean) => void;
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

  const setHasUnsavedChanges = useCallback((value: boolean) => {
    dispatch({ type: 'SET_HAS_UNSAVED_CHANGES', payload: value });
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
      console.error("Error checking sync status:", e);
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
    }
  }, [state.isOnline]);

  // --- DERIVED STATE: filteredInventoryData ---
  const filteredInventoryData = useMemo(() => {
    if (!state.rawInventoryItemsFromDb || state.rawInventoryItemsFromDb.length === 0) return [];
    const masterConfigsMap = new Map(state.masterProductConfigs.map(config => [config.productId, config]));
    
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

  // --- Core Persistence Functions (Sessions) ---
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
      dispatch({ type: 'SET_HAS_UNSAVED_CHANGES', payload: false });

      if (supabase && state.isOnline) {
        const supabaseSession = {
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

        if (error) throw error;
        
        if (fetchedData) {
          await db.sessions.update(dateKey, { sync_pending: false, updated_at: fetchedData.updated_at });
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
        dispatch({ type: 'SET_HAS_UNSAVED_CHANGES', payload: false });
        showSuccess(`Sesión del ${dateKey} cargada.`);
      }
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const deleteSession = useCallback(async (dateKey: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      if (!db.isOpen()) await db.open();
      await db.sessions.delete(dateKey);
      if (supabase && state.isOnline) {
        await (supabase.from('inventory_sessions') as any).delete().eq('dateKey', dateKey);
      }
      if (state.sessionId === dateKey) resetInventoryState();
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
      updateSyncStatus();
    }
  }, [state.sessionId, state.isOnline, updateSyncStatus, resetInventoryState]);

  const getSessionHistory = useCallback(async (): Promise<InventorySession[]> => {
    if (!db.isOpen()) await db.open();
    return await db.sessions.orderBy('timestamp').reverse().toArray();
  }, []);

  const loadMasterProductConfigs = useCallback(async (includeHidden: boolean = false): Promise<MasterProductConfig[]> => {
    if (!db.isOpen()) await db.open();
    const allConfigs = await db.productRules.toArray();
    const filteredConfigs = includeHidden ? allConfigs : allConfigs.filter(config => !config.isHidden);
    dispatch({ type: 'SET_MASTER_PRODUCT_CONFIGS', payload: filteredConfigs });
    updateSyncStatus();
    return filteredConfigs;
  }, [updateSyncStatus]);

  const saveMasterProductConfig = useCallback(async (config: MasterProductConfig) => {
    if (!db.isOpen()) await db.open();
    const nowIso = new Date().toISOString();
    const configToSave = { ...config, productId: Number(config.productId), sync_pending: true, updated_at: nowIso };
    
    await db.productRules.put(configToSave);
    
    if (supabase && state.isOnline) {
      // Mapear a los nombres exactos de las columnas de Supabase
      const supabasePayload = {
        product_id: configToSave.productId,
        product_name: configToSave.productName,
        supplier_name: configToSave.supplier,
        rules: configToSave.rules,
        isHidden: configToSave.isHidden,
        inventory_type: configToSave.inventory_type
      };

      const { data: fetchedData, error } = await (supabase.from('product_rules') as any)
        .upsert(supabasePayload, { onConflict: 'product_id' })
        .select('product_id, updated_at')
        .single();
      
      if (error) throw error;
      if (fetchedData) await db.productRules.update(config.productId, { sync_pending: false, updated_at: fetchedData.updated_at });
    }
    await loadMasterProductConfigs();
  }, [state.isOnline, loadMasterProductConfigs]);

  const saveAllMasterProductConfigs = useCallback(async (configs: MasterProductConfig[]) => {
    if (!db.isOpen()) await db.open();
    
    const nowIso = new Date().toISOString();
    const configsToSave = configs.map(c => ({
      ...c,
      productId: Number(c.productId),
      sync_pending: true,
      updated_at: nowIso
    }));

    await db.productRules.bulkPut(configsToSave);

    if (supabase && state.isOnline) {
      // Mapear a los nombres exactos de las columnas de Supabase
      const supabasePayloads = configsToSave.map(c => ({
        product_id: c.productId,
        product_name: c.productName,
        supplier_name: c.supplier,
        rules: c.rules,
        isHidden: c.isHidden,
        inventory_type: c.inventory_type
      }));

      const { error } = await (supabase.from('product_rules') as any)
        .upsert(supabasePayloads, { 
          onConflict: 'product_id'
        });
      
      if (error) throw error;
      
      await db.productRules.bulkUpdate(configsToSave.map(c => ({
        key: c.productId,
        changes: { sync_pending: false }
      })));
    }
    await loadMasterProductConfigs();
  }, [state.isOnline, loadMasterProductConfigs]);

  const deleteMasterProductConfig = useCallback(async (productId: number) => {
    if (!db.isOpen()) await db.open();
    const currentConfig = await db.productRules.get(productId);
    if (!currentConfig) return;
    const newIsHidden = !currentConfig.isHidden;
    await db.productRules.update(productId, { isHidden: newIsHidden, sync_pending: true, updated_at: new Date().toISOString() });
    if (supabase && state.isOnline) {
      const { error } = await (supabase.from('product_rules') as any).update({ isHidden: newIsHidden }).eq('product_id', productId);
      if (error) throw error;
    }
    await loadMasterProductConfigs();
  }, [state.isOnline, loadMasterProductConfigs]);

  // --- DB Processing Functions ---
  const processInventoryData = useCallback(async (buffer: Uint8Array, type: "weekly" | "monthly") => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      await initDb();
      const dbInstance = loadDb(buffer);
      const rawInventoryItems: InventoryItemFromDB[] = queryData(dbInstance, ALL_PRODUCTS_QUERY);
      dbInstance.close();
      if (rawInventoryItems.length === 0) return;

      if (!db.isOpen()) await db.open();
      const allMasterProductConfigs = await db.productRules.toArray();
      const masterProductConfigsMap = new Map(allMasterProductConfigs.map(config => [config.productId, config]));

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
      await saveCurrentSession(finalProcessedInventory, type, new Date());
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
      updateSyncStatus();
    }
  }, [state.isOnline, updateSyncStatus, saveCurrentSession]);

  const processDbForMasterConfigs = useCallback(async (buffer: Uint8Array) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      await initDb();
      const dbInstance = loadDb(buffer);
      const rawInventoryItems: InventoryItemFromDB[] = queryData(dbInstance, ALL_PRODUCTS_QUERY);
      dbInstance.close();
      if (rawInventoryItems.length === 0) return;
      
      if (!db.isOpen()) await db.open();
      const existingConfigs = await db.productRules.toArray();
      const configsMap = new Map(existingConfigs.map(c => [c.productId, c]));
      const nowIso = new Date().toISOString();
      
      const updates = rawInventoryItems.map(item => {
        const existing = configsMap.get(item.ProductId);
        return {
          productId: item.ProductId,
          productName: item.Producto,
          rules: existing?.rules || [],
          supplier: existing?.supplier || item.SupplierName,
          isHidden: existing?.isHidden || false,
          inventory_type: existing?.inventory_type || 'monthly',
          sync_pending: true,
          updated_at: nowIso
        };
      });
      
      await db.productRules.bulkPut(updates);
      
      if (supabase && state.isOnline) {
        const supabaseConfigs = updates.map(c => ({
          product_id: c.productId,
          product_name: c.productName,
          supplier_name: c.supplier,
          rules: c.rules,
          isHidden: c.isHidden,
          inventory_type: c.inventory_type
        }));
        const { error } = await (supabase.from('product_rules') as any).upsert(supabaseConfigs, { 
          onConflict: 'product_id'
        });
        if (error) throw error;
      }
      
      await loadMasterProductConfigs();
      showSuccess('Catálogo maestro actualizado correctamente.');
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [loadMasterProductConfigs, state.isOnline]);

  const forceDownloadConfigFromSupabase = useCallback(async () => {
    if (!supabase || !state.isOnline) {
      showError("No hay conexión a internet o Supabase no está configurado.");
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true });

    try {
      if (!db.isOpen()) await db.open();

      await db.productRules.clear();
      await db.sessions.clear();
      await db.supplierConfigs.clear();

      const { data: rules, error: rulesError } = await supabase.from('product_rules').select('*');
      const { data: sessions, error: sessionsError } = await supabase.from('inventory_sessions').select('*');

      if (rulesError) throw rulesError;
      if (sessionsError) throw sessionsError;

      const mappedRules = (rules as any[] || []).map(r => ({
        ...r,
        productId: Number(r.product_id),
        sync_pending: false,
      }));

      const mappedSessions = (sessions as any[] || []).map(s => ({
        ...s,
        sync_pending: false,
      }));

      await db.productRules.bulkPut(mappedRules);
      await db.sessions.bulkPut(mappedSessions);

      await loadMasterProductConfigs();
      showSuccess("Sincronización de emergencia completada. Datos restaurados.");
    } catch (e: any) {
      console.error("Error en sincronización de emergencia:", e);
      showError(`Error al restaurar datos: ${e.message}`);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false });
      updateSyncStatus();
    }
  }, [state.isOnline, loadMasterProductConfigs, updateSyncStatus]);

  const updateInventoryItemLocal = useCallback((index: number, key: keyof InventoryItem, value: any) => {
    dispatch({ type: 'UPDATE_SINGLE_ITEM', payload: { index, key, value } });
  }, []);

  const syncToSupabase = useCallback(async () => {
    if (!supabase || !state.isOnline) return;
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: true });
    try {
      const pendingSessions = await db.sessions.toCollection().filter(s => s.sync_pending === true).toArray();
      for (const session of pendingSessions) {
        const supabaseSession = {
          dateKey: session.dateKey,
          inventoryType: session.inventoryType,
          inventoryData: session.inventoryData,
          timestamp: session.timestamp,
          effectiveness: session.effectiveness,
          ordersBySupplier: session.ordersBySupplier,
        };
        const { error } = await (supabase.from('inventory_sessions') as any).upsert(supabaseSession, { onConflict: 'dateKey' });
        if (error) throw error;
        await db.sessions.update(session.dateKey, { sync_pending: false });
      }
      
      const pendingRules = await db.productRules.toCollection().filter(r => r.sync_pending === true).toArray();
      for (const rule of pendingRules) {
        const supabaseRule = {
          product_id: rule.productId,
          product_name: rule.productName,
          supplier_name: rule.supplier,
          rules: rule.rules,
          isHidden: rule.isHidden,
          inventory_type: rule.inventory_type
        };
        const { error } = await (supabase.from('product_rules') as any).upsert(supabaseRule, { onConflict: 'product_id' });
        if (error) throw error;
        await db.productRules.update(rule.productId, { sync_pending: false });
      }

      const { data: sessions } = await supabase.from('inventory_sessions').select('*');
      const { data: rules } = await supabase.from('product_rules').select('*');
      if (sessions) await db.sessions.bulkPut(sessions as any);
      if (rules) await db.productRules.bulkPut(rules as any);
      
      await loadMasterProductConfigs();
      showSuccess('Sincronización total completada.');
    } catch (e) {
      console.error("Error during sync:", e);
      showError("Error durante la sincronización.");
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
      dispatch({ type: 'SET_SUPABASE_SYNC_IN_PROGRESS', payload: false });
      updateSyncStatus();
    }
  }, [state.isOnline, loadMasterProductConfigs, updateSyncStatus]);

  const handleVisibilityChangeSync = useCallback(async () => {
    if (document.visibilityState === 'visible' && state.isOnline) {
      await syncToSupabase();
    }
  }, [state.isOnline, syncToSupabase]);

  const resetAllProductConfigs = useCallback(async (buffer: Uint8Array) => {
    await db.productRules.clear();
    await processDbForMasterConfigs(buffer);
  }, [processDbForMasterConfigs]);

  const fetchInitialData = useCallback(async () => {
    if (!supabase || !state.isOnline) return;
    await syncToSupabase();
  }, [state.isOnline, syncToSupabase]);

  const clearLocalDatabase = useCallback(async () => {
    await db.delete();
    await db.open();
    dispatch({ type: 'RESET_STATE' });
    showSuccess('Base de datos local limpiada.');
  }, []);

  const value = useMemo(() => ({
    ...state,
    filteredInventoryData,
    setDbBuffer,
    setInventoryType,
    setRawInventoryItemsFromDb,
    setMasterProductConfigs,
    setSyncStatus,
    setHasUnsavedChanges,
    processInventoryData,
    processDbForMasterConfigs,
    saveCurrentSession,
    loadSession,
    deleteSession,
    getSessionHistory,
    resetInventoryState,
    syncToSupabase,
    forceDownloadConfigFromSupabase,
    saveMasterProductConfig,
    saveAllMasterProductConfigs,
    deleteMasterProductConfig,
    loadMasterProductConfigs,
    handleVisibilityChangeSync,
    resetAllProductConfigs,
    clearLocalDatabase,
    updateInventoryItemLocal,
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
    setHasUnsavedChanges,
    processInventoryData, 
    processDbForMasterConfigs, 
    saveCurrentSession, 
    loadSession, 
    deleteSession, 
    getSessionHistory, 
    resetInventoryState, 
    syncToSupabase, 
    forceDownloadConfigFromSupabase,
    saveMasterProductConfig, 
    saveAllMasterProductConfigs,
    deleteMasterProductConfig, 
    loadMasterProductConfigs, 
    handleVisibilityChangeSync,
    resetAllProductConfigs,
    clearLocalDatabase, 
    updateInventoryItemLocal, 
    fetchInitialData,
    updateSyncStatus
  ]);

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
};

export const useInventoryContext = () => {
  const context = useContext(InventoryContext);
  if (context === undefined) throw new Error("useInventoryContext must be used within an InventoryProvider");
  return context;
};