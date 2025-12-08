import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Copy } from "lucide-react";
import { InventoryItem } from "@/context/InventoryContext";
import { showSuccess, showError } from "@/utils/toast";
import { productOrderRules } from "@/lib/order-rules";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils"; // Importar cn para combinar clases

interface OrderGenerationModuleProps {
  inventoryData: InventoryItem[];
}

export const OrderGenerationModule = ({ inventoryData }: OrderGenerationModuleProps) => {
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null); // Estado para gestionar el proveedor seleccionado

  const ordersBySupplier = useMemo(() => {
    const orders: { [supplier: string]: { product: string; quantityToOrder: number; adjustedQuantity: number; boxes: number }[] } = {};

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
      let boxes = 0;

      if (item.multiple && item.multiple > 1) {
        adjustedQuantity = Math.ceil(quantityToOrder / item.multiple) * item.multiple;
        boxes = adjustedQuantity / item.multiple;
      } else {
        boxes = adjustedQuantity;
      }

      if (adjustedQuantity > 0) {
        if (!orders[item.supplier]) {
          orders[item.supplier] = [];
        }
        orders[item.supplier].push({
          product: item.productName,
          quantityToOrder: Math.round(quantityToOrder),
          adjustedQuantity: Math.round(adjustedQuantity),
          boxes: Math.round(boxes)
        });
      }
    });

    for (const supplier in orders) {
      orders[supplier].sort((a, b) => a.product.localeCompare(b.product));
    }

    return orders;
  }, [inventoryData]);

  const copyOrderToClipboard = async (supplier: string) => {
    const supplierOrders = ordersBySupplier[supplier];
    if (!supplierOrders || supplierOrders.length === 0) {
      showError(`No hay pedidos para el proveedor ${supplier} para copiar.`);
      return;
    }

    let orderText = "Buenos días, por favor para que nos ayuden con:\n\n";
    supplierOrders.forEach(order => {
      orderText += `- ${order.product} x ${order.adjustedQuantity} u.\n`;
    });
    orderText += "\nMuchas gracias.";

    try {
      await navigator.clipboard.writeText(orderText);
      showSuccess(`Pedido para ${supplier} copiado al portapapeles.`);
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
          {selectedSupplier && ordersBySupplier[selectedSupplier] && (
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
                        <TableHead className="text-xs sm:text-sm text-gray-700">Cant. a Pedir</TableHead>
                        <TableHead className="text-xs sm:text-sm text-gray-700">Cajas/Unidades</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ordersBySupplier[selectedSupplier].map((order, idx) => (
                        <TableRow key={idx} className="border-b border-gray-100 hover:bg-gray-100">
                          <TableCell className="py-2 px-2 text-xs sm:text-sm">{order.product}</TableCell>
                          <TableCell className="py-2 px-2 text-xs sm:text-sm">{order.adjustedQuantity}</TableCell>
                          <TableCell className="py-2 px-2 text-xs sm:text-sm">{order.boxes}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};