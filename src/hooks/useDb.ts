import { useState, useCallback } from "react";
import { initDb, loadDb, queryData } from "@/lib/db";

interface IElectronAPI {
  openDbFile: () => Promise<Uint8Array | null>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}

const WEEKLY_GOAL_LITERS = 500;
const GOAL_ML = WEEKLY_GOAL_LITERS * 1000;

// Queries updated to fetch Description along with the Name
const VOLUME_QUERY = `
  SELECT T1.Quantity, T2.Name AS ItemName, T2.Description AS ItemDescription
  FROM DocumentItem AS T1
  INNER JOIN Product AS T2 ON T1.ProductId = T2.Id
  INNER JOIN Document AS T3 ON T1.DocumentId = T3.Id
  WHERE T3.DateCreated >= DATETIME('now', '-7 days') AND T3.DocumentTypeId = 2;
`;

const SPECTRUM_QUERY = `
  SELECT T2.Name as ItemName, T2.Description AS ItemDescription, SUM(T1.Quantity) as TotalQuantity
  FROM DocumentItem AS T1
  INNER JOIN Product AS T2 ON T1.ProductId = T2.Id
  INNER JOIN Document AS T3 ON T1.DocumentId = T3.Id
  WHERE T3.DateCreated >= DATETIME('now', '-7 days') AND T3.DocumentTypeId = 2
  GROUP BY T2.Name, T2.Description;
`;

const LOYALTY_QUERY = `
  SELECT
    T4.Name AS CustomerName,
    T2.Name AS ItemName,
    T2.Description AS ItemDescription,
    SUM(T1.Quantity) AS TotalQuantity
  FROM DocumentItem AS T1
  INNER JOIN Product AS T2 ON T1.ProductId = T2.Id
  INNER JOIN Document AS T3 ON T1.DocumentId = T3.Id
  INNER JOIN Customer AS T4 ON T3.CustomerId = T4.Id
  WHERE T3.DateCreated >= DATETIME('now', '-7 days') AND T3.DocumentTypeId = 2 AND T4.Name IS NOT NULL
  GROUP BY T4.Name, T2.Name, T2.Description
  ORDER BY SUM(T1.Quantity) DESC;
`;

// More robust function to extract volume
const extractVolumeMl = (name: string, description: string | null): number => {
  const textToSearch = `${name} ${description || ""}`.toLowerCase();
  const volumeRegex = /(\d+)\s*ml/i;
  const match = textToSearch.match(volumeRegex);

  if (match && match[1]) {
    return parseInt(match[1], 10);
  }

  // Fallback for common terms
  if (textToSearch.includes("pinta")) return 473;
  if (textToSearch.includes("caña")) return 200;
  if (textToSearch.includes("botella")) return 330;
  if (textToSearch.includes("lata")) return 330;

  console.warn(`Could not determine volume for item: ${name}. Defaulting to 0.`);
  return 0; // Default to 0 if no volume can be determined
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

export function useDb() {
  const [data, setData] = useState({
    consumptionMetrics: { liters: 0, percentage: 0, goal: WEEKLY_GOAL_LITERS },
    flavorData: {},
    varietyMetrics: { totalLiters: 0, uniqueProducts: 0 },
    loyaltyMetrics: { topCustomers: [] },
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processData = useCallback(async (dbBuffer: Uint8Array) => {
    setLoading(true);
    setError(null);
    console.log("Starting database processing...");
    try {
      await initDb();
      const db = loadDb(dbBuffer);
      const volumeData = queryData(db, VOLUME_QUERY);
      const spectrumData = queryData(db, SPECTRUM_QUERY);
      const loyaltyData = queryData(db, LOYALTY_QUERY);
      db.close();

      console.log("Raw Volume Data:", volumeData);
      console.log("Raw Spectrum Data:", spectrumData);
      console.log("Raw Loyalty Data:", loyaltyData);

      // 1. Consumption Metrics
      let totalMl = 0;
      for (const item of volumeData) {
        const volume = extractVolumeMl(item.ItemName, item.ItemDescription);
        totalMl += item.Quantity * volume;
      }
      const totalLiters = totalMl / 1000;
      const percentage = Math.min(totalMl / GOAL_ML, 1.0);
      console.log(`Calculated Total Liters: ${totalLiters}, Percentage: ${percentage}`);

      // 2. Flavor Spectrum
      const flavorMl: { [key: string]: number } = {};
      for (const item of spectrumData) {
        const volume = extractVolumeMl(item.ItemName, item.ItemDescription);
        if (volume > 0) {
          const category = categorizeBeer(item.ItemName);
          flavorMl[category] = (flavorMl[category] || 0) + item.TotalQuantity * volume;
        }
      }
      console.log("Calculated Flavor Spectrum (ml):", flavorMl);

      // 3. Variety Metrics
      const varietyMetrics = {
        totalLiters,
        uniqueProducts: spectrumData.length,
      };

      // 4. Loyalty Metrics
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
      const topCustomers = sortedCustomers.slice(0, 5);
      console.log("Calculated Top Customers:", topCustomers);

      setData({
        consumptionMetrics: { liters: totalLiters, percentage, goal: WEEKLY_GOAL_LITERS },
        flavorData: flavorMl,
        varietyMetrics,
        loyaltyMetrics: { topCustomers },
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