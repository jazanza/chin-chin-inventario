import React, { useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, ArrowUp, ArrowDown, Download } from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";

export interface InventoryItem {
  productId: number;
  productName: string;
  category: string;
  systemQuantity: number;
  physicalQuantity: number;
  averageSales: number;
  supplier: string;
  multiple: number;
}

interface InventoryTableProps {
  inventoryData: InventoryItem[];
  onInventoryChange: (updatedData: InventoryItem[]) => void;
}

export const InventoryTable = ({ inventoryData, onInventoryChange }: InventoryTableProps) => {
  const [editableInventory, setEditableInventory] = useState<InventoryItem[]>(inventoryData);

  useEffect(() => {
    setEditableInventory(inventoryData);
  }, [inventoryData]);

  const handlePhysicalQuantityChange = (index: number, value: string) => {
    const newQuantity = parseInt(value, 10);
    if (!isNaN(newQuantity) || value === "") {
      const updatedData = [...editableInventory];
      updatedData[index].physicalQuantity = value === "" ? 0 : newQuantity;
      setEditableInventory(updatedData);
      onInventoryChange(updatedData);
    }
  };

  const handleAverageSalesChange = (index: number, value: string) => {
    const newAverage = parseInt(value, 10);
    if (!isNaN(newAverage) || value === "") {
      const updatedData = [...editableInventory];
      updatedData[index].averageSales = value === "" ? 0 : newAverage;
      setEditableInventory(updatedData);
      onInventoryChange(updatedData);
    }
  };

  const generateCorrectionDocument = (item: InventoryItem) => {
    const difference = item.physicalQuantity - item.systemQuantity;
    if (difference === 0) {
      showError(`No hay desacierto para ${item.productName}.`);
      return;
    }

    const correctionType = difference > 0 ? "Entrada" : "Salida";
    const fileName = `Correccion_${item.productName.replace(/\s/g, "_")}.txt`;
    const content = `Producto: ${item.productName}\nCategoría: ${item.category}\nTipo de Corrección: ${correctionType}\nCantidad: ${Math.abs(difference)}\nStock Sistema: ${item.systemQuantity}\nStock Físico: ${item.physicalQuantity}`;

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showSuccess(`Documento de corrección para ${item.productName} generado.`);
  };

  return (
    <div className="overflow-x-auto w-full max-h-[70vh] custom-scrollbar">
      <Table className="min-w-full bg-white text-gray-900 border-collapse">
        <TableHeader className="sticky top-0 bg-white z-10">
          <TableRow className="border-b border-gray-200">
            <TableHead className="text-gray-700">Categoría</TableHead>
            <TableHead className="text-gray-700">Producto</TableHead>
            <TableHead className="text-gray-700">Cant. Sistema</TableHead>
            <TableHead className="text-gray-700">Cant. Física Real</TableHead>
            <TableHead className="text-gray-700">Acierto / Desacierto</TableHead>
            <TableHead className="text-gray-700">Promedio Ventas</TableHead>
            <TableHead className="text-gray-700">Acción</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {editableInventory.map((item, index) => {
            const isMatch = item.systemQuantity === item.physicalQuantity;
            const isExcess = item.physicalQuantity > item.systemQuantity;
            const isDeficit = item.physicalQuantity < item.systemQuantity;

            return (
              <TableRow key={item.productId} className="border-b border-gray-100 hover:bg-gray-50">
                <TableCell className="py-2 px-4">{item.category}</TableCell>
                <TableCell className="py-2 px-4">{item.productName}</TableCell>
                <TableCell className="py-2 px-4">{item.systemQuantity}</TableCell>
                <TableCell className="py-2 px-4">
                  <Input
                    type="number"
                    value={item.physicalQuantity === 0 && item.systemQuantity === 0 ? "" : item.physicalQuantity}
                    onChange={(e) => handlePhysicalQuantityChange(index, e.target.value)}
                    className="w-24 bg-gray-50 text-gray-900 border-gray-300 focus:ring-blue-500"
                  />
                </TableCell>
                <TableCell className="py-2 px-4">
                  {isMatch && <Check className="h-5 w-5 text-green-500" />}
                  {isExcess && <ArrowUp className="h-5 w-5 text-red-500" />} {/* Cambiado a rojo */}
                  {isDeficit && <ArrowDown className="h-5 w-5 text-red-500" />}
                </TableCell>
                <TableCell className="py-2 px-4">
                  <Input
                    type="number"
                    value={item.averageSales === 0 ? "" : item.averageSales}
                    onChange={(e) => handleAverageSalesChange(index, e.target.value)}
                    className="w-24 bg-gray-50 text-gray-900 border-gray-300 focus:ring-blue-500"
                  />
                </TableCell>
                <TableCell className="py-2 px-4">
                  {!isMatch && (
                    <Button
                      onClick={() => generateCorrectionDocument(item)}
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-600 hover:bg-red-600 hover:text-white"
                    >
                      <Download className="h-4 w-4 mr-1" /> Corrección
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};