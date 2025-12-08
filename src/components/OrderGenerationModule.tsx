import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";
import { InventoryItem } from "./InventoryTable";
import { showSuccess } from "@/utils/toast";

interface OrderGenerationModuleProps {
  inventoryData: InventoryItem[];
}

export const OrderGenerationModule = ({ inventoryData }: OrderGenerationModuleProps) => {
  const [targetWeeksOfStock, setTargetWeeksOfStock] = useState<number>(3); // Default to 3 weeks

  const ordersBySupplier = useMemo(() => {
    const orders: { [supplier: string]: { product: string; quantityToOrder: number; adjustedQuantity: number; boxes: number }[] } = {};

    inventoryData.forEach(item => {
      if (!item.supplier) return;

      const targetStock = item.averageSales * targetWeeksOfStock;
      let quantityToOrder = targetStock - item.physicalQuantity;

      if (quantityToOrder < 0) quantityToOrder = 0; // Don't order if already over stock

      let adjustedQuantity = quantityToOrder;
      let boxes = 0;

      if (item.multiple && item.multiple > 1) {
        adjustedQuantity = Math.ceil(quantityToOrder / item.multiple) * item.multiple;
        boxes = adjustedQuantity / item.multiple;
      } else {
        boxes = adjustedQuantity; // If multiple is 1, units are boxes
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

    // Sort products within each supplier
    for (const supplier in orders) {
      orders[supplier].sort((a, b) => a.product.localeCompare(b.product));
    }

    return orders;
  }, [inventoryData, targetWeeksOfStock]);

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
    <div className="w-full mt-8 p-4 bg-black text-white border border-secondary-glitch-cyan rounded-lg shadow-glitch">
      <h2 className="text-2xl font-bold mb-4 text-[var(--secondary-glitch-cyan)]">Generación de Pedidos</h2>

      <div className="mb-4 flex items-center gap-4">
        <label htmlFor="targetWeeks" className="text-lg">Semanas de Stock Objetivo:</label>
        <Input
          id="targetWeeks"
          type="number"
          value={targetWeeksOfStock}
          onChange={(e) => setTargetWeeksOfStock(parseInt(e.target.value, 10) || 0)}
          className="w-24 bg-gray-800 text-white border-primary-glitch-pink focus:ring-primary-glitch-pink"
          min="0"
        />
      </div>

      {suppliers.length === 0 ? (
        <p className="text-gray-400">No hay pedidos generados para ningún proveedor.</p>
      ) : (
        <Tabs defaultValue={suppliers[0]} className="w-full">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 lg:grid-cols-6 bg-gray-900 border-b border-primary-glitch-pink">
            {suppliers.map(supplier => (
              <TabsTrigger
                key={supplier}
                value={supplier}
                className="data-[state=active]:bg-[var(--primary-glitch-pink)] data-[state=active]:text-black data-[state=active]:font-bold text-white hover:bg-gray-700"
              >
                {supplier}
              </TabsTrigger>
            ))}
          </TabsList>
          {suppliers.map(supplier => (
            <TabsContent key={supplier} value={supplier} className="mt-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-[var(--primary-glitch-pink)]">{`Pedido para ${supplier}`}</h3>
                <Button
                  onClick={() => exportOrder(supplier)}
                  variant="outline"
                  size="sm"
                  className="text-[var(--secondary-glitch-cyan)] border-[var(--secondary-glitch-cyan)] hover:bg-[var(--secondary-glitch-cyan)] hover:text-black"
                >
                  <Download className="h-4 w-4 mr-1" /> Exportar Pedido
                </Button>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <Table className="min-w-full bg-gray-900 text-white border-collapse">
                  <TableHeader>
                    <TableRow className="border-b border-secondary-glitch-cyan">
                      <TableHead className="text-[var(--primary-glitch-pink)]">Producto</TableHead>
                      <TableHead className="text-[var(--primary-glitch-pink)]">Cant. Original</TableHead>
                      <TableHead className="text-[var(--primary-glitch-pink)]">Cant. Ajustada</TableHead>
                      <TableHead className="text-[var(--primary-glitch-pink)]">Cajas/Unidades</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ordersBySupplier[supplier].map((order, idx) => (
                      <TableRow key={idx} className="border-b border-gray-800 hover:bg-gray-700">
                        <TableCell className="py-2 px-4">{order.product}</TableCell>
                        <TableCell className="py-2 px-4">{order.quantityToOrder}</TableCell>
                        <TableCell className="py-2 px-4">{order.adjustedQuantity}</TableCell>
                        <TableCell className="py-2 px-4">{order.boxes}</TableCell>
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