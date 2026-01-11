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
import { MasterProductConfig } from "@/lib/persistence";

const SettingsPage = () => {
  const {
    inventoryData,
    masterProductConfigs, // Ahora usamos masterProductConfigs del contexto
    saveMasterProductConfig,
    deleteMasterProductConfig,
    setInventoryData, // Para actualizar el proveedor en inventoryData de la sesión actual
    saveCurrentSession, // Necesario para guardar cambios de proveedor en la sesión
    sessionId,
    inventoryType,
    loading,
  } = useInventoryContext();

  // Estado local para las reglas que se están editando
  const [editableConfigs, setEditableConfigs] = useState<{
    [productName: string]: MasterProductConfig;
  }>({});

  // Inicializar editableConfigs cuando masterProductConfigs cambian
  useEffect(() => {
    const initialConfigs: {
      [productName: string]: MasterProductConfig;
    } = {};
    masterProductConfigs.forEach((config) => {
      initialConfigs[config.productName] = config;
    });
    setEditableConfigs(initialConfigs);
  }, [masterProductConfigs]);

  // Agrupar productos por proveedor (usando el proveedor de la configuración maestra)
  const productsGroupedBySupplier = useMemo(() => {
    const grouped: { [supplier: string]: MasterProductConfig[] } = {};
    Object.values(editableConfigs).forEach((config) => {
      if (!grouped[config.supplier]) {
        grouped[config.supplier] = [];
      }
      grouped[config.supplier].push(config);
    });
    // Ordenar productos alfabéticamente dentro de cada grupo
    for (const supplier in grouped) {
      grouped[supplier].sort((a, b) => a.productName.localeCompare(b.productName));
    }
    return grouped;
  }, [editableConfigs]);

  // Obtener todos los proveedores únicos para el selector (de las configuraciones maestras)
  const allSuppliers = useMemo(() => {
    const suppliers = new Set<string>();
    masterProductConfigs.forEach(config => suppliers.add(config.supplier));
    return Array.from(suppliers).sort();
  }, [masterProductConfigs]);

  // Manejar cambios en los campos de input (Stock Mínimo, Cantidad a Pedir, Múltiplo)
  const handleConfigChange = useCallback((
    productName: string,
    field: "minStock" | "orderAmount" | "supplier" | "multiple",
    value: string | number
  ) => {
    setEditableConfigs((prev) => {
      const newConfigs = { ...prev };
      if (!newConfigs[productName]) {
        // Esto no debería pasar si editableConfigs se inicializa correctamente
        // pero es un fallback seguro.
        newConfigs[productName] = {
          productName,
          minStock: 0,
          orderAmount: 0,
          supplier: "",
          multiple: 1,
        };
      }

      if (field === "supplier") {
        newConfigs[productName].supplier = value as string;
      } else if (field === "multiple") {
        newConfigs[productName].multiple = parseInt(value as string, 10) || 1;
      } else {
        newConfigs[productName][field] = parseInt(value as string, 10) || 0;
      }
      return newConfigs;
    });
  }, []);

  // Guardar configuración de producto en blur (para inputs numéricos)
  const handleInputBlur = useCallback(async (productName: string) => {
    const config = editableConfigs[productName];
    if (!config) return;

    setSavingStatus(prev => ({ ...prev, [productName]: 'saving' }));
    try {
      await saveMasterProductConfig(config);
      setSavingStatus(prev => ({ ...prev, [productName]: 'saved' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productName]: null })), 2000);

      // Actualizar el inventoryData de la sesión actual si está activa
      if (sessionId && inventoryType && inventoryData.length > 0) {
        const updatedInventory = inventoryData.map(item =>
          item.productName === productName
            ? {
                ...item,
                ruleMinStock: config.minStock,
                ruleOrderAmount: config.orderAmount,
                supplier: config.supplier,
                multiple: config.multiple,
              }
            : item
        );
        setInventoryData(updatedInventory);
        await saveCurrentSession(updatedInventory, inventoryType, new Date());
      }
    } catch (e) {
      console.error("Error saving config on blur:", e);
      setSavingStatus(prev => ({ ...prev, [productName]: 'error' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productName]: null })), 3000);
      showError('Error al guardar la configuración.');
    }
  }, [editableConfigs, saveMasterProductConfig, sessionId, inventoryType, inventoryData, setInventoryData, saveCurrentSession]);

  // Guardar cambio de proveedor (para select)
  const handleSupplierChange = useCallback(async (productName: string, newSupplier: string) => {
    setSavingStatus(prev => ({ ...prev, [productName]: 'saving' }));
    try {
      // Actualizar el estado local editableConfigs
      setEditableConfigs(prev => ({
        ...prev,
        [productName]: { ...prev[productName], supplier: newSupplier }
      }));

      const configToSave = { ...editableConfigs[productName], supplier: newSupplier };
      await saveMasterProductConfig(configToSave);

      setSavingStatus(prev => ({ ...prev, [productName]: 'saved' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productName]: null })), 2000);
      showSuccess(`Proveedor de ${productName} actualizado.`);

      // Actualizar el inventoryData de la sesión actual si está activa
      if (sessionId && inventoryType && inventoryData.length > 0) {
        const updatedInventory = inventoryData.map(item =>
          item.productName === productName
            ? { ...item, supplier: newSupplier }
            : item
        );
        setInventoryData(updatedInventory);
        await saveCurrentSession(updatedInventory, inventoryType, new Date());
      }
    } catch (e) {
      console.error("Error changing supplier:", e);
      setSavingStatus(prev => ({ ...prev, [productName]: 'error' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productName]: null })), 3000);
      showError('Error al cambiar el proveedor.');
    }
  }, [editableConfigs, saveMasterProductConfig, inventoryData, setInventoryData, saveCurrentSession, sessionId, inventoryType]);

  const handleDeleteConfig = async (productName: string) => {
    setSavingStatus(prev => ({ ...prev, [productName]: 'saving' }));
    try {
      await deleteMasterProductConfig(productName);
      setSavingStatus(prev => ({ ...prev, [productName]: 'saved' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productName]: null })), 2000);

      // Si el producto eliminado estaba en la sesión actual, actualizar inventoryData
      if (sessionId && inventoryType && inventoryData.length > 0) {
        const updatedInventory = inventoryData.map(item =>
          item.productName === productName
            ? { ...item, ruleMinStock: undefined, ruleOrderAmount: undefined, supplier: 'Desconocido', multiple: 1 } // Resetear a valores por defecto o eliminar
            : item
        );
        setInventoryData(updatedInventory);
        await saveCurrentSession(updatedInventory, inventoryType, new Date());
      }
    } catch (e) {
      console.error("Error deleting config:", e);
      setSavingStatus(prev => ({ ...prev, [productName]: 'error' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productName]: null })), 3000);
      showError('Error al eliminar la configuración.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-4">
        <p className="text-base sm:text-lg text-center text-gray-700">Cargando configuración...</p>
      </div>
    );
  }

  if (inventoryData.length === 0 && masterProductConfigs.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        Por favor, carga un archivo de base de datos y selecciona un tipo de inventario para que los productos aparezcan aquí y puedas configurar sus reglas.
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
                          <TableHead className="text-xs sm:text-sm text-gray-700">Múltiplo</TableHead>
                          <TableHead className="text-xs sm:text-sm text-gray-700">Proveedor</TableHead>
                          <TableHead className="text-xs sm:text-sm text-gray-700 text-center">Estado</TableHead> {/* Nueva columna para el estado */}
                          <TableHead className="text-xs sm:text-sm text-gray-700 text-center">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {products.map((config) => {
                          const currentInventoryItem = inventoryData.find(item => item.productName === config.productName);
                          return (
                            <TableRow key={config.productName} className="border-b border-gray-100 hover:bg-gray-100">
                              <TableCell className="py-2 px-2 text-xs sm:text-sm font-medium">{config.productName}</TableCell>
                              <TableCell className="py-2 px-2 text-xs sm:text-sm text-center">{currentInventoryItem?.systemQuantity ?? '-'}</TableCell>
                              <TableCell className="py-2 px-2">
                                <Input
                                  type="number"
                                  value={editableConfigs[config.productName]?.minStock ?? 0}
                                  onChange={(e) => handleConfigChange(config.productName, "minStock", e.target.value)}
                                  onBlur={() => handleInputBlur(config.productName)}
                                  className="w-20 text-center text-xs sm:text-sm"
                                  min="0"
                                />
                              </TableCell>
                              <TableCell className="py-2 px-2">
                                <Input
                                  type="number"
                                  value={editableConfigs[config.productName]?.orderAmount ?? 0}
                                  onChange={(e) => handleConfigChange(config.productName, "orderAmount", e.target.value)}
                                  onBlur={() => handleInputBlur(config.productName)}
                                  className="w-20 text-center text-xs sm:text-sm"
                                  min="0"
                                />
                              </TableCell>
                              <TableCell className="py-2 px-2">
                                <Input
                                  type="number"
                                  value={editableConfigs[config.productName]?.multiple ?? 1}
                                  onChange={(e) => handleConfigChange(config.productName, "multiple", e.target.value)}
                                  onBlur={() => handleInputBlur(config.productName)}
                                  className="w-20 text-center text-xs sm:text-sm"
                                  min="1"
                                />
                              </TableCell>
                              <TableCell className="py-2 px-2">
                                <Select
                                  value={editableConfigs[config.productName]?.supplier ?? config.supplier}
                                  onValueChange={(value) => handleSupplierChange(config.productName, value)}
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
                                {savingStatus[config.productName] === 'saving' && (
                                  <Loader2 className="h-4 w-4 animate-spin text-blue-500 inline-block" />
                                )}
                                {savingStatus[config.productName] === 'saved' && (
                                  <CheckCircle className="h-4 w-4 text-green-500 inline-block" />
                                )}
                                {savingStatus[config.productName] === 'error' && (
                                  <XCircle className="h-4 w-4 text-red-500 inline-block" />
                                )}
                              </TableCell>
                              <TableCell className="py-2 px-2 text-center">
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleDeleteConfig(config.productName)}
                                  className="h-7 w-7 p-0"
                                  disabled={savingStatus[config.productName] === 'saving'}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
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