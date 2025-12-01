import { useState, useCallback } from "react";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { initDb, loadDb, queryData } from "@/lib/db";
import { calculateDateRange } from "@/lib/dates";

interface IElectronAPI {
  openDbFile: () => Promise<Uint8Array | null>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}

const createQuery = (baseQuery: string, dateRange?: DateRange): string => {
  let whereClause = "WHERE T3.DocumentTypeId = 2";
  if (dateRange?.from) {
    const fromDate = format(dateRange.from, "yyyy-MM-dd 00:00:00");
    const toDate = dateRange.to
      ? format(dateRange.to, "yyyy-MM-dd 23:59:59")
      : format(new Date(), "yyyy-MM-dd 23:59:59");
    whereClause += ` AND T3.DateCreated BETWEEN '${fromDate}' AND '${toDate}'`;
  }
  return baseQuery.replace("{{WHERE_CLAUSE}}", whereClause);
};

const VOLUME_QUERY_BASE = `
  SELECT T1.Quantity, T2.Name AS ItemName, T2.Description AS ItemDescription
  FROM DocumentItem AS T1
  INNER JOIN Product AS T2 ON T1.ProductId = T2.Id
  INNER JOIN Document AS T3 ON T1.DocumentId = T3.Id
  {{WHERE_CLAUSE}};
`;

const SPECTRUM_QUERY_BASE = `
  SELECT T2.Name as ItemName, T2.Description AS ItemDescription, SUM(T1.Quantity) as TotalQuantity
  FROM DocumentItem AS T1
  INNER JOIN Product AS T2 ON T1.ProductId = T2.Id
  INNER JOIN Document AS T3 ON T1.DocumentId = T3.Id
  {{WHERE_CLAUSE}}
  GROUP BY T2.Name, T2.Description;
`;

const LOYALTY_QUERY_BASE = `
  SELECT
    T4.Name AS CustomerName,
    T2.Name AS ItemName,
    T2.Description AS ItemDescription,
    SUM(T1.Quantity) AS TotalQuantity
  FROM DocumentItem AS T1
  INNER JOIN Product AS T2 ON T1.ProductId = T2.Id
  INNER JOIN Document AS T3 ON T1.DocumentId = T3.Id
  INNER JOIN Customer AS T4 ON T3.CustomerId = T4.Id
  {{WHERE_CLAUSE}} AND T4.Name IS NOT NULL
  GROUP BY T4.Name, T2.Name, T2.Description
  ORDER BY SUM(T1.Quantity) DESC;
`;

const extractVolumeMl = (name: string, description: string | null): number => {
  const textToSearch = `${name} ${description || ""}`.toLowerCase();
  const volumeRegex = /(\d+)\s*ml/i;
  const match = textToSearch.match(volumeRegex);

  if (match && match[1]) {
    return parseInt(match[1], 10);
  }

  if (textToSearch.includes("pinta")) return 473;
  if (textToSearch.includes("caña")) return 200;
  if (textToSearch.includes("botella")) return 330;
  if (textToSearch.includes("lata")) return 330;

  console.warn(`Could not determine volume for item: ${name}. Defaulting to 0.`);
  return 0;
};

const categorizeBeer = (itemName: string): string => {
  const lowerItemName = itemName.toLowerCase();
  if (lowerItemName.includes("ipa")) return "IPA";
  if (lowerItemName.includes("lager")) return "Lager";
  if (lowerItemName.includes("stout")) return "Stout";
  if (lowerItemName.includes("porter")) return "Porter";
  if (lowerItemName.includes("pilsner")) return "Pilsner";
  if (lowerItemName.includes("ale")) return "Ale";
  return "Other";
};

const BEER_CATEGORY_COLORS: { [key: string]: string } = {
  IPA: "#FF6347",
  Lager: "#FFD700",
  Stout: "#4B0082",
  Porter: "#8B4513",
  Pilsner: "#F0E68C",
  Ale: "#D2691E",
  Other: "#A9A9A9",
};

export function useDb() {
  const [data, setData] = useState<{
    consumptionMetrics: { liters: number };
    flavorData: { [key: string]: number };
    varietyMetrics: { totalLiters: number; uniqueProducts: number };
    loyaltyMetrics: { topCustomers: { name: string; liters: number }[] };
    rankedBeers: { name: string; liters: number; color: string }[];
  }>({
    consumptionMetrics: { liters: 0 },
    flavorData: {},
    varietyMetrics: { totalLiters: 0, uniqueProducts: 0 },
    loyaltyMetrics: { topCustomers: [] },
    rankedBeers: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processData = useCallback(async (dbBuffer: Uint8Array, rangeKey: string) => {
    setLoading(true);
    setError(null);
    console.log("Starting database processing with date range:", rangeKey);
    try {
      await initDb();
      const db = loadDb(dbBuffer);
      
      const dateRange = calculateDateRange(rangeKey);

      const VOLUME_QUERY = createQuery(VOLUME_QUERY_BASE, dateRange);
      const SPECTRUM_QUERY = createQuery(SPECTRUM_QUERY_BASE, dateRange);
      const LOYALTY_QUERY = createQuery(LOYALTY_QUERY_BASE, dateRange);

      const volumeData = queryData(db, VOLUME_QUERY);
      const spectrumData = queryData(db, SPECTRUM_QUERY);
      const loyaltyData = queryData(db, LOYALTY_QUERY);
      db.close();

      let totalMl = 0;
      for (const item of volumeData) {
        const volume = extractVolumeMl(item.ItemName, item.ItemDescription);
        totalMl += item.Quantity * volume;
      }
      const totalLiters = totalMl / 1000;

      const flavorMl: { [key: string]: number } = {};
      for (const item of spectrumData) {
        const volume = extractVolumeMl(item.ItemName, item.ItemDescription);
        if (volume > 0) {
          const category = categorizeBeer(item.ItemName);
          flavorMl[category] = (flavorMl[category] || 0) + item.TotalQuantity * volume;
        }
      }

      const varietyMetrics = {
        totalLiters,
        uniqueProducts: spectrumData.length,
      };

      const customerVolumes: { [key: string]: number } = {};
      for (const item of loyaltyData) {
        const volume = extractVolumeMl(item.ItemName, item.ItemDescription);
        if (volume > 0) {
          customerVolumes[item.CustomerName] = (customerVolumes[item.CustomerName] || 0) + item.TotalQuantity * volume;
        }
      }
      const sortedCustomers = Object.entries(customerVolumes)
        .map(([name, ml]) => ({ name, liters: ml / 1000 }))
        .sort((a, b) => b.liters - a.liters);
      const topCustomers = sortedCustomers.slice(0, 20);

      const rankedBeers = spectrumData
        .map(item => {
          const volume = extractVolumeMl(item.ItemName, item.ItemDescription);
          const category = categorizeBeer(item.ItemName);
          return {
            name: item.ItemName,
            liters: (item.TotalQuantity * volume) / 1000,
            color: BEER_CATEGORY_COLORS[category] || BEER_CATEGORY_COLORS["Other"],
          };
        })
        .filter(beer => beer.liters > 0.1)
        .sort((a, b) => b.liters - a.liters)
        .slice(0, 10);

      setData({
        consumptionMetrics: { liters: totalLiters },
        flavorData: flavorMl,
        varietyMetrics,
        loyaltyMetrics: { topCustomers },
        rankedBeers,
      });
    } catch (e: any) {
      console.error("Error processing database:", e);
      setError(e.message);
    } finally {
      setLoading(false);
      console.log("Database processing finished.");
    }
  }, []);

  return { ...data, loading, error, processData };
}