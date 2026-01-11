import React, { useState, useMemo, useEffect } from "react";
import { useInventoryContext, InventoryItem } from "@/context/InventoryContext";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Trash2 } from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";

const SettingsPage = () => {
  const {
    inventoryData,
    productRules,
    saveProductRule,
    deleteProductRule,
    setInventoryData, // Para actualizar el proveedor en inventoryData
    loading,
  } = useInventoryContext();

  // Estado local para las reglas que se están editando
  const [editableRules, setEditableRules] = useState<{
    [productName: string]: { minStock: number; orderAmount: number; supplier: string };
  }>({});

  // Inicializar editableRules cuando inventoryData o productRules cambian
  useEffect(() => {
    const initialRules: {
      [productName: string]: { minStock: number; orderAmount: number; supplier: string };
    } = {};
    inventoryData.forEach((item) => {
      const existingRule = productRules.find((rule) => rule.productName === item.productName);
      initialRules[item.productName] = {
        minStock: existingRule?.minStock ?? 0,
        orderAmount: existingRule?.orderAmount ?? 0,
        supplier: item.supplier, // Usar el proveedor actual del inventario
      };
    });
    setEditableRules(initialRules);
  }, [inventoryData, productRules]);

  // Agrupar productos por proveedor
  const productsGroupedBySupplier = useMemo(() => {
    const grouped: { [supplier: string]: InventoryItem[] } = {};
    inventoryData.forEach((item) => {
      if (!grouped[item.supplier]) {
        grouped[item.supplier] = [];
      }
      grouped[item.supplier].push(item);
    });
    // Ordenar productos alfabéticamente dentro de cada grupo
    for (const supplier in grouped) {
      grouped[supplier].sort((a, b) => a.productName.localeCompare(b.productName));
    }
    return grouped;
  }, [inventoryData]);

  // Obtener todos los proveedores únicos para el selector
  const allSuppliers = useMemo(() => {
    const suppliers = new Set<string>();
    inventoryData.forEach(item => suppliers.add(item.supplier));
    return Array.from(suppliers).sort();
  }, [inventoryData]);

  const handleRuleChange = (
    productName: string,
    field: "minStock" | "orderAmount" | "supplier",
    value: string | number
  ) => {
    setEditableRules((prev) => {
      const newRules = { ...prev };
      if (!newRules[productName]) {
        newRules[productName] = { minStock: 0, orderAmount: 0, supplier: "" };
      }

      if (field === "supplier") {
        newRules[productName].supplier = value as string;
      } else {
        newRules[productName][field] = parseInt(value as string, 10) || 0;
      }
      return newRules;
    });
  };

  const handleSaveRule = async (productName: string) => {
    const ruleToSave = editableRules[productName];
    if (ruleToSave) {
      await saveProductRule({
        productName,
        minStock: ruleToSave.minStock,
        orderAmount: ruleToSave.orderAmount,
      });

      // Si el proveedor ha cambiado, actualizar inventoryData en el contexto
      const currentItem = inventoryData.find(item => item.productName === productName);
      if (currentItem && currentItem.supplier !== ruleToSave.supplier) {
        const updatedInventory = inventoryData.map(item =>
          item.productName === productName
            ? { ...item, supplier: ruleToSave.supplier }
            : item
        );
        setInventoryData(updatedInventory);
        showSuccess(`Proveedor de ${productName} actualizado.`);
      }
    }
  };

  const handleDeleteRule = async (productName: string) => {
    await deleteProductRule(productName);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-4">
        <p className="text-base sm:text-lg text-center text-gray-700">Cargando configuración...</p>
      </div>
    );
  }

  if (inventoryData.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        Por favor, carga un archivo de base de datos y selecciona un tipo de inventario para configurar las reglas.
      </div>
    );
  }

  return (
    <div className="w-full p-4 bg-white text-gray-900">
      <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-6 text-gray-900">Configuración de Pedidos</h1>

      <Card className="mb-8 bg-white text-gray-900 border-gray-200 shadow-md">
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl font-semibold text-gray-900">Reglas de Pedido por Producto</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            {Object.entries(productsGroupedBySupplier).map(([supplier, products]) => (
              <AccordionItem key={supplier} value={supplier} className="border-b border-gray-200">
                <AccordionTrigger className="flex justify-between items-center py-3 px-4 text-base sm:text-lg font-semibold text-gray-800 hover:bg-gray-50">
                  {supplier} ({products.length} productos)
                </AccordionTrigger>
                <AccordionContent className="p-4 bg-gray-50">
                  <div className="overflow-x-auto custom-scrollbar">
                    <Table className="min-w-full bg-white text-gray-900 border-collapse">
                      <TableHeader>
                        <TableRow className="border-b border-gray-200">
                          <TableHead className="text-xs sm:text-sm text-gray-700">Producto</TableHead>
                          <TableHead className="text-xs sm:text-sm text-gray-700 text-center">Stock Actual</TableHead>
                          <TableHead className="text-xs sm:text-sm text-gray-700">Stock Mínimo</TableHead>
                          <TableHead className="text-xs sm:text-sm text-gray-700">Cant. a Pedir</TableHead>
                          <TableHead className="text-xs sm:text-sm text-gray-700">Proveedor</TableHead>
                          <TableHead className="text-xs sm:text-sm text-gray-700 text-center">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {products.map((item) => (
                          <TableRow key={item.productName} className="border-b border-gray-100 hover:bg-gray-100">
                            <TableCell className="py-2 px-2 text-xs sm:text-sm font-medium">{item.productName}</TableCell>
                            <TableCell className="py-2 px-2 text-xs sm:text-sm text-center">{item.systemQuantity}</TableCell>
                            <TableCell className="py-2 px-2">
                              <Input
                                type="number"
                                value={editableRules[item.productName]?.minStock ?? 0}
                                onChange={(e) => handleRuleChange(item.productName, "minStock", e.target.value)}
                                className="w-20 text-center text-xs sm:text-sm"
                                min="0"
                              />
                            </TableCell>
                            <TableCell className="py-2 px-2">
                              <Input
                                type="number"
                                value={editableRules[item.productName]?.orderAmount ?? 0}
                                onChange={(e) => handleRuleChange(item.productName, "orderAmount", e.target.value)}
                                className="w-20 text-center text-xs sm:text-sm"
                                min="0"
                              />
                            </TableCell>
                            <TableCell className="py-2 px-2">
                              <Select
                                value={editableRules[item.productName]?.supplier ?? item.supplier}
                                onValueChange={(value) => handleRuleChange(item.productName, "supplier", value)}
                              >
                                <SelectTrigger className="w-[120px] text-xs sm:text-sm">
                                  <SelectValue placeholder="Seleccionar proveedor" />
                                </SelectTrigger>
                                <SelectContent>
                                  {allSuppliers.map(sup => (
                                    <SelectItem key={sup} value={sup}>
                                      {sup}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="py-2 px-2 text-center space-x-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleSaveRule(item.productName)}
                                className="text-blue-600 border-blue-600 hover:bg-blue-600 hover:text-white h-7 w-7 p-0"
                              >
                                <Save className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDeleteRule(item.productName)}
                                className="h-7 w-7 p-0"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;