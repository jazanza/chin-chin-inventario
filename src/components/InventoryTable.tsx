import React, { useMemo, useState, useEffect, useCallback } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, ArrowUp, ArrowDown, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { InventoryItem, useInventoryContext } from "@/context/InventoryContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// --- COMPONENTE DE FILA MEMOIZADO ---
const InventoryRow = React.memo(({ 
  item, 
  onUpdate 
}: { 
  item: InventoryItem, 
  onUpdate: (productId: number, updates: Partial<InventoryItem>) => void 
}) => {
  // Estado local para respuesta instantánea en la UI
  const [localQty, setLocalQty] = useState(item.physicalQuantity);

  // Sincronizar estado local si el item cambia externamente (ej: carga de sesión)
  useEffect(() => {
    setLocalQty(item.physicalQuantity);
  }, [item.physicalQuantity]);

  const handleIncrement = () => {
    const newVal = localQty + 1;
    setLocalQty(newVal);
    onUpdate(item.productId, { physicalQuantity: newVal, hasBeenEdited: true });
  };

  const handleDecrement = () => {
    const newVal = Math.max(0, localQty - 1);
    setLocalQty(newVal);
    onUpdate(item.productId, { physicalQuantity: newVal, hasBeenEdited: true });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = parseInt(e.target.value, 10) || 0;
    setLocalQty(newVal);
    onUpdate(item.productId, { physicalQuantity: newVal, hasBeenEdited: true });
  };

  const isMatch = item.systemQuantity === localQty;
  const isExcess = localQty > item.systemQuantity;
  const isDeficit = localQty < item.systemQuantity;
  const showCheck = isMatch || !item.hasBeenEdited;
  const showArrows = item.hasBeenEdited && (isExcess || isDeficit);

  return (
    <TableRow className="border-b border-gray-100 hover:bg-gray-50">
      <TableCell className="py-2 px-2 text-xs sm:text-sm align-middle font-bold">
        {item.productName}
      </TableCell>
      <TableCell className="py-2 px-2 text-xs sm:text-sm text-center align-middle">
        {item.systemQuantity}
      </TableCell>
      <TableCell className="py-2 px-2 align-middle">
        <div className="flex items-center space-x-1">
          <Button
            variant="outline"
            size="icon"
            onClick={handleDecrement}
            disabled={localQty <= 0}
            className="h-7 w-7 p-0 text-gray-700 border-gray-300 hover:bg-gray-100"
          >
            <Minus className="h-3 w-3" />
          </Button>
          <Input
            type="number"
            value={localQty}
            onChange={handleInputChange}
            className={cn(
              "w-full max-w-[4rem] bg-gray-50 text-gray-900 border-gray-300 focus:ring-blue-500 text-center text-xs sm:text-sm",
              "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            )}
            min="0"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={handleIncrement}
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
});

InventoryRow.displayName = "InventoryRow";

// --- COMPONENTE PRINCIPAL ---
export const InventoryTable = ({ inventoryData }: { inventoryData: InventoryItem[] }) => {
  const { updateAndDebounceSaveInventoryItem } = useInventoryContext();

  // Resumen memoizado para evitar cálculos costosos
  const summary = useMemo(() => {
    let matches = 0;
    let positiveDiscrepancies = 0;
    let negativeDiscrepancies = 0;
    const totalItems = inventoryData.length;

    inventoryData.forEach(item => {
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
  }, [inventoryData]);

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
            {inventoryData.map((item) => (
              <InventoryRow 
                key={item.productId} 
                item={item} 
                onUpdate={updateAndDebounceSaveInventoryItem} 
              />
            ))}
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