import { useState, useEffect, useCallback } from "react";
import { initDb, loadDb, queryData } from "@/lib/db";

// Type definition for the API exposed by preload.ts
interface IElectronAPI {
  getDbBuffer: () => Promise<Uint8Array | null>;
  onDbUpdate: (callback: () => void) => void;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}

const WEEKLY_GOAL_LITERS = 500;
const GOAL_ML = WEEKLY_GOAL_LITERS * 1000;

const BEER_QUERY = `
  SELECT
    T1.Quantity,
    T2.Name AS ItemName
  FROM
    DocumentItem AS T1
  INNER JOIN
    Product AS T2 ON T1.ProductId = T2.Id
  INNER JOIN
    Document AS T3 ON T1.DocumentId = T3.Id
  WHERE
    T3.DateCreated >= DATETIME('now', '-7 days')
    AND T3.DocumentTypeId = 2;
`;

export function useDb() {
  const [liters, setLiters] = useState(0);
  const [percentage, setPercentage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const processData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      await initDb();
      const dbBuffer = await window.electronAPI.getDbBuffer();

      if (!dbBuffer) {
        throw new Error("Database file not found or could not be read.");
      }

      const db = loadDb(dbBuffer);
      const data = queryData(db, BEER_QUERY);
      db.close();

      let totalMl = 0;
      const volumeRegex = /(\d+)ml/i;

      for (const item of data) {
        const match = item.ItemName.match(volumeRegex);
        if (match && match[1]) {
          const volume = parseInt(match[1], 10);
          totalMl += item.Quantity * volume;
        }
      }

      const totalLiters = totalMl / 1000;
      const calculatedPercentage = Math.min(totalMl / GOAL_ML, 1.0);

      setLiters(totalLiters);
      setPercentage(calculatedPercentage);
    } catch (e: any) {
      console.error("Error processing database:", e);
      setError(e.message);
      setLiters(0);
      setPercentage(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    processData(); // Initial data load
    window.electronAPI.onDbUpdate(processData); // Set up listener for updates
  }, [processData]);

  return { liters, percentage, goal: WEEKLY_GOAL_LITERS, loading, error };
}