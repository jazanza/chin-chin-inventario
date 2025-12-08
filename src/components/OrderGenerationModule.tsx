import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";
import { InventoryItem } from "@/context/InventoryContext";
import { showSuccess } from "@/utils/toast";
import { productOrderRules } from "@/lib/order-rules"; // Importar las reglas de pedido

interface OrderGenerationModuleProps {
  inventoryData: InventoryItem[];
}

export const OrderGenerationModule = ({ inventoryData }: OrderGenerationModuleProps) => {
  const ordersBySupplier = useMemo(() => {
    const orders: { [supplier: string]: { product: string; quantityToOrder: number; adjustedQuantity: number; boxes: number }[] } = {};

    inventoryData.forEach(item => {
      if (!item.supplier) return;

      const rule = productOrderRules.get(item.productName);
      let quantityToOrder = 0;

      if (rule) {
        quantityToOrder = rule(item.physicalQuantity);
      } else {
        // Si no hay una regla específica, no se pide por defecto.
        // Si se quisiera una lógica de fallback (ej. basada en averageSales), se implementaría aquí.
        quantityToOrder = 0; 
      }
      
      if (quantityToOrder < 0) quantityToOrder = 0; // Asegurar que no se pidan cantidades negativas

      let adjustedQuantity = quantityToOrder;
      let boxes = 0;

      if (item.multiple && item.multiple > 1) {
        adjustedQuantity = Math.ceil(quantityToOrder / item.multiple) * item.multiple;
        boxes = adjustedQuantity / item.multiple;
      } else {
        boxes = adjustedQuantity; // Si multiple es 1, las unidades son cajas
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

    // Ordenar productos dentro de cada proveedor
    for (const supplier in orders) {
      orders[supplier].sort((a, b) => a.product.localeCompare(b.product));
    }

    return orders;
  }, [inventoryData]);

  const exportOrder = (supplier: string) => {
    const supplierOrders = ordersBySupplier[supplier];
    if (!supplierOrders || supplierOrders.length === 0) {
      showSuccess(`No hay pedidos para el proveedor ${supplier}.`);
      return;
    }

    let csvContent = "Producto,Cantidad a Pedir Ajustada,Cajas/Unidades Ajustadas\n";
    supplierOrders.forEach(order => {
      csvContent += `${order.product},${order.adjustedQuantity},${order.boxes}\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Pedido_${supplier.replace(/\s/g, "_")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showSuccess(`Pedido para ${supplier} exportado.`);
  };

  const suppliers = Object.keys(ordersBySupplier).sort();

  return (
    <div className="w-full mt-8 p-4 bg-white text-gray-900 border border-gray-200 rounded-lg shadow-md">
      <h2 className="text-lg sm:text-xl font-bold mb-4 text-gray-900">Generación de Pedidos</h2>
      
      {/* El input de Semanas de Stock Objetivo se ha eliminado ya que la lógica ahora es por producto */}

      {suppliers.length === 0 ? (
        <p className="text-gray-500 text-sm sm:text-base">No hay pedidos generados para ningún proveedor.</p>
      ) : (
        <Tabs defaultValue={suppliers[0]} className="w-full">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 lg:grid-cols-6 bg-gray-100 border-b border-gray-200">
            {suppliers.map(supplier => (
              <TabsTrigger
                key={supplier}
                value={supplier}
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:font-bold text-gray-700 hover:bg-gray-200 text-xs sm:text-sm"
              >
                {supplier}
              </TabsTrigger>
            ))}
          </TabsList>
          
          {suppliers.map(supplier => (
            <TabsContent key={supplier} value={supplier} className="mt-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900">{`Pedido para ${supplier}`}</h3>
                <Button
                  onClick={() => exportOrder(supplier)}
                  variant="outline"
                  size="sm"
                  className="text-blue-600 border-blue-600 hover:bg-blue-600 hover:text-white text-sm"
                >
                  <Download className="h-4 w-4 mr-1" />
                  Exportar Pedido
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
                    {ordersBySupplier[supplier].map((order, idx) => (
                      <TableRow key={idx} className="border-b border-gray-100 hover:bg-gray-100">
                        <TableCell className="py-2 px-2 text-xs sm:text-sm">{order.product}</TableCell>
                        <TableCell className="py-2 px-2 text-xs sm:text-sm">{order.adjustedQuantity}</TableCell>
                        <TableCell className="py-2 px-2 text-xs sm:text-sm">{order.boxes}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
};