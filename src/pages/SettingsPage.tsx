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
import { Loader2, CheckCircle, XCircle, Trash2, PlusCircle, MinusCircle } from "lucide-react"; // Importar iconos
import { showSuccess, showError } from "@/utils/toast";
import { cn } from "@/lib/utils"; // Para combinar clases de Tailwind
import { MasterProductConfig, ProductRule, SupplierConfig } from "@/lib/persistence";
import { FileUploader } from "@/components/FileUploader"; // Importar FileUploader

const SettingsPage = () => {
  const {
    inventoryData,
    masterProductConfigs,
    supplierConfigs, // Obtener configuraciones de proveedor del contexto
    saveMasterProductConfig,
    deleteMasterProductConfig,
    saveSupplierConfig, // Función para guardar configuración de proveedor
    setInventoryData,
    saveCurrentSession,
    sessionId,
    inventoryType,
    loading,
    processDbForMasterConfigs,
  } = useInventoryContext();

  const [editableProductConfigs, setEditableProductConfigs] = useState<{
    [productName: string]: MasterProductConfig;
  }>({});
  const [editableSupplierConfigs, setEditableSupplierConfigs] = useState<{
    [supplierName: string]: SupplierConfig;
  }>({});

  const [savingStatus, setSavingStatus] = useState<{
    [key: string]: 'saving' | 'saved' | 'error' | null; // key puede ser productName o supplierName
  }>({});

  const [isUploadingConfig, setIsUploadingConfig] = useState(false);

  // Inicializar editableProductConfigs cuando masterProductConfigs cambian
  useEffect(() => {
    const initialConfigs: { [productName: string]: MasterProductConfig } = {};
    masterProductConfigs.forEach((config) => {
      initialConfigs[config.productName] = config;
    });
    setEditableProductConfigs(initialConfigs);
  }, [masterProductConfigs]);

  // Inicializar editableSupplierConfigs cuando supplierConfigs cambian
  useEffect(() => {
    const initialConfigs: { [supplierName: string]: SupplierConfig } = {};
    supplierConfigs.forEach((config) => {
      initialConfigs[config.supplierName] = config;
    });
    setEditableSupplierConfigs(initialConfigs);
  }, [supplierConfigs]);

  // Agrupar productos por proveedor (usando el proveedor de la configuración maestra)
  const productsGroupedBySupplier = useMemo(() => {
    const grouped: { [supplier: string]: MasterProductConfig[] } = {};
    Object.values(editableProductConfigs).forEach((config) => {
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
  }, [editableProductConfigs]);

  // Obtener todos los proveedores únicos para el selector (de las configuraciones maestras)
  const allSuppliers = useMemo(() => {
    const suppliers = new Set<string>();
    masterProductConfigs.forEach(config => suppliers.add(config.supplier));
    return Array.from(suppliers).sort();
  }, [masterProductConfigs]);

  // --- Handlers para MasterProductConfig ---
  const handleProductConfigChange = useCallback((
    productName: string,
    field: "minProductOrder" | "supplier", // 'multiple' eliminado
    value: string | number
  ) => {
    setEditableProductConfigs((prev) => {
      const newConfigs = { ...prev };
      if (!newConfigs[productName]) {
        newConfigs[productName] = {
          productName,
          rules: [],
          minProductOrder: 0,
          supplier: "",
          // Eliminado: multiple: 1,
        };
      }

      if (field === "supplier") {
        newConfigs[productName].supplier = value as string;
      } else { // minProductOrder
        newConfigs[productName][field] = parseInt(value as string, 10) || 0;
      }
      return newConfigs;
    });
  }, []);

  const handleProductInputBlur = useCallback(async (productName: string) => {
    const config = editableProductConfigs[productName];
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
                rules: config.rules,
                minProductOrder: config.minProductOrder,
                supplier: config.supplier,
                // Eliminado: multiple: config.multiple,
              }
            : item
        );
        setInventoryData(updatedInventory);
        await saveCurrentSession(updatedInventory, inventoryType, new Date());
      }
    } catch (e) {
      console.error("Error saving product config on blur:", e);
      setSavingStatus(prev => ({ ...prev, [productName]: 'error' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productName]: null })), 3000);
      showError('Error al guardar la configuración del producto.');
    }
  }, [editableProductConfigs, saveMasterProductConfig, sessionId, inventoryType, inventoryData, setInventoryData, saveCurrentSession]);

  const handleProductSupplierChange = useCallback(async (productName: string, newSupplier: string) => {
    setSavingStatus(prev => ({ ...prev, [productName]: 'saving' }));
    try {
      setEditableProductConfigs(prev => ({
        ...prev,
        [productName]: { ...prev[productName], supplier: newSupplier }
      }));

      const configToSave = { ...editableProductConfigs[productName], supplier: newSupplier };
      await saveMasterProductConfig(configToSave);

      setSavingStatus(prev => ({ ...prev, [productName]: 'saved' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productName]: null })), 2000);
      showSuccess(`Proveedor de ${productName} actualizado.`);

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
      console.error("Error changing product supplier:", e);
      setSavingStatus(prev => ({ ...prev, [productName]: 'error' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productName]: null })), 3000);
      showError('Error al cambiar el proveedor del producto.');
    }
  }, [editableProductConfigs, saveMasterProductConfig, inventoryData, setInventoryData, saveCurrentSession, sessionId, inventoryType]);

  const handleDeleteProductConfig = async (productName: string) => {
    setSavingStatus(prev => ({ ...prev, [productName]: 'saving' }));
    try {
      await deleteMasterProductConfig(productName);
      setSavingStatus(prev => ({ ...prev, [productName]: 'saved' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productName]: null })), 2000);

      if (sessionId && inventoryType && inventoryData.length > 0) {
        const updatedInventory = inventoryData.map(item =>
          item.productName === productName
            ? { ...item, rules: [], minProductOrder: 0, supplier: 'Desconocido' } // Eliminado: multiple: 1
            : item
        );
        setInventoryData(updatedInventory);
        await saveCurrentSession(updatedInventory, inventoryType, new Date());
      }
    } catch (e) {
      console.error("Error deleting product config:", e);
      setSavingStatus(prev => ({ ...prev, [productName]: 'error' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productName]: null })), 3000);
      showError('Error al eliminar la configuración del producto.');
    }
  };

  // --- Handlers para Product Rules (reglas múltiples) ---
  const handleAddRule = useCallback(async (productName: string) => {
    setEditableProductConfigs(prev => {
      const newConfigs = { ...prev };
      const currentConfig = newConfigs[productName];
      if (currentConfig) {
        const newRule: ProductRule = { minStock: 0, orderAmount: 0 };
        currentConfig.rules = [...(currentConfig.rules || []), newRule];
      }
      return newConfigs;
    });
    // Guardar automáticamente después de añadir una regla
    const config = editableProductConfigs[productName];
    if (config) {
      setSavingStatus(prev => ({ ...prev, [productName]: 'saving' }));
      try {
        await saveMasterProductConfig({ ...config, rules: [...(config.rules || []), { minStock: 0, orderAmount: 0 }] });
        setSavingStatus(prev => ({ ...prev, [productName]: 'saved' }));
        setTimeout(() => setSavingStatus(prev => ({ ...prev, [productName]: null })), 2000);
        showSuccess('Regla añadida y guardada.');
      } catch (e) {
        console.error("Error adding rule:", e);
        setSavingStatus(prev => ({ ...prev, [productName]: 'error' }));
        setTimeout(() => setSavingStatus(prev => ({ ...prev, [productName]: null })), 3000);
        showError('Error al añadir la regla.');
      }
    }
  }, [editableProductConfigs, saveMasterProductConfig]);

  const handleRuleChange = useCallback((
    productName: string,
    ruleIndex: number,
    field: keyof ProductRule,
    value: string
  ) => {
    setEditableProductConfigs(prev => {
      const newConfigs = { ...prev };
      const currentConfig = newConfigs[productName];
      if (currentConfig && currentConfig.rules?.[ruleIndex]) {
        const newRules = [...currentConfig.rules];
        newRules[ruleIndex] = {
          ...newRules[ruleIndex],
          [field]: parseInt(value, 10) || 0,
        };
        currentConfig.rules = newRules;
      }
      return newConfigs;
    });
  }, []);

  const handleRuleBlur = useCallback(async (productName: string) => {
    const config = editableProductConfigs[productName];
    if (!config) return;

    setSavingStatus(prev => ({ ...prev, [productName]: 'saving' }));
    try {
      await saveMasterProductConfig(config);
      setSavingStatus(prev => ({ ...prev, [productName]: 'saved' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productName]: null })), 2000);
      showSuccess('Regla actualizada y guardada.');

      // Actualizar el inventoryData de la sesión actual si está activa
      if (sessionId && inventoryType && inventoryData.length > 0) {
        const updatedInventory = inventoryData.map(item =>
          item.productName === productName
            ? { ...item, rules: config.rules }
            : item
        );
        setInventoryData(updatedInventory);
        await saveCurrentSession(updatedInventory, inventoryType, new Date());
      }
    } catch (e) {
      console.error("Error saving rule on blur:", e);
      setSavingStatus(prev => ({ ...prev, [productName]: 'error' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productName]: null })), 3000);
      showError('Error al guardar la regla.');
    }
  }, [editableProductConfigs, saveMasterProductConfig, sessionId, inventoryType, inventoryData, setInventoryData, saveCurrentSession]);

  const handleDeleteRule = useCallback(async (productName: string, ruleIndex: number) => {
    setEditableProductConfigs(prev => {
      const newConfigs = { ...prev };
      const currentConfig = newConfigs[productName];
      if (currentConfig && currentConfig.rules) {
        const newRules = currentConfig.rules.filter((_, idx) => idx !== ruleIndex);
        currentConfig.rules = newRules;
      }
      return newConfigs;
    });
    // Guardar automáticamente después de eliminar una regla
    const config = editableProductConfigs[productName];
    if (config) {
      setSavingStatus(prev => ({ ...prev, [productName]: 'saving' }));
      try {
        const updatedRules = config.rules.filter((_, idx) => idx !== ruleIndex);
        await saveMasterProductConfig({ ...config, rules: updatedRules });
        setSavingStatus(prev => ({ ...prev, [productName]: 'saved' }));
        setTimeout(() => setSavingStatus(prev => ({ ...prev, [productName]: null })), 2000);
        showSuccess('Regla eliminada y guardada.');
      } catch (e) {
        console.error("Error deleting rule:", e);
        setSavingStatus(prev => ({ ...prev, [productName]: 'error' }));
        setTimeout(() => setSavingStatus(prev => ({ ...prev, [productName]: null })), 3000);
        showError('Error al eliminar la regla.');
      }
    }
  }, [editableProductConfigs, saveMasterProductConfig]);

  // --- Handlers para SupplierConfig ---
  const handleSupplierMinOrderChange = useCallback((
    supplierName: string,
    value: string
  ) => {
    setEditableSupplierConfigs(prev => {
      const newConfigs = { ...prev };
      if (!newConfigs[supplierName]) {
        newConfigs[supplierName] = { supplierName, minOrderValue: 0 };
      }
      newConfigs[supplierName].minOrderValue = parseInt(value, 10) || 0;
      return newConfigs;
    });
  }, []);

  const handleSupplierMinOrderBlur = useCallback(async (supplierName: string) => {
    const config = editableSupplierConfigs[supplierName];
    if (!config) return;

    setSavingStatus(prev => ({ ...prev, [`supplier-${supplierName}`]: 'saving' }));
    try {
      await saveSupplierConfig(config);
      setSavingStatus(prev => ({ ...prev, [`supplier-${supplierName}`]: 'saved' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [`supplier-${supplierName}`]: null })), 2000);
      showSuccess(`Mínimo de compra para ${supplierName} guardado.`);
    } catch (e) {
      console.error("Error saving supplier min order:", e);
      setSavingStatus(prev => ({ ...prev, [`supplier-${supplierName}`]: 'error' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [`supplier-${supplierName}`]: null })), 3000);
      showError('Error al guardar el mínimo de compra del proveedor.');
    }
  }, [editableSupplierConfigs, saveSupplierConfig]);

  const handleDbFileLoadedFromSettings = async (buffer: Uint8Array) => {
    setIsUploadingConfig(true);
    try {
      await processDbForMasterConfigs(buffer);
    } catch (error) {
      console.error("Error uploading DB for master configs:", error);
      showError("Error al cargar el archivo DB para configuraciones maestras.");
    } finally {
      setIsUploadingConfig(false);
    }
  };

  if (loading || isUploadingConfig) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-4">
        <p className="text-base sm:text-lg text-center text-gray-700">Cargando configuración...</p>
      </div>
    );
  }

  // Mostrar uploader si no hay configuraciones maestras
  if (masterProductConfigs.length === 0) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-4 text-gray-900">Configuración de Pedidos</h1>
          <p className="text-base sm:text-lg text-gray-700 mb-6">
            No hay productos configurados. Por favor, carga un archivo de base de datos (.db) para inicializar la lista de productos y sus reglas.
          </p>
          <FileUploader onFileLoaded={handleDbFileLoadedFromSettings} loading={isUploadingConfig} />
        </div>
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
                  <div className="flex items-center gap-2">
                    {supplier} ({products.length} productos)
                    <div className="flex items-center gap-1 ml-4">
                      <span className="text-sm font-normal text-gray-600">Mínimo de Compra:</span>
                      <Input
                        type="number"
                        value={editableSupplierConfigs[supplier]?.minOrderValue ?? 0}
                        onChange={(e) => handleSupplierMinOrderChange(supplier, e.target.value)}
                        onBlur={() => handleSupplierMinOrderBlur(supplier)}
                        onClick={(e) => e.stopPropagation()} // Evitar que el acordeón se cierre
                        className="w-24 text-center text-xs sm:text-sm"
                        min="0"
                      />
                      {savingStatus[`supplier-${supplier}`] === 'saving' && (
                        <Loader2 className="h-4 w-4 animate-spin text-blue-500 inline-block" />
                      )}
                      {savingStatus[`supplier-${supplier}`] === 'saved' && (
                        <CheckCircle className="h-4 w-4 text-green-500 inline-block" />
                      )}
                      {savingStatus[`supplier-${supplier}`] === 'error' && (
                        <XCircle className="h-4 w-4 text-red-500 inline-block" />
                      )}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="p-4 bg-gray-50">
                  <div className="overflow-x-auto custom-scrollbar">
                    <Table className="min-w-full bg-white text-gray-900 border-collapse">
                      <TableHeader>
                        <TableRow className="border-b border-gray-200">
                          <TableHead className="text-xs sm:text-sm text-gray-700">Producto</TableHead>
                          <TableHead className="text-xs sm:text-sm text-gray-700">Proveedor</TableHead>
                          <TableHead className="text-xs sm:text-sm text-gray-700">Mínimo por Producto</TableHead>
                          {/* Eliminado: <TableHead className className="text-xs sm:text-sm text-gray-700">Múltiplo</TableHead> */}
                          <TableHead className="text-xs sm:text-sm text-gray-700 text-center">Estado</TableHead>
                          <TableHead className="text-xs sm:text-sm text-gray-700 text-center">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {products.map((config) => {
                          return (
                            <React.Fragment key={config.productName}>
                              <TableRow className="border-b border-gray-100 hover:bg-gray-100">
                                <TableCell className="py-2 px-2 text-xs sm:text-sm font-medium">{config.productName}</TableCell>
                                <TableCell className="py-2 px-2">
                                  <Select
                                    value={editableProductConfigs[config.productName]?.supplier ?? config.supplier}
                                    onValueChange={(value) => handleProductSupplierChange(config.productName, value)}
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
                                <TableCell className="py-2 px-2">
                                  <Input
                                    type="number"
                                    value={editableProductConfigs[config.productName]?.minProductOrder ?? 0}
                                    onChange={(e) => handleProductConfigChange(config.productName, "minProductOrder", e.target.value)}
                                    onBlur={() => handleProductInputBlur(config.productName)}
                                    className="w-20 text-center text-xs sm:text-sm"
                                    min="0"
                                  />
                                </TableCell>
                                {/* Eliminado:
                                <TableCell className="py-2 px-2">
                                  <Input
                                    type="number"
                                    value={editableProductConfigs[config.productName]?.multiple ?? 1}
                                    onChange={(e) => handleProductConfigChange(config.productName, "multiple", e.target.value)}
                                    onBlur={() => handleProductInputBlur(config.productName)}
                                    className="w-20 text-center text-xs sm:text-sm"
                                    min="1"
                                  />
                                </TableCell>
                                */}
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
                                    onClick={() => handleDeleteProductConfig(config.productName)}
                                    className="h-7 w-7 p-0"
                                    disabled={savingStatus[config.productName] === 'saving'}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                              {/* Fila para las reglas múltiples */}
                              <TableRow className="bg-gray-50">
                                <TableCell colSpan={6} className="py-2 px-2">
                                  <div className="flex flex-col gap-2 pl-4">
                                    <p className="text-xs font-semibold text-gray-700">Reglas de Pedido:</p>
                                    {(editableProductConfigs[config.productName]?.rules || []).map((rule, ruleIndex) => (
                                      <div key={ruleIndex} className="flex items-center gap-2 text-xs">
                                        <span>Si Stock es &lt;=</span>
                                        <Input
                                          type="number"
                                          value={rule.minStock}
                                          onChange={(e) => handleRuleChange(config.productName, ruleIndex, "minStock", e.target.value)}
                                          onBlur={() => handleRuleBlur(config.productName)}
                                          className="w-16 text-center"
                                          min="0"
                                        />
                                        <span>Pedir</span>
                                        <Input
                                          type="number"
                                          value={rule.orderAmount}
                                          onChange={(e) => handleRuleChange(config.productName, ruleIndex, "orderAmount", e.target.value)}
                                          onBlur={() => handleRuleBlur(config.productName)}
                                          className="w-16 text-center"
                                          min="0"
                                        />
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => handleDeleteRule(config.productName, ruleIndex)}
                                          className="h-6 w-6 text-red-500 hover:bg-red-100"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    ))}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleAddRule(config.productName)}
                                      className="mt-2 w-fit text-blue-600 border-blue-600 hover:bg-blue-600 hover:text-white text-xs"
                                    >
                                      <PlusCircle className="h-3 w-3 mr-1" /> Añadir Condición
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            </React.Fragment>
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