import React, { useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, ArrowUp, ArrowDown, Minus, Plus } from "lucide-react"; // 'Download' eliminado

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

  const updateInventoryItem = (index: number, key: keyof InventoryItem, value: number) => {
    const updatedData = [...editableInventory];
    // Asegurarse de que la cantidad física nunca sea menor que cero
    if (key === "physicalQuantity") {
      updatedData[index][key] = Math.max(0, value);
    } else {
      updatedData[index][key] = value;
    }
    setEditableInventory(updatedData);
    onInventoryChange(updatedData);
  };

  const handlePhysicalQuantityChange = (index: number, value: string) => {
    const newQuantity = parseInt(value, 10);
    if (!isNaN(newQuantity) || value === "") {
      updateInventoryItem(index, "physicalQuantity", value === "" ? 0 : newQuantity);
    }
  };

  const handleAverageSalesChange = (index: number, value: string) => {
    const newAverage = parseInt(value, 10);
    if (!isNaN(newAverage) || value === "") {
      updateInventoryItem(index, "averageSales", value === "" ? 0 : newAverage);
    }
  };

  const handleIncrementPhysicalQuantity = (index: number) => {
    const currentQuantity = editableInventory[index].physicalQuantity;
    updateInventoryItem(index, "physicalQuantity", currentQuantity + 1);
  };

  const handleDecrementPhysicalQuantity = (index: number) => {
    const currentQuantity = editableInventory[index].physicalQuantity;
    updateInventoryItem(index, "physicalQuantity", currentQuantity - 1);
  };

  // La función generateCorrectionDocument ha sido eliminada ya que la columna 'Acción' no se usa.

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
            {/* Columna 'Acción' eliminada */}
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
                  <div className="flex items-center space-x-1">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleDecrementPhysicalQuantity(index)}
                      disabled={item.physicalQuantity <= 0}
                      className="h-8 w-8 p-0 text-gray-700 border-gray-300 hover:bg-gray-100"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input
                      type="number"
                      value={item.physicalQuantity === 0 && item.systemQuantity === 0 ? "" : item.physicalQuantity}
                      onChange={(e) => handlePhysicalQuantityChange(index, e.target.value)}
                      className="w-full max-w-[6rem] bg-gray-50 text-gray-900 border-gray-300 focus:ring-blue-500 text-center"
                      min="0"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleIncrementPhysicalQuantity(index)}
                      className="h-8 w-8 p-0 text-gray-700 border-gray-300 hover:bg-gray-100"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="py-2 px-4">
                  {isMatch && <Check className="h-5 w-5 text-green-500" />}
                  {isExcess && <ArrowUp className="h-5 w-5 text-red-500" />}
                  {isDeficit && <ArrowDown className="h-5 w-5 text-red-500" />}
                </TableCell>
                <TableCell className="py-2 px-4">
                  <Input
                    type="number"
                    value={item.averageSales === 0 ? "" : item.averageSales}
                    onChange={(e) => handleAverageSalesChange(index, e.target.value)}
                    className="w-full max-w-[6rem] bg-gray-50 text-gray-900 border-gray-300 focus:ring-blue-500"
                  />
                </TableCell>
                {/* Celda de 'Acción' eliminada */}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};