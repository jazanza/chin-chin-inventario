import React, { useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, ArrowUp, ArrowDown, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils"; // Importar cn para combinar clases
import { InventoryItem } from "@/context/InventoryContext"; // Importar InventoryItem desde el contexto

interface InventoryTableProps {
  inventoryData: InventoryItem[];
  onInventoryChange: (updatedData: InventoryItem[]) => void;
}

export const InventoryTable = ({ inventoryData, onInventoryChange }: InventoryTableProps) => {
  const [editableInventory, setEditableInventory] = useState<InventoryItem[]>(inventoryData);

  useEffect(() => {
    setEditableInventory(inventoryData);
  }, [inventoryData]);

  const updateInventoryItem = (index: number, key: keyof InventoryItem, value: number | boolean) => {
    const updatedData = [...editableInventory];
    if (key === "physicalQuantity") {
      updatedData[index][key] = Math.max(0, value as number);
      updatedData[index].hasBeenEdited = true; // Marcar como editado
    } else if (key === "averageSales") {
      updatedData[index][key] = value as number;
    } else if (key === "hasBeenEdited") {
      updatedData[index][key] = value as boolean;
    }
    setEditableInventory(updatedData);
    onInventoryChange(updatedData);
  };

  const handlePhysicalQuantityChange = (index: number, value: string) => {
    const newQuantity = parseInt(value, 10);
    updateInventoryItem(index, "physicalQuantity", isNaN(newQuantity) ? 0 : newQuantity);
  };

  const handleAverageSalesChange = (index: number, value: string) => {
    const newAverage = parseInt(value, 10);
    updateInventoryItem(index, "averageSales", isNaN(newAverage) ? 0 : newAverage);
  };

  const handleIncrementPhysicalQuantity = (index: number) => {
    const currentQuantity = editableInventory[index].physicalQuantity;
    updateInventoryItem(index, "physicalQuantity", currentQuantity + 1);
  };

  const handleDecrementPhysicalQuantity = (index: number) => {
    const currentQuantity = editableInventory[index].physicalQuantity;
    updateInventoryItem(index, "physicalQuantity", currentQuantity - 1);
  };

  const formatProductName = (productName: string, category: string) => {
    const beerCategories = [
      'Cervezas', 'Cervezas Belgas', 'Cervezas Alemanas',
      'Cervezas Españolas', 'Cervezas Del Mundo', 'Cervezas 750ml'
    ];
    if (beerCategories.includes(category)) {
      // Regex para eliminar cualquier cantidad de ml (con o sin espacio), "6 Pack" o "125gr" al final del nombre
      return productName.replace(/ - ((\d+ ?ml)|(6 Pack)|(125gr))$/i, '');
    }
    return productName;
  };

  return (
    <div className="overflow-x-auto w-full max-h-[70vh] custom-scrollbar">
      <Table className="min-w-full bg-white text-gray-900 border-collapse">
        <TableHeader className="sticky top-0 bg-white z-10">
          <TableRow className="border-b border-gray-200">
            <TableHead className="text-xs sm:text-sm text-gray-700">Categoría</TableHead>
            <TableHead className="text-xs sm:text-sm text-gray-700">Producto</TableHead>
            <TableHead className="text-xs sm:text-sm text-gray-700 text-center">Cant. Aronium</TableHead>
            <TableHead className="text-xs sm:text-sm text-gray-700">Cant. Real</TableHead>
            <TableHead className="text-xs sm:text-sm text-gray-700 text-center">Acierto / Desacierto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {editableInventory.map((item, index) => {
            const isMatch = item.systemQuantity === item.physicalQuantity;
            const isExcess = item.physicalQuantity > item.systemQuantity;
            const isDeficit = item.physicalQuantity < item.systemQuantity;

            return (
              <TableRow key={item.productId} className="border-b border-gray-100 hover:bg-gray-50">
                <TableCell className="py-2 px-2 text-xs sm:text-sm align-middle">{item.category}</TableCell>
                <TableCell className="py-2 px-2 text-xs sm:text-sm align-middle font-bold">{formatProductName(item.productName, item.category)}</TableCell> {/* Añadido font-bold aquí */}
                <TableCell className="py-2 px-2 text-xs sm:text-sm text-center align-middle">{item.systemQuantity}</TableCell>
                <TableCell className="py-2 px-2 align-middle">
                  <div className="flex items-center space-x-1">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleDecrementPhysicalQuantity(index)}
                      disabled={item.physicalQuantity <= 0}
                      className="h-7 w-7 p-0 text-gray-700 border-gray-300 hover:bg-gray-100"
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Input
                      type="number"
                      value={item.physicalQuantity}
                      onChange={(e) => handlePhysicalQuantityChange(index, e.target.value)}
                      className={cn(
                        "w-full max-w-[4rem] bg-gray-50 text-gray-900 border-gray-300 focus:ring-blue-500 text-center text-xs sm:text-sm",
                        "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      )}
                      min="0"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleIncrementPhysicalQuantity(index)}
                      className="h-7 w-7 p-0 text-gray-700 border-gray-300 hover:bg-gray-100"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="py-2 px-2 flex items-center justify-center align-middle">
                  {item.hasBeenEdited && (
                    <>
                      {isMatch && <Check className="h-4 w-4 text-green-500" />}
                      {isExcess && <ArrowUp className="h-4 w-4 text-red-500" />}
                      {isDeficit && <ArrowDown className="h-4 w-4 text-red-500" />}
                    </>
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