import initSqlJs, { type Database } from "sql.js";

let SQL: any = null;

// Inicializa el módulo WASM de sql.js
export async function initDb(): Promise<void> {
  if (!SQL) {
    SQL = await initSqlJs({
      locateFile: (file) => `https://sql.js.org/dist/${file}`,
    });
  }
}

// Carga la base de datos desde un buffer
export function loadDb(buffer: ArrayBuffer | Uint8Array): Database {
  if (!SQL) {
    throw new Error("SQL.js no ha sido inicializado. Llama a initDb() primero.");
  }
  return new SQL.Database(buffer);
}

// Ejecuta una consulta y devuelve los resultados
export function queryData(db: Database, query: string): any[] {
  const results = [];
  const stmt = db.prepare(query);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}