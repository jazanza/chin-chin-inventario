import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, ArrowUp, ArrowDown, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { InventoryItem, useInventoryContext } from "@/context/InventoryContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// Eliminado import debounce from "lodash.debounce";

interface InventoryTableProps {
  inventoryData: InventoryItem[];
  onInventoryChange: (updatedData: InventoryItem[]) => void;
}

export const InventoryTable = ({ inventoryData, onInventoryChange }: InventoryTableProps) => {
  const { 
    updateAndDebounceSaveInventoryItem 
  } = useInventoryContext(); 
  const [editableInventory, setEditableInventory] = useState<InventoryItem[]>(inventoryData);

  useEffect(() => {
    // Cuando inventoryData (la lista filtrada del contexto) cambia, actualizamos el estado local
    setEditableInventory(inventoryData);
  }, [inventoryData]);

  // La función de actualización ahora solo llama al contexto con el índice, clave y valor
  const updateItemInContext = useCallback((index: number, key: keyof InventoryItem, value: number | boolean) => {
    updateAndDebounceSaveInventoryItem(index, key, value);
  }, [updateAndDebounceSaveInventoryItem]);

  const handlePhysicalQuantityChange = useCallback((index: number, value: string) => {
    const newQuantity = parseInt(value, 10);
    updateItemInContext(index, "physicalQuantity", isNaN(newQuantity) ? 0 : newQuantity);
  }, [updateItemInContext]);

  // MODIFICADO: Se pasa currentQuantity directamente para evitar stale closures
  const handleIncrementPhysicalQuantity = useCallback((index: number, currentQuantity: number) => {
    updateItemInContext(index, "physicalQuantity", currentQuantity + 1);
  }, [updateItemInContext]);

  // MODIFICADO: Se pasa currentQuantity directamente para evitar stale closures
  const handleDecrementPhysicalQuantity = useCallback((index: number, currentQuantity: number) => {
    updateItemInContext(index, "physicalQuantity", currentQuantity - 1);
  }, [updateItemInContext]);

  const formatProductName = (productName: string) => {
    return productName;
  };

  const summary = useMemo(() => {
    let matches = 0;
    let positiveDiscrepancies = 0;
    let negativeDiscrepancies = 0;
    const totalItems = editableInventory.length;

    editableInventory.forEach(item => {
      if (item.systemQuantity === item.physicalQuantity) {
        matches++;
      } else if (item.physicalQuantity > item.systemQuantity) {
        positiveDiscrepancies++;
      } else {
        negativeDiscrepancies++;
      }
    });

    const effectivenessPercentage = totalItems > 0 ? (matches / totalItems) * 100 : 0;

    return {
      matches,
      positiveDiscrepancies,
      negativeDiscrepancies,
      effectivenessPercentage,
      totalItems,
    };
  }, [editableInventory]);

  return (
    <div className="w-full">
      <div className="overflow-x-auto w-full max-h-[70vh] custom-scrollbar mb-6">
        <Table className="min-w-full bg-white text-gray-900 border-collapse">
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow className="border-b border-gray-200">
              <TableHead className="text-xs sm:text-sm text-gray-700 font-bold">Producto</TableHead>
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
              const showCheck = isMatch || !item.hasBeenEdited;
              const showArrows = item.hasBeenEdited && (isExcess || isDeficit);

              return (
                <TableRow key={item.productId} className="border-b border-gray-100 hover:bg-gray-50">
                  <TableCell className="py-2 px-2 text-xs sm:text-sm align-middle font-bold">{formatProductName(item.productName)}</TableCell>
                  <TableCell className="py-2 px-2 text-xs sm:text-sm text-center align-middle">{item.systemQuantity}</TableCell>
                  <TableCell className="py-2 px-2 align-middle">
                    <div className="flex items-center space-x-1">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleDecrementPhysicalQuantity(index, item.physicalQuantity)} // Pasa la cantidad actual
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
                        onClick={() => handleIncrementPhysicalQuantity(index, item.physicalQuantity)} // Pasa la cantidad actual
                        className="h-7 w-7 p-0 text-gray-700 border-gray-300 hover:bg-gray-100"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="py-2 px-2 flex items-center justify-center align-middle">
                    {showCheck && <Check className="h-4 w-4 text-green-500" />}
                    {showArrows && (
                      <>
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

      <Card className="w-full bg-white text-gray-900 border-gray-200 shadow-md">
        <CardHeader>
          <CardTitle className="text-xl sm:text-2xl text-center text-gray-900">Resumen de Inventario</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-base sm:text-lg">
          <p><strong>Total de Productos:</strong> {summary.totalItems}</p>
          <p><strong>Cantidad de Aciertos:</strong> {summary.matches}</p>
          <p><strong>Cantidad de Desaciertos Positivos:</strong> {summary.positiveDiscrepancies}</p>
          <p><strong>Cantidad de Desaciertos Negativos:</strong> {summary.negativeDiscrepancies}</p>
          <p><strong>Porcentaje de Efectividad en Stock:</strong> {summary.effectivenessPercentage.toFixed(2)}%</p>
        </CardContent>
      </Card>
    </div>
  );
};