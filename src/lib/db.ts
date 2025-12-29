import initSqlJs, { type Database } from "sql.js";

let SQL: any = null;

// Initializes the sql.js WASM module
export async function initDb(): Promise<void> {
  if (!SQL) {
    SQL = await initSqlJs({
      locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
    });
  }
}

// Loads the database from a buffer
export function loadDb(buffer: ArrayBuffer | Uint8Array): Database {
  if (!SQL) {
    throw new Error("SQL.js has not been initialized. Call initDb() first.");
  }
  return new SQL.Database(buffer);
}

// Executes a query and returns the results as an array of objects
export function queryData(db: Database, query: string): any[] {
  const results = [];
  const stmt = db.prepare(query);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}