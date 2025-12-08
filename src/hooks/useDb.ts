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

// New query for inventory items. Assuming Product table has Id, Name, Description.
// Stock_Actual is a placeholder here, as it's not typically in sales transaction DBs.
// We'll use 0 as a default and allow user input for physical count.
const INVENTORY_QUERY_BASE = `
  SELECT
    P.Id AS ProductId,
    P.Name AS ProductName,
    P.Description AS ProductDescription
  FROM Product AS P
  WHERE P.IsDeleted = 0 -- Assuming active products
  ORDER BY P.Name;
`;

export interface InventoryItemFromDB {
  ProductId: number;
  ProductName: string;
  ProductDescription: string;
}

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
      
      // Date range for inventory might not be relevant for 'current stock' but kept for consistency if needed
      // For now, INVENTORY_QUERY_BASE doesn't use dateRange, but it could be extended.
      const dateRange = inventoryType === "weekly" ? calculateDateRange("this_week") : calculateDateRange("this_month");

      const INVENTORY_QUERY = createQuery(INVENTORY_QUERY_BASE, dateRange); // Date range not used in current INVENTORY_QUERY_BASE
      const rawInventoryItems: InventoryItemFromDB[] = queryData(db, INVENTORY_QUERY);
      db.close();

      // Merge with product-data.json for supplier, average sales, and multiples
      const processedInventory = rawInventoryItems.map(dbItem => {
        const matchedProduct = productData.find(p => p.productName === dbItem.ProductName);
        return {
          productId: dbItem.ProductId,
          productName: dbItem.ProductName,
          category: matchedProduct?.category || "General",
          systemQuantity: 0, // Placeholder, as actual stock is not in sales DB
          physicalQuantity: 0, // User will input this
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