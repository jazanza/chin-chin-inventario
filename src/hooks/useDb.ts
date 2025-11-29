import { useState, useEffect } from "react";
import { initDb, loadDb, queryData } from "@/lib/db";

const WEEKLY_GOAL_LITERS = 500;
const GOAL_ML = WEEKLY_GOAL_LITERS * 1000;

// Esta es la consulta SQL crítica que se ejecutará
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

// Función para crear una base de datos de demostración en memoria
const createDemoDatabase = () => {
  const db = new (window as any).SQL.Database();

  // Crear tablas
  db.run(`
    CREATE TABLE Product (Id INTEGER PRIMARY KEY, Name TEXT);
    CREATE TABLE Document (Id INTEGER PRIMARY KEY, DateCreated TEXT, DocumentTypeId INTEGER);
    CREATE TABLE DocumentItem (Id INTEGER PRIMARY KEY, DocumentId INTEGER, ProductId INTEGER, Quantity REAL);
  `);

  // Insertar datos de muestra
  const products = [
    { id: 1, name: "Erdinger Dunkel - 500ml" },
    { id: 2, name: "Corona Extra - 355ml" },
    { id: 3, name: "Heineken - 330ml" },
    { id: 4, name: "Agua Mineral - 600ml" }, // No es cerveza, no debería ser contada si el nombre no coincide
    { id: 5, name: "Paulaner Weissbier - 500ml" },
  ];

  products.forEach(p => db.run(`INSERT INTO Product VALUES (${p.id}, '${p.name}')`));

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 3);
  const dateStr = sevenDaysAgo.toISOString();

  // Documento de venta
  db.run(`INSERT INTO Document VALUES (1, '${dateStr}', 2)`);
  // Documento de compra (no debe ser contado)
  db.run(`INSERT INTO Document VALUES (2, '${dateStr}', 1)`);

  // Items de venta
  db.run(`INSERT INTO DocumentItem VALUES (1, 1, 1, 150)`); // 150 * 500ml
  db.run(`INSERT INTO DocumentItem VALUES (2, 1, 2, 200)`); // 200 * 355ml
  db.run(`INSERT INTO DocumentItem VALUES (3, 1, 5, 120)`); // 120 * 500ml
  // Item de compra (no debe ser contado)
  db.run(`INSERT INTO DocumentItem VALUES (4, 2, 3, 100)`);

  return db;
};


export function useDb() {
  const [liters, setLiters] = useState(0);
  const [percentage, setPercentage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const processData = async () => {
      try {
        setLoading(true);
        await initDb();

        // --- Integración con Electron ---
        // En una aplicación Electron real, aquí recibirías el ArrayBuffer
        // de la base de datos a través de IPC en lugar de crear una de demostración.
        // Ejemplo:
        // window.electron.ipcRenderer.on('db-file-updated', (event, dbBuffer) => {
        //   const db = loadDb(dbBuffer);
        //   const data = queryData(db, BEER_QUERY);
        //   // ... procesar datos ...
        // });
        const db = createDemoDatabase();
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
        setError(null);
      } catch (e: any) {
        console.error("Error al procesar la base de datos:", e);
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    processData();
  }, []);

  return { liters, percentage, goal: WEEKLY_GOAL_LITERS, loading, error };
}