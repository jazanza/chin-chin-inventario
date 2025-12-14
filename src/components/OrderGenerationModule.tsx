import React, { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Copy, Minus, Plus } from "lucide-react";
import { InventoryItem, useInventoryContext } from "@/context/InventoryContext"; // Importar useInventoryContext
import { showSuccess, showError } from "@/utils/toast";
import { productOrderRules } from "@/lib/order-rules";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface OrderGenerationModuleProps {
  inventoryData: InventoryItem[];
}

// Definir la interfaz para los ítems de pedido con la cantidad final editable
export interface OrderItem { // Exportar para usar en persistence.ts
  product: string;
  quantityToOrder: number; // Cantidad sugerida antes de ajustar por múltiplos
  adjustedQuantity: number; // Cantidad sugerida ajustada por múltiplos
  finalOrderQuantity: number; // Cantidad final que el usuario puede editar
}

export const OrderGenerationModule = ({ inventoryData }: OrderGenerationModuleProps) => {
  const { saveCurrentSession, inventoryType, sessionId, inventoryData: currentInventoryData } = useInventoryContext(); // Obtener del contexto
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [finalOrders, setFinalOrders] = useState<{ [supplier: string]: OrderItem[] }>({});

  // Calcula las órdenes sugeridas (adjustedQuantity) y las inicializa en finalOrders
  const ordersBySupplier = useMemo(() => {
    const orders: { [supplier: string]: OrderItem[] } = {};

    inventoryData.forEach(item => {
      if (!item.supplier) return;

      const rule = productOrderRules.get(item.productName);
      let quantityToOrder = 0;

      if (rule) {
        quantityToOrder = rule(item.physicalQuantity);
      } else {
        quantityToOrder = 0;
      }

      if (quantityToOrder < 0) quantityToOrder = 0;

      let adjustedQuantity = quantityToOrder;

      if (item.multiple && item.multiple > 1) {
        adjustedQuantity = Math.ceil(quantityToOrder / item.multiple) * item.multiple;
      }

      // Incluir el producto en la lista de pedidos del proveedor, independientemente de la cantidad
      if (!orders[item.supplier]) {
        orders[item.supplier] = [];
      }
      orders[item.supplier].push({
        product: item.productName,
        quantityToOrder: Math.round(quantityToOrder),
        adjustedQuantity: Math.round(adjustedQuantity),
        finalOrderQuantity: Math.round(adjustedQuantity), // Inicializar con la cantidad ajustada
      });
    });

    for (const supplier in orders) {
      orders[supplier].sort((a, b) => a.product.localeCompare(b.product));
    }

    return orders;
  }, [inventoryData]);

  // Sincronizar finalOrders con ordersBySupplier cuando inventoryData cambia
  useEffect(() => {
    const initialFinalOrders: { [supplier: string]: OrderItem[] } = {};
    for (const supplier in ordersBySupplier) {
      initialFinalOrders[supplier] = ordersBySupplier[supplier].map(item => ({
        ...item,
        finalOrderQuantity: item.adjustedQuantity,
      }));
    }
    setFinalOrders(initialFinalOrders);
  }, [ordersBySupplier]);

  // Manejar cambios en la cantidad final de pedido
  const handleFinalOrderQuantityChange = (
    supplier: string,
    productName: string,
    value: number
  ) => {
    setFinalOrders(prevOrders => {
      const newOrders = { ...prevOrders };
      if (newOrders[supplier]) {
        const productIndex = newOrders[supplier].findIndex(
          item => item.product === productName
        );
        if (productIndex !== -1) {
          newOrders[supplier][productIndex] = {
            ...newOrders[supplier][productIndex],
            finalOrderQuantity: Math.max(0, value), // Asegurar que no sea negativo
          };
        }
      }
      // Guardar la sesión con los pedidos actualizados
      if (sessionId && inventoryType && currentInventoryData) {
        saveCurrentSession(currentInventoryData, inventoryType, new Date(), newOrders);
      }
      return newOrders;
    });
  };

  // Lógica para el resumen de cajas de Belbier
  const belbierSummary = useMemo(() => {
    if (selectedSupplier === "Belbier" && finalOrders["Belbier"]) {
      const totalFinalOrderQuantity = finalOrders["Belbier"].reduce((sum, order) => sum + order.finalOrderQuantity, 0);
      const unitsPerBox = 24;
      const totalBoxes = Math.floor(totalFinalOrderQuantity / unitsPerBox);
      const remainingUnits = totalFinalOrderQuantity % unitsPerBox;
      const missingUnits = remainingUnits > 0 ? unitsPerBox - remainingUnits : 0;

      return {
        totalFinalOrderQuantity,
        totalBoxes,
        remainingUnits,
        missingUnits,
      };
    }
    return null;
  }, [selectedSupplier, finalOrders]);

  const copyOrderToClipboard = async (supplier: string) => {
    const supplierOrders = finalOrders[supplier]; // Usar finalOrders para copiar
    if (!supplierOrders || supplierOrders.length === 0) {
      showError(`No hay pedidos para el proveedor ${supplier} para copiar.`);
      return;
    }

    let orderText = "Buenos días, por favor para que nos ayuden con:\n\n";
    supplierOrders.forEach(order => {
      if (order.finalOrderQuantity > 0) {
        orderText += `- ${order.product} x ${order.finalOrderQuantity} u.\n`;
      }
    });
    orderText += "\nMuchas gracias.";

    try {
      await navigator.clipboard.writeText(orderText);
      showSuccess(`Pedido para ${supplier} copiado al portapapeles.`);

      // Guardar los pedidos en la sesión actual
      if (sessionId && inventoryType && currentInventoryData) {
        await saveCurrentSession(currentInventoryData, inventoryType, new Date(), finalOrders);
        showSuccess('Pedidos guardados en la sesión.');
      }
    } catch (err) {
      console.error("Error al copiar el pedido:", err);
      showError("Error al copiar el pedido. Por favor, inténtalo de nuevo.");
    }
  };

  const suppliers = Object.keys(ordersBySupplier).sort();

  return (
    <div className="w-full mt-8 p-4 bg-white text-gray-900 border border-gray-200 rounded-lg shadow-md">
      <h2 className="text-lg sm:text-xl font-bold mb-4 text-gray-900">Generación de Pedidos</h2>

      {suppliers.length === 0 ? (
        <p className="text-gray-500 text-sm sm:text-base">No hay pedidos generados para ningún proveedor.</p>
      ) : (
        <>
          {/* Módulo "Seleccionar Proveedor" */}
          <Card className="mb-8 bg-white text-gray-900 border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base sm:text-lg font-semibold text-gray-900">Seleccionar Proveedor</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid w-full grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {suppliers.map(supplier => (
                  <Button
                    key={supplier}
                    onClick={() => setSelectedSupplier(supplier)}
                    className={cn(
                      "text-gray-700 hover:bg-gray-200 text-xs sm:text-sm",
                      selectedSupplier === supplier ? "bg-blue-600 text-white font-bold hover:bg-blue-700" : "bg-gray-100 hover:text-gray-900"
                    )}
                  >
                    {supplier}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Módulo "Detalle del Pedido" - Condicionalmente renderizado */}
          {selectedSupplier && finalOrders[selectedSupplier] && (
            <Card className="bg-white text-gray-900 border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base sm:text-lg font-semibold text-gray-900">Detalle del Pedido</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 flex-1 min-w-0 break-words">{`Pedido para ${selectedSupplier}`}</h3>
                  <Button
                    onClick={() => copyOrderToClipboard(selectedSupplier)}
                    variant="outline"
                    size="sm"
                    className="text-blue-600 border-blue-600 hover:bg-blue-600 hover:text-white text-sm flex-shrink-0"
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Copiar Pedido
                  </Button>
                </div>

                <div className="overflow-x-auto custom-scrollbar">
                  <Table className="min-w-full bg-gray-50 text-gray-900 border-collapse">
                    <TableHeader>
                      <TableRow className="border-b border-gray-200">
                        <TableHead className="text-xs sm:text-sm text-gray-700">Producto</TableHead>
                        <TableHead className="text-xs sm:text-sm text-gray-700 text-center">Sugerencia</TableHead> {/* Centrado */}
                        <TableHead className="text-xs sm:text-sm text-gray-700">Pedir</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {finalOrders[selectedSupplier].map((order, idx) => (
                        <TableRow key={idx} className="border-b border-gray-100 hover:bg-gray-100">
                          <TableCell className="py-2 px-2 text-xs sm:text-sm">{order.product}</TableCell>
                          <TableCell className="py-2 px-2 text-xs sm:text-sm text-center">{order.adjustedQuantity}</TableCell> {/* Centrado */}
                          <TableCell className="py-2 px-2 align-middle">
                            <div className="flex items-center space-x-1">
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleFinalOrderQuantityChange(selectedSupplier, order.product, order.finalOrderQuantity - 1)}
                                disabled={order.finalOrderQuantity <= 0}
                                className="h-7 w-7 p-0 text-gray-700 border-gray-300 hover:bg-gray-100"
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <Input
                                type="number"
                                value={order.finalOrderQuantity}
                                onChange={(e) => handleFinalOrderQuantityChange(selectedSupplier, order.product, parseInt(e.target.value, 10) || 0)}
                                className={cn(
                                  "w-full max-w-[4rem] bg-gray-50 text-gray-900 border-gray-300 focus:ring-blue-500 text-center text-xs sm:text-sm",
                                  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                )}
                                min="0"
                              />
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleFinalOrderQuantityChange(selectedSupplier, order.product, order.finalOrderQuantity + 1)}
                                className="h-7 w-7 p-0 text-gray-700 border-gray-300 hover:bg-gray-100"
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Leyenda especial para Belbier */}
                {selectedSupplier === "Belbier" && belbierSummary && (
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-800">
                    <p className="font-semibold">Resumen para Belbier:</p>
                    <p>Total de unidades a pedir: {belbierSummary.totalFinalOrderQuantity}</p>
                    <p>Equivalente a: {belbierSummary.totalBoxes} cajas completas.</p>
                    {belbierSummary.missingUnits > 0 && (
                      <p className="text-red-600">
                        ¡Atención! Faltan {belbierSummary.missingUnits} unidades para completar la siguiente caja de 24.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};