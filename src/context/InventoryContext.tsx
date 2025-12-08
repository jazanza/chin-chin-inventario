import React, {
  createContext,
  useState,
  useContext,
  useCallback,
  useEffect,
} from "react";
import { initDb, loadDb, queryData } from "@/lib/db";
import productData from "@/data/product-data.json";

// Interfaz para los datos de inventario tal como vienen de la DB
export interface InventoryItemFromDB {
  Categoria: string;
  Producto: string;
  Stock_Actual: number;
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
  hasBeenEdited?: boolean; // Nueva propiedad
}

interface InventoryContextType {
  dbBuffer: Uint8Array | null;
  inventoryType: "weekly" | "monthly" | null;
  inventoryData: InventoryItem[];
  loading: boolean;
  error: string | null;
  setDbBuffer: (buffer: Uint8Array | null) => void;
  setInventoryType: (type: "weekly" | "monthly" | null) => void;
  setInventoryData: (data: InventoryItem[]) => void;
  processInventoryData: (
    buffer: Uint8Array,
    type: "weekly" | "monthly"
  ) => Promise<void>;
}

const InventoryContext = createContext<InventoryContextType | undefined>(
  undefined
);

export const InventoryProvider = ({ children }: { children: React.ReactNode }) => {
  const [dbBuffer, setDbBuffer] = useState<Uint8Array | null>(null);
  const [inventoryType, setInventoryType] = useState<"weekly" | "monthly" | null>(null);
  const [inventoryData, setInventoryData] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Consultas SQL específicas para inventario semanal y mensual
  const WEEKLY_INVENTORY_QUERY = `
    SELECT
      PG.Name AS Categoria,
      P.Name AS Producto,
      S.Quantity AS Stock_Actual
    FROM Stock S
    JOIN Product P ON P.Id = S.ProductId
    JOIN ProductGroup PG ON PG.Id = P.ProductGroupId
    WHERE
      PG.Id IN (13, 14, 16, 20, 23, 27, 34, 36, 37, 38, 43, 40, 52, 53)
      AND PG.Name IN (
        'Cervezas',
        'Mixers',
        'Cigarrillos y Vapes',
        'Snacks',
        'Six Packs',
        'Conservas y Embutidos',
        'Cervezas Belgas',
        'Cervezas Alemanas',
        'Cervezas Españolas',
        'Cervezas Del Mundo',
        'Cervezas 750ml',
        'Vapes',
        'Tabacos',
        'Comida'
      )
      AND P.IsEnabled = 1
    ORDER BY
      PG.Name ASC,
      P.Name ASC;
  `;

  const MONTHLY_INVENTORY_QUERY = `
    SELECT
      PG.Name AS Categoria,
      P.Name AS Producto,
      S.Quantity AS Stock_Actual
    FROM Stock S
    JOIN Product P ON P.Id = S.ProductId
    JOIN ProductGroup PG ON PG.Id = P.ProductGroupId
    WHERE
      PG.Id IN (
        4, 5, 6, 7, 8, 9, 10, 11, 12,
        13, 14, 16, 20, 22, 23, 27,
        34, 36, 37, 38, 43
      )
      AND PG.Name IN (
        'Vinos',
        'Espumantes',
        'Whisky',
        'Vodka',
        'Ron',
        'Gin',
        'Aguardientes',
        'Tequilas',
        'Aperitivos',
        'Cervezas',
        'Mixers',
        'Cigarrillos y Vapes',
        'Snacks',
        'Personales',
        'Six Packs',
        'Conservas y Embutidos',
        'Cervezas Belgas',
        'Cervezas Alemanas',
        'Vapes',
        'Tabacos',
        'Comida'
      )
      AND P.IsEnabled = 1
    ORDER BY
      PG.Name ASC,
      P.Name ASC;
  `;

  const processInventoryData = useCallback(
    async (buffer: Uint8Array, type: "weekly" | "monthly") => {
      setLoading(true);
      setError(null);
      console.log(`Starting database processing for ${type} inventory.`);
      try {
        await initDb();
        const db = loadDb(buffer);

        let inventoryQuery: string;
        if (type === "weekly") {
          inventoryQuery = WEEKLY_INVENTORY_QUERY;
        } else {
          inventoryQuery = MONTHLY_INVENTORY_QUERY;
        }

        const rawInventoryItems: InventoryItemFromDB[] = queryData(
          db,
          inventoryQuery
        );
        db.close();

        const processedInventory = rawInventoryItems.map((dbItem) => {
          const matchedProduct = productData.find(
            (p) => p.productName === dbItem.Producto
          );
          return {
            productId: matchedProduct?.productId || 0,
            productName: dbItem.Producto,
            category: dbItem.Categoria,
            systemQuantity: dbItem.Stock_Actual,
            physicalQuantity: 0, // Inicializar con 0
            averageSales: matchedProduct?.averageSales || 0,
            supplier: matchedProduct?.supplier || "Desconocido",
            multiple: matchedProduct?.multiple || 1,
            hasBeenEdited: false, // Nueva propiedad inicializada a false
          };
        });

        setInventoryData(processedInventory);
      } catch (e: any) {
        console.error("Error processing database for inventory:", e);
        setError(e.message);
      } finally {
        setLoading(false);
        console.log("Database inventory processing finished.");
      }
    },
    []
  );

  // Efecto para procesar los datos cuando dbBuffer o inventoryType cambian
  useEffect(() => {
    if (dbBuffer && inventoryType) {
      processInventoryData(dbBuffer, inventoryType);
    }
  }, [dbBuffer, inventoryType, processInventoryData]);

  const value = {
    dbBuffer,
    inventoryType,
    inventoryData,
    loading,
    error,
    setDbBuffer,
    setInventoryType,
    setInventoryData,
    processInventoryData,
  };

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