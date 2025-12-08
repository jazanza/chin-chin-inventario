import { useState, useCallback } from "react";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { initDb, loadDb, queryData } from "@/lib/db";
import { calculateDateRange } from "@/lib/dates";
import productData from "@/data/product-data.json"; // Importar los datos de productos

interface IElectronAPI {
  openDbFile: () => Promise<Uint8Array | null>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}

const EXCLUDED_CUSTOMERS = ["Maria Fernanda Azanza Arias", "Jose Azanza Arias", "Enrique Cobo", "Juan Francisco Perez", "Islas Boutique"];

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

// Interfaz para los datos de inventario tal como vienen de la DB
export interface InventoryItemFromDB {
  Categoria: string;
  Producto: string;
  Stock_Actual: number;
}

// La función createQuery se mantiene por si se usa para otras consultas, pero no para las de inventario actuales.
const createQuery = (baseQuery: string, dateRange?: DateRange): string => {
  let whereClause = "WHERE T3.DocumentTypeId = 2"; // Assuming sales documents
  if (dateRange?.from) {
    const fromDate = format(dateRange.from, "yyyy-MM-dd 00:00:00");
    const toDate = dateRange.to
      ? format(dateRange.to, "yyyy-MM-dd 23:59:59")
      : format(new Date(), "yyyy-MM-dd 23:59:59");
    whereClause += ` AND T3.DateCreated BETWEEN '${fromDate}' AND '${toDate}'`;
  }

  const excludedCustomersString = EXCLUDED_CUSTOMERS.map(name => `'${name.replace(/'/g, "''")}'`).join(',');

  if (baseQuery.includes("LEFT JOIN Customer")) {
    whereClause += ` AND (T4.Name IS NULL OR T4.Name NOT IN (${excludedCustomersString}))`;
  } else if (baseQuery.includes("INNER JOIN Customer")) {
    whereClause += ` AND T4.Name NOT IN (${excludedCustomersString})`;
  }

  return baseQuery.replace("{{WHERE_CLAUSE}}", whereClause);
};


export function useDb() {
  const [inventoryData, setInventoryData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processInventoryData = useCallback(async (dbBuffer: Uint8Array, inventoryType: "weekly" | "monthly") => {
    setLoading(true);
    setError(null);
    console.log(`Starting database processing for ${inventoryType} inventory.`);
    try {
      await initDb();
      const db = loadDb(dbBuffer);
      
      let inventoryQuery: string;
      if (inventoryType === "weekly") {
        inventoryQuery = WEEKLY_INVENTORY_QUERY;
      } else {
        inventoryQuery = MONTHLY_INVENTORY_QUERY;
      }

      const rawInventoryItems: InventoryItemFromDB[] = queryData(db, inventoryQuery);
      db.close();

      // Merge with product-data.json for supplier, average sales, and multiples
      const processedInventory = rawInventoryItems.map(dbItem => {
        const matchedProduct = productData.find(p => p.productName === dbItem.Producto);
        return {
          productId: matchedProduct?.productId || 0, // Usar productId del JSON si coincide, o 0 como fallback
          productName: dbItem.Producto,
          category: dbItem.Categoria, // Usar la categoría de la DB
          systemQuantity: dbItem.Stock_Actual, // Usar el stock real de la DB
          physicalQuantity: 0, // El usuario ingresará esto
          averageSales: matchedProduct?.averageSales || 0,
          supplier: matchedProduct?.supplier || "Desconocido",
          multiple: matchedProduct?.multiple || 1,
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
  }, []);

  return { inventoryData, loading, error, processInventoryData };
}