import { DateRange } from "react-day-picker";
import { format } from "date-fns";

interface IElectronAPI {
  openDbFile: (): Promise<Uint8Array | null>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}

const EXCLUDED_CUSTOMERS = ["Maria Fernanda Azanza Arias", "Jose Azanza Arias", "Enrique Cobo", "Juan Francisco Perez", "Islas Boutique"];

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

// El hook useDb ha sido eliminado ya que su funcionalidad ahora se maneja directamente con useInventoryContext.
// Las interfaces InventoryItem e InventoryItemFromDB se han movido a src/context/InventoryContext.tsx.