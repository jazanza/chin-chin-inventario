import React, { useState, useMemo, useEffect, useCallback } from "react";
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
import { Loader2, CheckCircle, XCircle, Trash2 } from "lucide-react"; // Importar iconos
import { showSuccess, showError } from "@/utils/toast";
import { cn } from "@/lib/utils"; // Para combinar clases de Tailwind

const SettingsPage = () => {
  const {
    inventoryData,
    productRules,
    saveProductRule,
    deleteProductRule,
    setInventoryData,
    saveCurrentSession, // Necesario para guardar cambios de proveedor en la sesión
    sessionId,
    inventoryType,
    loading,
  } = useInventoryContext();

  // Estado local para las reglas que se están editando
  const [editableRules, setEditableRules] = useState<{
    [productName: string]: { minStock: number; orderAmount: number; supplier: string };
  }>({});

  // Estado para el feedback de guardado
  const [savingStatus, setSavingStatus] = useState<{
    [productName: string]: 'saving' | 'saved' | 'error' | null;
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

  // Manejar cambios en los campos de input (Stock Mínimo, Cantidad a Pedir)
  const handleRuleChange = useCallback((
    productName: string,
    field: "minStock" | "orderAmount",
    value: string
  ) => {
    const parsedValue = parseInt(value, 10) || 0;
    setEditableRules((prev) => ({
      ...prev,
      [productName]: { ...prev[productName], [field]: parsedValue },
    }));
  }, []);

  // Guardar regla de producto en blur (para inputs numéricos)
  const handleInputBlur = useCallback(async (productName: string) => {
    const rule = editableRules[productName];
    if (!rule) return;

    setSavingStatus(prev => ({ ...prev, [productName]: 'saving' }));
    try {
      await saveProductRule({
        productName,
        minStock: rule.minStock,
        orderAmount: rule.orderAmount,
      });
      setSavingStatus(prev => ({ ...prev, [productName]: 'saved' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productName]: null })), 2000);
    } catch (e) {
      console.error("Error saving rule on blur:", e);
      setSavingStatus(prev => ({ ...prev, [productName]: 'error' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productName]: null })), 3000);
      showError('Error al guardar la regla.');
    }
  }, [editableRules, saveProductRule]);

  // Guardar cambio de proveedor (para select)
  const handleSupplierChange = useCallback(async (productName: string, newSupplier: string) => {
    setSavingStatus(prev => ({ ...prev, [productName]: 'saving' }));
    try {
      // Actualizar el estado local editableRules
      setEditableRules(prev => ({
        ...prev,
        [productName]: { ...prev[productName], supplier: newSupplier }
      }));

      // Crear datos de inventario actualizados para el contexto
      const updatedInventory = inventoryData.map(item =>
        item.productName === productName
          ? { ...item, supplier: newSupplier }
          : item
      );
      
      // Actualizar inventoryData en el contexto
      setInventoryData(updatedInventory);

      // Guardar explícitamente la sesión actual con los datos de inventario actualizados
      if (sessionId && inventoryType) {
        await saveCurrentSession(updatedInventory, inventoryType, new Date());
      }

      setSavingStatus(prev => ({ ...prev, [productName]: 'saved' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productName]: null })), 2000);
      showSuccess(`Proveedor de ${productName} actualizado.`);
    } catch (e) {
      console.error("Error changing supplier:", e);
      setSavingStatus(prev => ({ ...prev, [productName]: 'error' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productName]: null })), 3000);
      showError('Error al cambiar el proveedor.');
    }
  }, [inventoryData, setInventoryData, saveCurrentSession, sessionId, inventoryType]);

  const handleDeleteRule = async (productName: string) => {
    setSavingStatus(prev => ({ ...prev, [productName]: 'saving' }));
    try {
      await deleteProductRule(productName);
      setSavingStatus(prev => ({ ...prev, [productName]: 'saved' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productName]: null })), 2000);
    } catch (e) {
      console.error("Error deleting rule:", e);
      setSavingStatus(prev => ({ ...prev, [productName]: 'error' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productName]: null })), 3000);
      showError('Error al eliminar la regla.');
    }
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
                          <TableHead className="text-xs sm:text-sm text-gray-700 text-center">Estado</TableHead> {/* Nueva columna para el estado */}
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
                                onBlur={() => handleInputBlur(item.productName)}
                                className="w-20 text-center text-xs sm:text-sm"
                                min="0"
                              />
                            </TableCell>
                            <TableCell className="py-2 px-2">
                              <Input
                                type="number"
                                value={editableRules[item.productName]?.orderAmount ?? 0}
                                onChange={(e) => handleRuleChange(item.productName, "orderAmount", e.target.value)}
                                onBlur={() => handleInputBlur(item.productName)}
                                className="w-20 text-center text-xs sm:text-sm"
                                min="0"
                              />
                            </TableCell>
                            <TableCell className="py-2 px-2">
                              <Select
                                value={editableRules[item.productName]?.supplier ?? item.supplier}
                                onValueChange={(value) => handleSupplierChange(item.productName, value)}
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
                            <TableCell className="py-2 px-2 text-center">
                              {savingStatus[item.productName] === 'saving' && (
                                <Loader2 className="h-4 w-4 animate-spin text-blue-500 inline-block" />
                              )}
                              {savingStatus[item.productName] === 'saved' && (
                                <CheckCircle className="h-4 w-4 text-green-500 inline-block" />
                              )}
                              {savingStatus[item.productName] === 'error' && (
                                <XCircle className="h-4 w-4 text-red-500 inline-block" />
                              )}
                            </TableCell>
                            <TableCell className="py-2 px-2 text-center">
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDeleteRule(item.productName)}
                                className="h-7 w-7 p-0"
                                disabled={savingStatus[item.productName] === 'saving'}
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