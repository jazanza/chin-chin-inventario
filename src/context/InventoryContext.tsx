import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from "react";
import { db } from "@/lib/persistence";
import { supabase } from "@/lib/supabase";
import { showError, showSuccess } from "@/utils/toast";
import { debounce } from "lodash.debounce";
import { initDb, loadDb, queryData } from "@/lib/db";
import { format } from "date-fns";

// Tipos e interfaces
export interface InventoryItem {
  productId: number;
  productName: string;
  category: string;
  supplier: string;
  systemQuantity: number;
  physicalQuantity: number;
  hasBeenEdited: boolean;
  rules?: { minStock: number; orderAmount: number }[];
  averageSales?: number;
  multiple?: number;
}

interface InventoryState {
  dbBuffer: Uint8Array | null;
  inventoryType: "weekly" | "monthly" | null;
  rawInventoryItemsFromDb: InventoryItem[];
  masterProductConfigs: MasterProductConfig[];
  loading: boolean;
  error: string | null;
  sessionId: string | null;
  syncStatus: "idle" | "syncing" | "pending" | "synced" | "error";
  isOnline: boolean;
  isSupabaseSyncInProgress: boolean;
  isSyncBlockedWarningActive: boolean;
  realtimeStatus: "connected" | "disconnected" | "error";
}

interface InventoryContextType extends InventoryState {
  setDbBuffer: (buffer: Uint8Array | null) => void;
  setInventoryType: (type: "weekly" | "monthly" | null) => void;
  setRawInventoryItemsFromDb: (items: InventoryItem[]) => void;
  resetInventoryState: () => void;
  processInventoryData: (buffer: Uint8Array, type: "weekly" | "monthly") => Promise<void>;
  processDbForMasterConfigs: (buffer: Uint8Array) => Promise<void>;
  saveCurrentSession: (inventoryData: InventoryItem[], inventoryType: "weekly" | "monthly", timestamp: Date, ordersBySupplier?: { [supplier: string]: OrderItem[] }) => Promise<void>;
  loadSession: (dateKey: string) => Promise<void>;
  deleteSession: (dateKey: string) => Promise<void>;
  getSessionHistory: () => Promise<InventorySession[]>;
  loadMasterProductConfigs: (includeHidden?: boolean) => Promise<void>;
  saveMasterProductConfig: (config: MasterProductConfig) => Promise<void>;
  deleteMasterProductConfig: (productId: number) => Promise<void>;
  syncFromSupabase: (source: string, forceFullSync?: boolean) => Promise<void>;
  handleVisibilityChangeSync: () => void;
  resetAllProductConfigs: (buffer: Uint8Array) => Promise<void>;
  clearLocalDatabase: () => Promise<void>;
  retryPendingSyncs: () => Promise<void>;
  updateSyncStatus: () => void;
  filteredInventoryData: InventoryItem[];
  flushPendingSessionSave: () => void;
  updateAndDebounceSaveInventoryItem: (index: number, key: keyof InventoryItem, value: number | boolean) => void;
}

const initialState: InventoryState = {
  dbBuffer: null,
  inventoryType: null,
  rawInventoryItemsFromDb: [],
  masterProductConfigs: [],
  loading: false,
  error: null,
  sessionId: null,
  syncStatus: "idle",
  isOnline: navigator.onLine,
  isSupabaseSyncInProgress: false,
  isSyncBlockedWarningActive: false,
  realtimeStatus: "disconnected",
};

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const useInventoryContext = () => {
  const context = useContext(InventoryContext);
  if (!context) {
    throw new Error("useInventoryContext must be used within an InventoryProvider");
  }
  return context;
};

export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(inventoryReducer, initialState);
  const syncLockRef = useRef(false);
  const lastSyncTimestampRef = useRef<Date | null>(null);
  const debouncedSaveCurrentSessionRef = useRef<((data: InventoryItem[]) => void) | null>(null);
  const realtimeChannelRef = useRef<any>(null);

  // Implementación del contexto
  // ... (código existente)

  return (
    <InventoryContext.Provider value={{
      ...state,
      setDbBuffer,
      setInventoryType,
      setRawInventoryItemsFromDb,
      resetInventoryState,
      processInventoryData,
      processDbForMasterConfigs,
      saveCurrentSession,
      loadSession,
      deleteSession,
      getSessionHistory,
      loadMasterProductConfigs,
      saveMasterProductConfig,
      deleteMasterProductConfig,
      syncFromSupabase,
      handleVisibilityChangeSync,
      resetAllProductConfigs,
      clearLocalDatabase,
      retryPendingSyncs,
      updateSyncStatus,
      filteredInventoryData,
      flushPendingSessionSave,
      updateAndDebounceSaveInventoryItem,
    }}>
      {children}
    </InventoryContext.Provider>
  );
};

// Implementación del reducer y otras funciones
// ... (código existente)