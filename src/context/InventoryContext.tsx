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
interface InventoryState {
  dbBuffer: Uint8Array | null;
  inventoryType: "weekly" | "monthly" | null;
  inventoryData: InventoryItem[];
  masterProductConfigs: MasterProductConfig[]; // Nuevo estado para las configuraciones maestras
  loading: boolean;
  error: string | null;
  sessionId: string | null;
}

const initialState: InventoryState = {
  dbBuffer: null,
  inventoryType: null,
  inventoryData: [],
  masterProductConfigs: [], // Inicializar vacío
  loading: false,
  error: null,
  sessionId: null,
};

type InventoryAction =
  | { type: 'SET_DB_BUFFER'; payload: Uint8Array | null }
  | { type: 'SET_INVENTORY_TYPE'; payload: "weekly" | "monthly" | null }
  | { type: 'SET_INVENTORY_DATA'; payload: InventoryItem[] }
  | { type: 'SET_MASTER_PRODUCT_CONFIGS'; payload: MasterProductConfig[] }
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
    case 'SET_MASTER_PRODUCT_CONFIGS':
      return { ...state, masterProductConfigs: action.payload };
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
        masterProductConfigs: state.masterProductConfigs,
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

  const resetInventoryState = useCallback(() => {
    dispatch({ type: 'RESET_STATE' });
  }, []);

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

  const loadMasterProductConfigs = useCallback(async (): Promise<MasterProductConfig[]> => {
    try {
      // Cargar solo las configuraciones que no están ocultas
      const localConfigs = await db.productRules.where('isHidden').notEqual(true).toArray();
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
      await db.productRules.put(config); // Dexie usa productId como clave
      dispatch({ type: 'SET_MASTER_PRODUCT_CONFIGS', payload: await db.productRules.where('isHidden').notEqual(true).toArray() }); // Refrescar configs sin ocultos

      if (supabase) {
        const { error } = await supabase
          .from('product_rules')
          .upsert(config, { onConflict: 'productId' }); // Usar productId como clave de conflicto

        if (error) {
          console.error("Error saving master product config to Supabase:", error);
        } else {
          console.log("Master product config saved to Supabase successfully.");
        }
      }
    } catch (e) {
      console.error("Error saving master product config:", e);
      throw e;
    }
  }, []);

  const deleteMasterProductConfig = useCallback(async (productId: number) => { // Cambiado a productId
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      // Realizar borrado suave: actualizar isHidden a true
      await db.productRules.update(productId, { isHidden: true });
      dispatch({ type: 'SET_MASTER_PRODUCT_CONFIGS', payload: await db.productRules.where('isHidden').notEqual(true).toArray() }); // Refrescar configs sin ocultos

      if (supabase) {
        const { error } = await supabase
          .from('product_rules')
          .update({ isHidden: true })
          .eq('productId', productId); // Usar productId para la condición

        if (error) {
          console.error("Error soft-deleting master product config from Supabase:", error);
        } else {
          console.log("Master product config soft-deleted from Supabase successfully.");
        }
      }
      showSuccess(`Configuración de producto eliminada (ocultada).`);

      // Si el producto eliminado estaba en el inventario actual, actualizarlo
      if (state.inventoryData.some(item => item.productId === productId)) {
        const updatedInventory = state.inventoryData.filter(item => item.productId !== productId);
        dispatch({ type: 'SET_INVENTORY_DATA', payload: updatedInventory });
        if (state.sessionId && state.inventoryType) {
          await saveCurrentSession(updatedInventory, state.inventoryType, new Date());
        }
      }

    } catch (e) {
      console.error("Error soft-deleting master product config:", e);
      showError('Error al eliminar la configuración de producto.');
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.inventoryData, state.sessionId, state.inventoryType, saveCurrentSession]);

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

        // Cargar las configuraciones maestras existentes (incluyendo ocultas para referencia)
        const allMasterProductConfigs = await db.productRules.toArray();
        const masterProductConfigsMap = new Map(allMasterProductConfigs.map(config => [config.productId, config]));

        let processedInventory: InventoryItem[] = [];
        const newMasterConfigsToSave: MasterProductConfig[] = [];

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

          let masterConfig = masterProductConfigsMap.get(dbItem.ProductId);

          if (!masterConfig) {
            // Si no existe una configuración maestra, crear una nueva con valores por defecto
            masterConfig = {
              productId: dbItem.ProductId,
              productName: dbItem.Producto,
              rules: [], // Inicializar con array vacío
              supplier: supplierName, // Usar el proveedor detectado inicialmente
              isHidden: false, // Por defecto no oculto
            };
            newMasterConfigsToSave.push(masterConfig);
            masterProductConfigsMap.set(dbItem.ProductId, masterConfig); // Añadir al mapa para futuras referencias en esta sesión
          } else {
            // Si ya existe, actualizar el nombre y proveedor si han cambiado en la DB, pero NO el isHidden
            masterConfig = {
              ...masterConfig,
              productName: dbItem.Producto, // Actualizar nombre si ha cambiado
              supplier: supplierName, // Actualizar proveedor si ha cambiado
            };
            // Si el producto estaba oculto y reaparece en la DB, no lo desocultamos automáticamente
            // Si se quiere desocultar, debe hacerse manualmente en la configuración
            newMasterConfigsToSave.push(masterConfig); // Añadir para posible actualización
          }

          // Solo añadir al inventario si no está oculto
          if (!masterConfig.isHidden) {
            processedInventory.push({
              productId: dbItem.ProductId,
              productName: dbItem.Producto,
              category: dbItem.Categoria,
              systemQuantity: dbItem.Stock_Actual,
              physicalQuantity: dbItem.Stock_Actual,
              averageSales: matchedProductData?.averageSales || 0,
              supplier: masterConfig.supplier, // Usar el proveedor de la configuración maestra
              hasBeenEdited: false,
              rules: masterConfig.rules, // Usar las reglas de la configuración maestra
            });
          }
        });

        // Guardar las nuevas configuraciones maestras creadas o actualizadas
        if (newMasterConfigsToSave.length > 0) {
          await db.productRules.bulkPut(newMasterConfigsToSave);
          dispatch({ type: 'SET_MASTER_PRODUCT_CONFIGS', payload: await db.productRules.where('isHidden').notEqual(true).toArray() }); // Actualizar estado global sin ocultos
          console.log(`Saved ${newMasterConfigsToSave.length} new or updated master product configs.`);
        }

        // Filtrar productos de los proveedores "KYR S.A.S" y "Desconocido"
        // Este filtro se aplica al inventario actual, no a la configuración maestra
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
      // Usar la consulta ALL_PRODUCTS_QUERY para obtener la lista más completa de productos
      const rawInventoryItems: InventoryItemFromDB[] = queryData(
        dbInstance,
        ALL_PRODUCTS_QUERY // Usar la nueva consulta amplia
      );
      dbInstance.close();

      const existingMasterProductConfigs = await db.productRules.toArray(); // Obtener todas las configs, incluyendo ocultas
      const masterProductConfigsMap = new Map(existingMasterProductConfigs.map(config => [config.productId, config]));

      const configsToUpdateOrAdd: MasterProductConfig[] = [];
      let newProductsCount = 0;

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

        let masterConfig = masterProductConfigsMap.get(dbItem.ProductId);

        if (!masterConfig) {
          // Si no existe, es un producto nuevo
          masterConfig = {
            productId: dbItem.ProductId,
            productName: dbItem.Producto,
            rules: [], // Inicializar con array vacío
            supplier: supplierName,
            isHidden: false, // Por defecto no oculto
          };
          newProductsCount++;
          configsToUpdateOrAdd.push(masterConfig);
        } else {
          // Si existe, actualizar nombre y proveedor si han cambiado, pero mantener isHidden
          const updatedConfig = {
            ...masterConfig,
            productName: dbItem.Producto, // Actualizar nombre si ha cambiado
            supplier: supplierName, // Actualizar proveedor si ha cambiado
            // isHidden se mantiene como está, no se sobrescribe
          };
          // Solo añadir a la lista de actualización si hay cambios relevantes
          if (
            masterConfig.productName !== updatedConfig.productName ||
            masterConfig.supplier !== updatedConfig.supplier
          ) {
            configsToUpdateOrAdd.push(updatedConfig);
          }
        }
      });

      if (configsToUpdateOrAdd.length > 0) {
        await db.productRules.bulkPut(configsToUpdateOrAdd);
        dispatch({ type: 'SET_MASTER_PRODUCT_CONFIGS', payload: await db.productRules.where('isHidden').notEqual(true).toArray() }); // Actualizar estado global sin ocultos
        if (newProductsCount > 0) {
          showSuccess(`Se agregaron ${newProductsCount} nuevos productos a la configuración maestra.`);
        } else {
          showSuccess('Configuraciones de productos actualizadas.');
        }
      } else {
        showSuccess('No se encontraron nuevos productos para agregar o actualizar en la configuración maestra.');
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
        dispatch({ type: 'SET_INVENTORY_DATA', payload: session.inventoryData }); // Corregido: Añadido ')'
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
          dispatch({ type: 'SET_MASTER_PRODUCT_CONFIGS', payload: configsData.filter(c => !c.isHidden) }); // Filtrar ocultos
          console.log(`Synced ${configsData.length} product rules from Supabase to local storage.`);
        } else {
          console.log("No product rules found in Supabase to sync.");
        }
      } else {
        console.log("Local product rules found, skipping Supabase rules sync.");
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

  // Cargar configuraciones maestras de producto al inicio de la aplicación
  useEffect(() => {
    loadMasterProductConfigs();
  }, [loadMasterProductConfigs]);

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