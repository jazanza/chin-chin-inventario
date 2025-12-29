import React, { createContext, useReducer, useContext, useCallback, useEffect, useMemo } from "react";
import { initDb, loadDb, queryData } from "@/lib/db";
import productData from "@/data/product-data.json";
import { db, InventorySession } from "@/lib/persistence";
import { format } from "date-fns";
import { showSuccess, showError } from "@/utils/toast";
import debounce from "lodash.debounce";

// Interfaz para los datos de inventario tal como vienen de la DB
export interface InventoryItemFromDB {
  Categoria: string;
  Producto: string;
  Stock_Actual: number;
  SupplierName: string;
}

// Interfaz para los datos de inventario procesados
export interface InventoryItem {
  productId: number;
  productName: string;
  category: string;
  systemQuantity: number;
  physicalQuantity: number;
  averageSales: number;
  supplier: string;
  multiple: number;
  hasBeenEdited?: boolean;
}

// --- Reducer Setup ---
interface InventoryState {
  dbBuffer: Uint8Array | null;
  inventoryType: "weekly" | "monthly" | null;
  inventoryData: InventoryItem[];
  loading: boolean;
  error: string | null;
  sessionId: string | null;
}

const initialState: InventoryState = {
  dbBuffer: null,
  inventoryType: null,
  inventoryData: [],
  loading: false,
  error: null,
  sessionId: null,
};

type InventoryAction =
  | { type: 'SET_DB_BUFFER'; payload: Uint8Array | null }
  | { type: 'SET_INVENTORY_TYPE'; payload: "weekly" | "monthly" | null }
  | { type: 'SET_INVENTORY_DATA'; payload: InventoryItem[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_SESSION_ID'; payload: string | null }
  | { type: 'RESET_STATE' };

const inventoryReducer = (state: InventoryState, action: InventoryAction): InventoryState => {
  switch (action.type) {
    case 'SET_DB_BUFFER':
      return { ...state, dbBuffer: action.payload, error: null };
    case 'SET_INVENTORY_TYPE':
      return { ...state, inventoryType: action.payload, error: null };
    case 'SET_INVENTORY_DATA':
      return { ...state, inventoryData: action.payload, error: null };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    case 'SET_SESSION_ID':
      return { ...state, sessionId: action.payload };
    case 'RESET_STATE':
      return {
        ...initialState,
        // Mantener el dbBuffer si ya estaba cargado, pero resetear todo lo demás
        // Si queremos forzar una nueva carga de DB, el handleStartNewSession lo pondrá a null
        dbBuffer: state.dbBuffer, 
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
  processInventoryData: (
    buffer: Uint8Array,
    type: "weekly" | "monthly"
  ) => Promise<void>;
  saveCurrentSession: (
    data: InventoryItem[],
    type: "weekly" | "monthly",
    timestamp: Date,
    orders?: { [supplier: string]: any[] }
  ) => Promise<void>;
  loadSession: (dateKey: string) => Promise<void>;
  deleteSession: (dateKey: string) => Promise<void>; // Nueva función
  getSessionHistory: () => Promise<InventorySession[]>;
  resetInventoryState: () => void;
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

  const setDbBuffer = useCallback((buffer: Uint8Array | null) => {
    dispatch({ type: 'SET_DB_BUFFER', payload: buffer });
  }, []);

  const setInventoryType = useCallback((type: "weekly" | "monthly" | null) => {
    dispatch({ type: 'SET_INVENTORY_TYPE', payload: type });
  }, []);

  const setInventoryData = useCallback((data: InventoryItem[]) => {
    dispatch({ type: 'SET_INVENTORY_DATA', payload: data });
  }, []);

  const resetInventoryState = useCallback(() => {
    dispatch({ type: 'RESET_STATE' });
  }, []);

  // Consultas SQL específicas para inventario semanal y mensual
  const WEEKLY_INVENTORY_QUERY = `
    SELECT
        PG.Name AS Categoria,
        P.Name AS Producto,
        S.Quantity AS Stock_Actual,
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
    FROM
        Stock S
    JOIN
        Product P ON P.Id = S.ProductId
    JOIN
        ProductGroup PG ON PG.Id = P.ProductGroupId
    WHERE
        PG.Id IN (13, 14, 16, 20, 23, 27, 34, 36, 37, 38, 43, 40, 52, 53)
        AND PG.Name IN (
            'Cervezas', 'Mixers', 'Cigarrillos y Vapes', 'Snacks', 'Six Packs',
            'Conservas y Embutidos', 'Cervezas Belgas', 'Cervezas Alemanas',
            'Cervezas Españolas', 'Cervezas Del Mundo', 'Cervezas 750ml', 'Vapes',
            'Tabacos', 'Comida'
        )
        AND P.IsEnabled = 1
    ORDER BY PG.Name ASC, P.Name ASC;
  `;

  const MONTHLY_INVENTORY_QUERY = `
    SELECT
        PG.Name AS Categoria,
        P.Name AS Producto,
        S.Quantity AS Stock_Actual,
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
    FROM
        Stock S
    JOIN
        Product P ON P.Id = S.ProductId
    JOIN
        ProductGroup PG ON PG.Id = P.ProductGroupId
    WHERE
        PG.Id IN (
            4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 20, 22, 23, 27, 34, 36, 37, 38, 43
        )
        AND PG.Name IN (
            'Vinos', 'Espumantes', 'Whisky', 'Vodka', 'Ron', 'Gin', 'Aguardientes',
            'Tequilas', 'Aperitivos', 'Cervezas', 'Mixers', 'Cigarrillos y Vapes',
            'Snacks', 'Personales', 'Six Packs', 'Conservas y Embutidos',
            'Cervezas Belgas', 'Cervezas Alemanas', 'Vapes', 'Tabacos', 'Comida'
        )
        AND P.IsEnabled = 1
    ORDER BY PG.Name ASC, P.Name ASC;
  `;

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

        let processedInventory = rawInventoryItems.map((dbItem) => {
          const matchedProduct = productData.find(
            (p) => p.productName === dbItem.Producto
          );

          let supplierName = dbItem.SupplierName;
          const lowerCaseSupplierName = supplierName.toLowerCase();

          // Estandarizar "Finca Yaruqui" y "Elbe" (y sus variantes) a "ELBE S.A."
          if (lowerCaseSupplierName.includes("finca yaruqui") || lowerCaseSupplierName.includes("elbe")) {
            supplierName = "ELBE S.A.";
          }
          // Remapear "AC Bebidas" a "AC Bebidas (Coca Cola)" si es el proveedor original
          else if (lowerCaseSupplierName.includes("ac bebidas")) {
            supplierName = "AC Bebidas (Coca Cola)";
          }

          // Remapeo específico de productos a "AC Bebidas (Coca Cola)"
          const productsToForceACBebidas = ["Coca Cola", "Fioravanti", "Fanta", "Sprite", "Imperial Toronja"];
          if (productsToForceACBebidas.some(p => dbItem.Producto.includes(p))) {
            supplierName = "AC Bebidas (Coca Cola)";
          }

          return {
            productId: matchedProduct?.productId || 0,
            productName: dbItem.Producto,
            category: dbItem.Categoria,
            systemQuantity: dbItem.Stock_Actual,
            physicalQuantity: dbItem.Stock_Actual,
            averageSales: matchedProduct?.averageSales || 0,
            supplier: supplierName,
            multiple: matchedProduct?.multiple || 1,
            hasBeenEdited: false,
          };
        });

        // Filtrar productos de los proveedores "KYR S.A.S" y "Desconocido"
        processedInventory = processedInventory.filter(item => 
          item.supplier !== "KYR S.A.S" && item.supplier !== "Desconocido"
        );

        dispatch({ type: 'SET_INVENTORY_DATA', payload: processedInventory });
        dispatch({ type: 'SET_INVENTORY_TYPE', payload: type });
        
        const dateKey = format(new Date(), 'yyyy-MM-dd');
        const effectiveness = calculateEffectiveness(processedInventory);
        await db.sessions.put({
          dateKey,
          inventoryType: type,
          inventoryData: processedInventory,
          timestamp: new Date(),
          effectiveness,
        });
        dispatch({ type: 'SET_SESSION_ID', payload: dateKey });
        showSuccess('Nueva sesión de inventario iniciada y guardada.');

      } catch (e: any) {
        console.error("Error processing database for inventory:", e);
        dispatch({ type: 'SET_ERROR', payload: e.message });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
        console.log("Database inventory processing finished.");
      }
    },
    []
  );

  // --- Persistencia de Sesiones ---
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
      await db.sessions.put({
        dateKey,
        inventoryType: type,
        inventoryData: data,
        timestamp,
        effectiveness,
        ordersBySupplier: orders,
      });
      if (!state.sessionId) {
        dispatch({ type: 'SET_SESSION_ID', payload: dateKey });
      }
      showSuccess('Sesión guardada automáticamente.');
    } catch (e) {
      console.error("Error saving session:", e);
      showError('Error al guardar la sesión.');
    }
  }, [state.sessionId]);

  const loadSession = useCallback(async (dateKey: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    try {
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
      await db.sessions.delete(dateKey);
      showSuccess(`Sesión del ${dateKey} eliminada.`);
      // Si la sesión eliminada era la que estaba cargada, resetear el estado
      if (state.sessionId === dateKey) {
        dispatch({ type: 'RESET_STATE' });
        dispatch({ type: 'SET_SESSION_ID', payload: null });
      }
    } catch (e) {
      console.error("Error deleting session:", e);
      showError('Error al eliminar la sesión.');
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.sessionId]);

  const getSessionHistory = useCallback(async (): Promise<InventorySession[]> => {
    try {
      return await db.sessions.orderBy('timestamp').reverse().toArray();
    } catch (e) {
      console.error("Error fetching session history:", e);
      showError('Error al obtener el historial de sesiones.');
      return [];
    }
  }, []);

  useEffect(() => {
    // Este useEffect ahora solo se encarga de disparar processInventoryData
    // si dbBuffer y inventoryType están presentes y no hay una sesión activa cargada.
    if (state.dbBuffer && state.inventoryType && !state.sessionId) {
      processInventoryData(state.dbBuffer, state.inventoryType);
    }
  }, [state.dbBuffer, state.inventoryType, state.sessionId, processInventoryData]);

  const value = useMemo(() => ({
    ...state,
    setDbBuffer,
    setInventoryType,
    setInventoryData,
    processInventoryData,
    saveCurrentSession,
    loadSession,
    deleteSession, // Añadir la nueva función al contexto
    getSessionHistory,
    resetInventoryState,
  }), [
    state,
    setDbBuffer,
    setInventoryType,
    setInventoryData,
    processInventoryData,
    saveCurrentSession,
    loadSession,
    deleteSession,
    getSessionHistory,
    resetInventoryState,
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