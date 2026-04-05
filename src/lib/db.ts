import initSqlJs, { type Database } from "sql.js";

let SQL: any = null;

/**
 * Inicializa el módulo WASM de sql.js.
 * Se utiliza una CDN específica de la versión para garantizar que el archivo .js 
 * y el .wasm coincidan exactamente, evitando errores de instanciación.
 */
export async function initDb(): Promise<void> {
  if (!SQL) {
    try {
      SQL = await initSqlJs({
        // Usamos un CDN con la versión exacta para evitar LinkError por desajustes
        locateFile: (file) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/${file}`,
      });
      console.log("SQL.js motor WASM cargado correctamente.");
    } catch (error) {
      console.error("Error crítico al instanciar WebAssembly para SQL.js:", error);
      throw new Error("No se pudo cargar el motor de base de datos. Por favor, refresca la página.");
    }
  }
}

// Carga la base de datos desde un buffer
export function loadDb(buffer: ArrayBuffer | Uint8Array): Database {
  if (!SQL) {
    throw new Error("SQL.js no ha sido inicializado. Llama a initDb() primero.");
  }
  return new SQL.Database(buffer);
}

// Ejecuta una consulta y devuelve los resultados como un array de objetos
export function queryData(db: Database, query: string): any[] {
  const results = [];
  const stmt = db.prepare(query);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}