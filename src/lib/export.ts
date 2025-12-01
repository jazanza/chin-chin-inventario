import * as XLSX from 'xlsx';
import { DateRange } from 'react-day-picker';

interface ExportData {
  consumptionMetrics: { liters: number };
  flavorData: { [key: string]: number };
  varietyMetrics: { totalLiters: number; uniqueProducts: number };
  loyaltyMetrics: { topCustomers: { name: string; liters: number }[] };
  rankedBeers: { name: string; liters: number; color: string }[];
}

export const exportToExcel = (data: ExportData, dateRange: DateRange | undefined) => {
  // 1. Create Summary Sheet
  const summaryData = [
    { Métrica: "Litros Totales Vendidos", Valor: data.consumptionMetrics.liters.toFixed(2) },
    { Métrica: "Productos Únicos Vendidos", Valor: data.varietyMetrics.uniqueProducts },
    { Métrica: "Fecha de Inicio", Valor: dateRange?.from ? dateRange.from.toLocaleDateString() : 'N/A' },
    { Métrica: "Fecha de Fin", Valor: dateRange?.to ? dateRange.to.toLocaleDateString() : 'N/A' },
  ];
  const summaryWs = XLSX.utils.json_to_sheet(summaryData);

  // 2. Create Beer Ranking Sheet
  const rankedBeersData = data.rankedBeers.map(beer => ({
    "Cerveza": beer.name,
    "Litros Vendidos": parseFloat(beer.liters.toFixed(2)),
  }));
  const rankedBeersWs = XLSX.utils.json_to_sheet(rankedBeersData);

  // 3. Create Customer Loyalty Sheet
  const loyaltyData = data.loyaltyMetrics.topCustomers.map(customer => ({
    "Cliente": customer.name,
    "Litros Consumidos": parseFloat(customer.liters.toFixed(2)),
  }));
  const loyaltyWs = XLSX.utils.json_to_sheet(loyaltyData);

  // 4. Create Flavor Spectrum Sheet
  const flavorData = Object.entries(data.flavorData).map(([category, ml]) => ({
    "Categoría de Sabor": category,
    "Litros Vendidos": parseFloat((ml / 1000).toFixed(2)),
  })).sort((a, b) => b["Litros Vendidos"] - a["Litros Vendidos"]);
  const flavorWs = XLSX.utils.json_to_sheet(flavorData);

  // Create Workbook and add sheets
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, summaryWs, "Resumen General");
  XLSX.utils.book_append_sheet(wb, rankedBeersWs, "Ranking de Cervezas");
  XLSX.utils.book_append_sheet(wb, loyaltyWs, "Top 5 Clientes");
  XLSX.utils.book_append_sheet(wb, flavorWs, "Espectro de Sabores");

  // Trigger download
  XLSX.writeFile(wb, "Analisis_Cerveceria.xlsx");
};