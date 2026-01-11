import React, { createContext, useReducer, useContext, useCallback, useEffect, useMemo } from "react";
import { initDb, loadDb, queryData } from "@/lib/db";
import productData from "@/data/product-data.json";
import { db, InventorySession, MasterProductConfig, ProductRule, SupplierConfig } from "@/lib/persistence"; // Usar MasterProductConfig
import { format } from "date-fns";
import { showSuccess, showError } from "@/utils/toast";
import debounce from "lodash.debounce";
import { supabase } from "@/lib/supabase";

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
  supplier: string; // Ahora se deriva de MasterProductConfig o DB
  multiple: number; // Ahora se deriva de MasterProductConfig o DB
  hasBeenEdited?: boolean;
  rules: ProductRule[]; // Lista de reglas de stock/pedido
  minProductOrder: number; // Mínimo de unidades a pedir para este producto
}

// --- Reducer Setup ---
interface InventoryState {
  dbBuffer: Uint8Array | null;
  inventoryType: "weekly" | "monthly" | null;
  inventoryData: InventoryItem[];
  masterProductConfigs: MasterProductConfig[]; // Nuevo estado para las configuraciones maestras
  supplierConfigs: SupplierConfig[]; // Nuevo estado para las configuraciones de proveedor
  loading: boolean;
  error: string | null;
  sessionId: string | null;
}

const initialState: InventoryState = {
  dbBuffer: null,
  inventoryType: null,
  inventoryData: [],
  masterProductConfigs: [], // Inicializar vacío
  supplierConfigs: [], // Inicializar vacío
  loading: false,
  error: null,
  sessionId: null,
};

type InventoryAction =
  | { type: 'SET_DB_BUFFER'; payload: Uint8Array | null }
  | { type: 'SET_INVENTORY_TYPE'; payload: "weekly" | "monthly" | null }
  | { type: 'SET_INVENTORY_DATA'; payload: InventoryItem[] }
  | { type: 'SET_MASTER_PRODUCT_CONFIGS'; payload: MasterProductConfig[] } // Nueva acción
  | { type: 'SET_SUPPLIER_CONFIGS'; payload: SupplierConfig[] } // Nueva acción para proveedores
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
    case 'SET_MASTER_PRODUCT_CONFIGS': // Manejar la nueva acción
      return { ...state, masterProductConfigs: action.payload };
    case 'SET_SUPPLIER_CONFIGS': // Manejar la nueva acción para proveedores
      return { ...state, supplierConfigs: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    case 'SET_SESSION_ID':
      return { ...state, sessionId: action.payload };
    case 'RESET_STATE':
      return {
        ...initialState,
        dbBuffer: state.dbBuffer,
        masterProductConfigs: state.masterProductConfigs, // Mantener las reglas de producto al resetear el estado del inventario
        supplierConfigs: state.supplierConfigs, // Mantener las configuraciones de proveedor
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
  setMasterProductConfigs: (configs: MasterProductConfig[]) => void; // Nueva función
  setSupplierConfigs: (configs: SupplierConfig[]) => void; // Nueva función para proveedores
  processInventoryData: (
    buffer: Uint8Array,
    type: "weekly" | "monthly"
  ) => Promise<void>;
  processDbForMasterConfigs: (buffer: Uint8Array) => Promise<void>; // Nueva función para SettingsPage
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
  saveMasterProductConfig: (config: MasterProductConfig) => Promise<void>; // Nueva función
  deleteMasterProductConfig: (productName: string) => Promise<void>; // Nueva función
  loadMasterProductConfigs: () => Promise<MasterProductConfig[]>; // Nueva función
  saveSupplierConfig: (config: SupplierConfig) => Promise<void>; // Nueva función
  deleteSupplierConfig: (supplierName: string) => Promise<void>; // Nueva función
  loadSupplierConfigs: () => Promise<SupplierConfig[]>; // Nueva función
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

  const setMasterProductConfigs = useCallback((configs: MasterProductConfig[]) => {
    dispatch({ type: 'SET_MASTER_PRODUCT_CONFIGS', payload: configs });
  }, []);

  const setSupplierConfigs = useCallback((configs: SupplierConfig[]) => {
    dispatch({ type: 'SET_SUPPLIER_CONFIGS', payload: configs });
  }, []);

  const resetInventoryState = useCallback(() => {
    dispatch({ type: 'RESET_STATE' });
  }, []);

  // Consultas SQL específicas para inventario semanal y mensual
  const WEEKLY_INVENTORY_QUERY = `
    SELECT PG.Name AS Categoria, P.Name AS Producto, S.Quantity AS Stock_Actual,
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
    SELECT PG.Name AS Categoria, P.Name AS Producto, S.Quantity AS Stock_Actual,
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

  const loadMasterProductConfigs = useCallback(async (): Promise<MasterProductConfig[]> => {
    try {
      const localConfigs = await db.productRules.toArray();
      dispatch({ type: 'SET_MASTER_PRODUCT_CONFIGS', payload: localConfigs });
      return localConfigs;
    } catch (e) {
      console.error("Error fetching master product configs from Dexie:", e);
      showError('Error al obtener las configuraciones de producto.');
      return [];
    }
  }, []);

  const saveMasterProductConfig = useCallback(async (config: MasterProductConfig) => {
    try {
      await db.productRules.put(config);
      dispatch({ type: 'SET_MASTER_PRODUCT_CONFIGS', payload: await db.productRules.toArray() }); // Refrescar configs

      if (supabase) {
        const { error } = await supabase
          .from('product_rules')
          .upsert(config, { onConflict: 'productName' });

        if (error) {
          console.error("Error saving master product config to Supabase:", error);
        } else {
          console.log("Master product config saved to Supabase successfully.");
        }
      }
      // showSuccess(`Configuración para ${config.productName} guardada.`); // Feedback handled by SettingsPage
    } catch (e) {
      console.error("Error saving master product config:", e);
      // showError('Error al guardar la configuración de producto.'); // Feedback handled by SettingsPage
      throw e; // Re-throw to allow SettingsPage to catch and show error feedback
    }
  }, []);

  const deleteMasterProductConfig = useCallback(async (productName: string) => {
    try {
      await db.productRules.delete(productName);
      dispatch({ type: 'SET_MASTER_PRODUCT_CONFIGS', payload: await db.productRules.toArray() }); // Refrescar configs

      if (supabase) {
        const { error } = await supabase
          .from('product_rules')
          .delete()
          .eq('productName', productName);

        if (error) {
          console.error("Error deleting master product config from Supabase:", error);
        } else {
          console.log("Master product config deleted from Supabase successfully.");
        }
      }
      showSuccess(`Configuración para ${productName} eliminada.`);
    } catch (e) {
      console.error("Error deleting master product config:", e);
      showError('Error al eliminar la configuración de producto.');
    }
  }, []);

  const loadSupplierConfigs = useCallback(async (): Promise<SupplierConfig[]> => {
    try {
      const localConfigs = await db.supplierConfigs.toArray();
      dispatch({ type: 'SET_SUPPLIER_CONFIGS', payload: localConfigs });
      return localConfigs;
    } catch (e) {
      console.error("Error fetching supplier configs from Dexie:", e);
      showError('Error al obtener las configuraciones de proveedor.');
      return [];
    }
  }, []);

  const saveSupplierConfig = useCallback(async (config: SupplierConfig) => {
    try {
      await db.supplierConfigs.put(config);
      dispatch({ type: 'SET_SUPPLIER_CONFIGS', payload: await db.supplierConfigs.toArray() }); // Refrescar configs

      if (supabase) {
        const { error } = await supabase
          .from('supplier_configs')
          .upsert(config, { onConflict: 'supplierName' });

        if (error) {
          console.error("Error saving supplier config to Supabase:", error);
        } else {
          console.log("Supplier config saved to Supabase successfully.");
        }
      }
      // showSuccess(`Configuración para ${config.supplierName} guardada.`); // Feedback handled by SettingsPage
    } catch (e) {
      console.error("Error saving supplier config:", e);
      // showError('Error al guardar la configuración de proveedor.'); // Feedback handled by SettingsPage
      throw e; // Re-throw to allow SettingsPage to catch and show error feedback
    }
  }, []);

  const deleteSupplierConfig = useCallback(async (supplierName: string) => {
    try {
      await db.supplierConfigs.delete(supplierName);
      dispatch({ type: 'SET_SUPPLIER_CONFIGS', payload: await db.supplierConfigs.toArray() }); // Refrescar configs

      if (supabase) {
        const { error } = await supabase
          .from('supplier_configs')
          .delete()
          .eq('supplierName', supplierName);

        if (error) {
          console.error("Error deleting supplier config from Supabase:", error);
        } else {
          console.log("Supplier config deleted from Supabase successfully.");
        }
      }
      showSuccess(`Configuración para ${supplierName} eliminada.`);
    } catch (e) {
      console.error("Error deleting supplier config:", e);
      showError('Error al eliminar la configuración de proveedor.');
    }
  }, []);


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

        // Cargar las configuraciones maestras existentes
        const existingMasterProductConfigs = await db.productRules.toArray();
        const masterProductConfigsMap = new Map(existingMasterProductConfigs.map(config => [config.productName, config]));

        // Cargar las configuraciones de proveedor existentes
        const existingSupplierConfigs = await db.supplierConfigs.toArray();
        const supplierConfigsMap = new Map(existingSupplierConfigs.map(config => [config.supplierName, config]));

        let processedInventory: InventoryItem[] = [];
        const newMasterConfigsToSave: MasterProductConfig[] = [];
        const newSupplierConfigsToSave: SupplierConfig[] = [];

        rawInventoryItems.forEach((dbItem) => {
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

          const matchedProductData = productData.find(
            (p) => p.productName === dbItem.Producto
          );

          let masterConfig = masterProductConfigsMap.get(dbItem.Producto);
          let supplierConfig = supplierConfigsMap.get(supplierName);

          if (!masterConfig) {
            // Si no existe una configuración maestra, crear una nueva con valores por defecto
            masterConfig = {
              productName: dbItem.Producto,
              rules: [], // Inicializar con array vacío
              minProductOrder: 0, // Inicializar con 0
              supplier: supplierName, // Usar el proveedor detectado inicialmente
              multiple: matchedProductData?.multiple || 1, // Usar multiple de product-data.json o 1
            };
            newMasterConfigsToSave.push(masterConfig);
            masterProductConfigsMap.set(dbItem.Producto, masterConfig); // Añadir al mapa para futuras referencias en esta sesión
          }

          if (!supplierConfig) {
            supplierConfig = {
              supplierName: supplierName,
              minOrderValue: 0, // Inicializar con 0
            };
            newSupplierConfigsToSave.push(supplierConfig);
            supplierConfigsMap.set(supplierName, supplierConfig);
          }

          processedInventory.push({
            productId: matchedProductData?.productId || 0,
            productName: dbItem.Producto,
            category: dbItem.Categoria,
            systemQuantity: dbItem.Stock_Actual,
            physicalQuantity: dbItem.Stock_Actual,
            averageSales: matchedProductData?.averageSales || 0,
            supplier: masterConfig.supplier, // Usar el proveedor de la configuración maestra
            multiple: masterConfig.multiple, // Usar el múltiplo de la configuración maestra
            hasBeenEdited: false,
            rules: masterConfig.rules, // Usar las reglas de la configuración maestra
            minProductOrder: masterConfig.minProductOrder, // Usar el mínimo por producto de la configuración maestra
          });
        });

        // Guardar las nuevas configuraciones maestras creadas
        if (newMasterConfigsToSave.length > 0) {
          await db.productRules.bulkPut(newMasterConfigsToSave);
          dispatch({ type: 'SET_MASTER_PRODUCT_CONFIGS', payload: await db.productRules.toArray() }); // Actualizar estado global
          console.log(`Saved ${newMasterConfigsToSave.length} new master product configs.`);
        }

        // Guardar las nuevas configuraciones de proveedor creadas
        if (newSupplierConfigsToSave.length > 0) {
          await db.supplierConfigs.bulkPut(newSupplierConfigsToSave);
          dispatch({ type: 'SET_SUPPLIER_CONFIGS', payload: await db.supplierConfigs.toArray() });
          console.log(`Saved ${newSupplierConfigsToSave.length} new supplier configs.`);
        }

        // Filtrar productos de los proveedores "KYR S.A.S" y "Desconocido"
        processedInventory = processedInventory.filter(item => item.supplier !== "KYR S.A.S" && item.supplier !== "Desconocido");

        dispatch({ type: 'SET_INVENTORY_DATA', payload: processedInventory });
        dispatch({ type: 'SET_INVENTORY_TYPE', payload: type });

        const dateKey = format(new Date(), 'yyyy-MM-dd');
        const effectiveness = calculateEffectiveness(processedInventory);

        // Guardar en Dexie
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

  // Nueva función para procesar DB solo para configuraciones maestras
  const processDbForMasterConfigs = useCallback(async (buffer: Uint8Array) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    console.log(`Starting database processing for master configs.`);

    try {
      await initDb();
      const dbInstance = loadDb(buffer);
      // Usar la consulta mensual para obtener la lista más completa de productos
      const rawInventoryItems: InventoryItemFromDB[] = queryData(
        dbInstance,
        MONTHLY_INVENTORY_QUERY
      );
      dbInstance.close();

      const existingMasterProductConfigs = await db.productRules.toArray();
      const masterProductConfigsMap = new Map(existingMasterProductConfigs.map(config => [config.productName, config]));

      const existingSupplierConfigs = await db.supplierConfigs.toArray();
      const supplierConfigsMap = new Map(existingSupplierConfigs.map(config => [config.supplierName, config]));

      const newMasterConfigsToSave: MasterProductConfig[] = [];
      const newSupplierConfigsToSave: SupplierConfig[] = [];

      rawInventoryItems.forEach((dbItem) => {
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

        let masterConfig = masterProductConfigsMap.get(dbItem.Producto);
        let supplierConfig = supplierConfigsMap.get(supplierName);

        if (!masterConfig) {
          masterConfig = {
            productName: dbItem.Producto,
            rules: [], // Inicializar con array vacío
            minProductOrder: 0, // Inicializar con 0
            supplier: supplierName,
            multiple: matchedProductData?.multiple || 1,
          };
          newMasterConfigsToSave.push(masterConfig);
          masterProductConfigsMap.set(dbItem.Producto, masterConfig);
        }

        if (!supplierConfig) {
          supplierConfig = {
            supplierName: supplierName,
            minOrderValue: 0,
          };
          newSupplierConfigsToSave.push(supplierConfig);
          supplierConfigsMap.set(supplierName, supplierConfig);
        }
      });

      if (newMasterConfigsToSave.length > 0) {
        await db.productRules.bulkPut(newMasterConfigsToSave);
        dispatch({ type: 'SET_MASTER_PRODUCT_CONFIGS', payload: await db.productRules.toArray() });
        showSuccess(`Se agregaron ${newMasterConfigsToSave.length} nuevos productos a la configuración maestra.`);
      } else {
        showSuccess('No se encontraron nuevos productos para agregar a la configuración maestra.');
      }

      if (newSupplierConfigsToSave.length > 0) {
        await db.supplierConfigs.bulkPut(newSupplierConfigsToSave);
        dispatch({ type: 'SET_SUPPLIER_CONFIGS', payload: await db.supplierConfigs.toArray() });
        showSuccess(`Se agregaron ${newSupplierConfigsToSave.length} nuevos proveedores a la configuración maestra.`);
      } else {
        showSuccess('No se encontraron nuevos proveedores para agregar a la configuración maestra.');
      }

    } catch (e: any) {
      console.error("Error processing database for master configs:", e);
      showError(`Error al procesar el archivo DB para configuraciones: ${e.message}`);
      dispatch({ type: 'SET_ERROR', payload: e.message });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
      console.log("Database master config processing finished.");
    }
  }, []);


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
      // Recuperar la sesión existente para preservar ordersBySupplier si no se proporciona
      const existingSession = await db.sessions.get(dateKey);
      const ordersToSave = orders !== undefined ? orders : existingSession?.ordersBySupplier;

      // Guardar en Dexie
      await db.sessions.put({
        dateKey,
        inventoryType: type,
        inventoryData: data,
        timestamp,
        effectiveness,
        ordersBySupplier: ordersToSave,
      });

      // Si no hay sessionId, establecerlo
      if (!state.sessionId) {
        dispatch({ type: 'SET_SESSION_ID', payload: dateKey });
      }

      // Guardar en Supabase si está disponible
      if (supabase) {
        console.log("Attempting to save session to Supabase with data:", {
          dateKey,
          inventoryType: type,
          inventoryDataLength: data.length,
          timestamp,
          effectiveness,
          hasOrders: !!ordersToSave
        });

        const { data: supabaseData, error } = await supabase
          .from('inventory_sessions')
          .upsert({
            dateKey,
            inventoryType: type,
            inventoryData: data,
            timestamp,
            effectiveness,
            ordersBySupplier: ordersToSave,
          }, {
            onConflict: 'dateKey' // Usar dateKey como clave para upsert
          });

        if (error) {
          console.error("Error saving session to Supabase:", error);
          console.error("Error details:", {
            message: error.message,
            code: error.code,
            hint: error.hint,
            details: error.details
          });
          // No mostrar error al usuario, solo loguear
        } else {
          console.log("Session saved to Supabase successfully:", supabaseData);
        }
      } else {
        console.log("Supabase client not available, skipping save to Supabase");
      }

      // showSuccess('Sesión guardada automáticamente.'); // Feedback handled by calling component
    } catch (e) {
      console.error("Error saving session:", e);
      // showError('Error al guardar la sesión.'); // Feedback handled by calling component
      throw e; // Re-throw to allow calling component to catch and show error feedback
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
      // Eliminar de Dexie
      await db.sessions.delete(dateKey);
      
      // Eliminar de Supabase si está disponible
      if (supabase) {
        const { error } = await supabase
          .from('inventory_sessions')
          .delete()
          .eq('dateKey', dateKey);

        if (error) {
          console.error("Error deleting session from Supabase:", error);
          // No mostrar error al usuario, solo loguear
        } else {
          console.log("Session deleted from Supabase successfully.");
        }
      }

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

  // Nueva función para sincronizar desde Supabase
  const syncFromSupabase = useCallback(async () => {
    if (!supabase) {
      console.log("Supabase not available, skipping sync.");
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      // Sincronizar sesiones
      const localSessions = await db.sessions.toArray();
      if (localSessions.length === 0) {
        console.log("Attempting to fetch sessions from Supabase...");
        const { data: sessionsData, error: sessionsError } = await supabase
          .from('inventory_sessions')
          .select('*')
          .order('timestamp', { ascending: false });

        if (sessionsError) {
          console.error("Error fetching sessions from Supabase:", sessionsError);
        } else if (sessionsData && sessionsData.length > 0) {
          for (const session of sessionsData) {
            await db.sessions.put({
              dateKey: session.dateKey,
              inventoryType: session.inventoryType,
              inventoryData: session.inventoryData,
              timestamp: new Date(session.timestamp),
              effectiveness: session.effectiveness,
              ordersBySupplier: session.ordersBySupplier,
            });
          }
          console.log(`Synced ${sessionsData.length} sessions from Supabase to local storage.`);
        } else {
          console.log("No sessions found in Supabase to sync.");
        }
      } else {
        console.log("Local sessions found, skipping Supabase sessions sync.");
      }

      // Sincronizar reglas de producto
      const localMasterProductConfigs = await db.productRules.toArray();
      if (localMasterProductConfigs.length === 0) {
        console.log("Attempting to fetch product rules from Supabase...");
        const { data: configsData, error: configsError } = await supabase
          .from('product_rules')
          .select('*');

        if (configsError) {
          console.error("Error fetching product rules from Supabase:", configsError);
        } else if (configsData && configsData.length > 0) {
          for (const config of configsData) {
            await db.productRules.put(config);
          }
          dispatch({ type: 'SET_MASTER_PRODUCT_CONFIGS', payload: configsData });
          console.log(`Synced ${configsData.length} product rules from Supabase to local storage.`);
        } else {
          console.log("No product rules found in Supabase to sync.");
        }
      } else {
        console.log("Local product rules found, skipping Supabase rules sync.");
      }

      // Sincronizar configuraciones de proveedor
      const localSupplierConfigs = await db.supplierConfigs.toArray();
      if (localSupplierConfigs.length === 0) {
        console.log("Attempting to fetch supplier configs from Supabase...");
        const { data: supplierConfigsData, error: supplierConfigsError } = await supabase
          .from('supplier_configs')
          .select('*');

        if (supplierConfigsError) {
          console.error("Error fetching supplier configs from Supabase:", supplierConfigsError);
        } else if (supplierConfigsData && supplierConfigsData.length > 0) {
          for (const config of supplierConfigsData) {
            await db.supplierConfigs.put(config);
          }
          dispatch({ type: 'SET_SUPPLIER_CONFIGS', payload: supplierConfigsData });
          console.log(`Synced ${supplierConfigsData.length} supplier configs from Supabase to local storage.`);
        } else {
          console.log("No supplier configs found in Supabase to sync.");
        }
      } else {
        console.log("Local supplier configs found, skipping Supabase configs sync.");
      }

    } catch (e) {
      console.error("Error during Supabase sync:", e);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  useEffect(() => {
    // Este useEffect ahora solo se encarga de disparar processInventoryData
    // si dbBuffer y inventoryType están presentes y no hay una sesión activa cargada.
    if (state.dbBuffer && state.inventoryType && !state.sessionId) {
      processInventoryData(state.dbBuffer, state.inventoryType);
    }
  }, [state.dbBuffer, state.inventoryType, state.sessionId, processInventoryData]);

  // Cargar configuraciones maestras de producto y proveedor al inicio de la aplicación
  useEffect(() => {
    loadMasterProductConfigs();
    loadSupplierConfigs();
  }, [loadMasterProductConfigs, loadSupplierConfigs]);

  const value = useMemo(() => ({
    ...state,
    setDbBuffer,
    setInventoryType,
    setInventoryData,
    setMasterProductConfigs, // Añadir al valor del contexto
    setSupplierConfigs, // Añadir al valor del contexto
    processInventoryData,
    processDbForMasterConfigs, // Añadir al valor del contexto
    saveCurrentSession,
    loadSession,
    deleteSession,
    getSessionHistory,
    resetInventoryState,
    syncFromSupabase,
    saveMasterProductConfig, // Añadir al valor del contexto
    deleteMasterProductConfig, // Añadir al valor del contexto
    loadMasterProductConfigs, // Añadir al valor del contexto
    saveSupplierConfig, // Añadir al valor del contexto
    deleteSupplierConfig, // Añadir al valor del contexto
    loadSupplierConfigs, // Añadir al valor del contexto
  }), [
    state,
    setDbBuffer,
    setInventoryType,
    setInventoryData,
    setMasterProductConfigs,
    setSupplierConfigs,
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
    saveSupplierConfig,
    deleteSupplierConfig,
    loadSupplierConfigs,
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