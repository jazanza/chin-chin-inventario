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
import { Loader2, CheckCircle, XCircle, Trash2, PlusCircle, MinusCircle } from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { MasterProductConfig, ProductRule } from "@/lib/persistence";
import { FileUploader } from "@/components/FileUploader";

const SettingsPage = () => {
  const {
    inventoryData,
    masterProductConfigs, // Ahora solo contiene productos no ocultos
    saveMasterProductConfig,
    deleteMasterProductConfig, // Ahora realiza un soft delete
    setInventoryData,
    saveCurrentSession,
    sessionId,
    inventoryType,
    loading,
    processDbForMasterConfigs,
    loadMasterProductConfigs, // Para recargar después de un soft delete
  } = useInventoryContext();

  const [editableProductConfigs, setEditableProductConfigs] = useState<{
    [productId: number]: MasterProductConfig; // Cambiado a productId
  }>({});

  const [savingStatus, setSavingStatus] = useState<{
    [key: number]: 'saving' | 'saved' | 'error' | null; // key es productId
  }>({});

  const [isUploadingConfig, setIsUploadingConfig] = useState(false);

  // Inicializar editableProductConfigs cuando masterProductConfigs cambian
  useEffect(() => {
    const initialConfigs: { [productId: number]: MasterProductConfig } = {};
    masterProductConfigs.forEach((config) => {
      initialConfigs[config.productId] = config;
    });
    setEditableProductConfigs(initialConfigs);
  }, [masterProductConfigs]);

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
    productId: number, // Cambiado a productId
    field: "supplier",
    value: string | number
  ) => {
    setEditableProductConfigs((prev) => {
      const newConfigs = { ...prev };
      if (!newConfigs[productId]) {
        // Esto no debería ocurrir si masterProductConfigs ya está poblado
        console.warn(`Config for productId ${productId} not found.`);
        return prev;
      }

      if (field === "supplier") {
        newConfigs[productId] = { ...newConfigs[productId], supplier: value as string };
      }
      return newConfigs;
    });
  }, []);

  const handleProductInputBlur = useCallback(async (productId: number) => { // Cambiado a productId
    const config = editableProductConfigs[productId];
    if (!config) return;

    setSavingStatus(prev => ({ ...prev, [productId]: 'saving' }));
    try {
      await saveMasterProductConfig(config);
      setSavingStatus(prev => ({ ...prev, [productId]: 'saved' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productId]: null })), 2000);

      // Actualizar el inventoryData de la sesión actual si está activa
      if (sessionId && inventoryType && inventoryData.length > 0) {
        const updatedInventory = inventoryData.map(item =>
          item.productId === productId // Usar productId
            ? {
                ...item,
                rules: config.rules,
                supplier: config.supplier,
              }
            : item
        );
        setInventoryData(updatedInventory);
        await saveCurrentSession(updatedInventory, inventoryType, new Date());
      }
    } catch (e) {
      console.error("Error saving product config on blur:", e);
      setSavingStatus(prev => ({ ...prev, [productId]: 'error' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productId]: null })), 3000);
      showError('Error al guardar la configuración del producto.');
    }
  }, [editableProductConfigs, saveMasterProductConfig, sessionId, inventoryType, inventoryData, setInventoryData, saveCurrentSession]);

  const handleProductSupplierChange = useCallback(async (productId: number, newSupplier: string) => { // Cambiado a productId
    setSavingStatus(prev => ({ ...prev, [productId]: 'saving' }));
    try {
      setEditableProductConfigs(prev => ({
        ...prev,
        [productId]: { ...prev[productId], supplier: newSupplier }
      }));

      const configToSave = { ...editableProductConfigs[productId], supplier: newSupplier };
      await saveMasterProductConfig(configToSave);

      setSavingStatus(prev => ({ ...prev, [productId]: 'saved' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productId]: null })), 2000);
      showSuccess(`Proveedor de ${configToSave.productName} actualizado.`);

      if (sessionId && inventoryType && inventoryData.length > 0) {
        const updatedInventory = inventoryData.map(item =>
          item.productId === productId // Usar productId
            ? { ...item, supplier: newSupplier }
            : item
        );
        setInventoryData(updatedInventory);
        await saveCurrentSession(updatedInventory, inventoryType, new Date());
      }
    } catch (e) {
      console.error("Error changing product supplier:", e);
      setSavingStatus(prev => ({ ...prev, [productId]: 'error' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productId]: null })), 3000);
      showError('Error al cambiar el proveedor del producto.');
    }
  }, [editableProductConfigs, saveMasterProductConfig, inventoryData, setInventoryData, saveCurrentSession, sessionId, inventoryType]);

  const handleDeleteProductConfig = async (productId: number) => { // Cambiado a productId
    setSavingStatus(prev => ({ ...prev, [productId]: 'saving' }));
    try {
      await deleteMasterProductConfig(productId); // Llama al soft delete
      setSavingStatus(prev => ({ ...prev, [productId]: 'saved' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productId]: null })), 2000);
      
      // Recargar las configuraciones maestras para que el producto oculto desaparezca de la vista
      await loadMasterProductConfigs();

      // Si el producto eliminado estaba en el inventario actual, actualizarlo
      if (sessionId && inventoryType && inventoryData.length > 0) {
        const updatedInventory = inventoryData.filter(item => item.productId !== productId);
        setInventoryData(updatedInventory);
        await saveCurrentSession(updatedInventory, inventoryType, new Date());
      }
    } catch (e) {
      console.error("Error deleting product config:", e);
      setSavingStatus(prev => ({ ...prev, [productId]: 'error' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productId]: null })), 3000);
      showError('Error al eliminar la configuración del producto.');
    }
  };

  // --- Handlers para Product Rules (reglas múltiples) ---
  const handleAddRule = useCallback(async (productId: number) => { // Cambiado a productId
    setSavingStatus(prev => ({ ...prev, [productId]: 'saving' }));
    try {
      const currentConfig = editableProductConfigs[productId];
      if (!currentConfig) {
        throw new Error(`Product config not found for adding rule for productId: ${productId}.`);
      }

      const newRule: ProductRule = { minStock: 0, orderAmount: 0 };
      const updatedRules = [...(currentConfig.rules || []), newRule];
      const updatedConfig = { ...currentConfig, rules: updatedRules };

      // Update local state first
      setEditableProductConfigs(prev => ({
        ...prev,
        [productId]: updatedConfig,
      }));

      // Then save to persistence
      await saveMasterProductConfig(updatedConfig);

      setSavingStatus(prev => ({ ...prev, [productId]: 'saved' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productId]: null })), 2000);
      showSuccess('Regla añadida y guardada.');

      // Also update the current inventoryData if a session is active
      if (sessionId && inventoryType && inventoryData.length > 0) {
        const updatedInventory = inventoryData.map(item =>
          item.productId === productId // Usar productId
            ? { ...item, rules: updatedRules }
            : item
        );
        setInventoryData(updatedInventory);
        await saveCurrentSession(updatedInventory, inventoryType, new Date());
      }

    } catch (e) {
      console.error("Error adding rule:", e);
      setSavingStatus(prev => ({ ...prev, [productId]: 'error' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productId]: null })), 3000);
      showError('Error al añadir la regla.');
    }
  }, [editableProductConfigs, saveMasterProductConfig, sessionId, inventoryType, inventoryData, setInventoryData, saveCurrentSession]);

  const handleRuleChange = useCallback((
    productId: number, // Cambiado a productId
    ruleIndex: number,
    field: keyof ProductRule,
    value: string
  ) => {
    setEditableProductConfigs(prev => {
      const newConfigs = { ...prev };
      const currentConfig = newConfigs[productId];
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

  const handleRuleBlur = useCallback(async (productId: number) => { // Cambiado a productId
    const config = editableProductConfigs[productId];
    if (!config) return;

    setSavingStatus(prev => ({ ...prev, [productId]: 'saving' }));
    try {
      await saveMasterProductConfig(config);
      setSavingStatus(prev => ({ ...prev, [productId]: 'saved' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productId]: null })), 2000);
      showSuccess('Regla actualizada y guardada.');

      // Actualizar el inventoryData de la sesión actual si está activa
      if (sessionId && inventoryType && inventoryData.length > 0) {
        const updatedInventory = inventoryData.map(item =>
          item.productId === productId // Usar productId
            ? { ...item, rules: config.rules }
            : item
        );
        setInventoryData(updatedInventory);
        await saveCurrentSession(updatedInventory, inventoryType, new Date());
      }
    } catch (e) {
      console.error("Error saving rule on blur:", e);
      setSavingStatus(prev => ({ ...prev, [productId]: 'error' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productId]: null })), 3000);
      showError('Error al guardar la regla.');
    }
  }, [editableProductConfigs, saveMasterProductConfig, sessionId, inventoryType, inventoryData, setInventoryData, saveCurrentSession]);

  const handleDeleteRule = useCallback(async (productId: number, ruleIndex: number) => { // Cambiado a productId
    setEditableProductConfigs(prev => {
      const newConfigs = { ...prev };
      const currentConfig = newConfigs[productId];
      if (currentConfig && currentConfig.rules) {
        const newRules = currentConfig.rules.filter((_, idx) => idx !== ruleIndex);
        currentConfig.rules = newRules;
      }
      return newConfigs;
    });
    // Guardar automáticamente después de eliminar una regla
    const config = editableProductConfigs[productId];
    if (config) {
      setSavingStatus(prev => ({ ...prev, [productId]: 'saving' }));
      try {
        const updatedRules = config.rules.filter((_, idx) => idx !== ruleIndex);
        await saveMasterProductConfig({ ...config, rules: updatedRules });
        setSavingStatus(prev => ({ ...prev, [productId]: 'saved' }));
        setTimeout(() => setSavingStatus(prev => ({ ...prev, [productId]: null })), 2000);
        showSuccess('Regla eliminada y guardada.');
      } catch (e) {
        console.error("Error deleting rule:", e);
        setSavingStatus(prev => ({ ...prev, [productId]: 'error' }));
        setTimeout(() => setSavingStatus(prev => ({ ...prev, [productId]: null })), 3000);
        showError('Error al eliminar la regla.');
      }
    }
  }, [editableProductConfigs, saveMasterProductConfig]);

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
                  </div>
                </AccordionTrigger>
                <AccordionContent className="p-4 bg-gray-50">
                  <div className="overflow-x-auto custom-scrollbar">
                    <Table className="min-w-full bg-white text-gray-900 border-collapse">
                      <TableHeader>
                        <TableRow className="border-b border-gray-200">
                          <TableHead className="text-xs sm:text-sm text-gray-700">Producto</TableHead>
                          <TableHead className="text-xs sm:text-sm text-gray-700">Proveedor</TableHead>
                          <TableHead className="text-xs sm:text-sm text-gray-700 text-center">Estado</TableHead>
                          <TableHead className="text-xs sm:text-sm text-gray-700 text-center">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {products.map((config) => {
                          return (
                            <React.Fragment key={config.productId}> {/* Usar productId como key */}
                              <TableRow className="border-b border-gray-100 hover:bg-gray-100">
                                <TableCell className="py-2 px-2 text-xs sm:text-sm font-medium">{config.productName}</TableCell>
                                <TableCell className="py-2 px-2">
                                  <Select
                                    value={editableProductConfigs[config.productId]?.supplier ?? config.supplier} // Usar productId
                                    onValueChange={(value) => handleProductSupplierChange(config.productId, value)} // Usar productId
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
                                  {savingStatus[config.productId] === 'saving' && ( // Usar productId
                                    <Loader2 className="h-4 w-4 animate-spin text-blue-500 inline-block" />
                                  )}
                                  {savingStatus[config.productId] === 'saved' && ( // Usar productId
                                    <CheckCircle className="h-4 w-4 text-green-500 inline-block" />
                                  )}
                                  {savingStatus[config.productId] === 'error' && ( // Usar productId
                                    <XCircle className="h-4 w-4 text-red-500 inline-block" />
                                  )}
                                </TableCell>
                                <TableCell className="py-2 px-2 text-center">
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => handleDeleteProductConfig(config.productId)} // Usar productId
                                    className="h-7 w-7 p-0"
                                    disabled={savingStatus[config.productId] === 'saving'} // Usar productId
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                              {/* Fila para las reglas múltiples */}
                              <TableRow className="bg-gray-50">
                                <TableCell colSpan={5} className="py-2 px-2">
                                  <div className="flex flex-col gap-2 pl-4">
                                    <p className="text-xs font-semibold text-gray-700">Reglas de Pedido:</p>
                                    {(editableProductConfigs[config.productId]?.rules || []).map((rule, ruleIndex) => ( // Usar productId
                                      <div key={ruleIndex} className="flex items-center gap-2 text-xs">
                                        <span>Si Stock es &lt;=</span>
                                        <Input
                                          type="number"
                                          value={rule.minStock}
                                          onChange={(e) => handleRuleChange(config.productId, ruleIndex, "minStock", e.target.value)} // Usar productId
                                          onBlur={() => handleRuleBlur(config.productId)} // Usar productId
                                          className="w-16 text-center"
                                          min="0"
                                        />
                                        <span>Pedir</span>
                                        <Input
                                          type="number"
                                          value={rule.orderAmount}
                                          onChange={(e) => handleRuleChange(config.productId, ruleIndex, "orderAmount", e.target.value)} // Usar productId
                                          onBlur={() => handleRuleBlur(config.productId)} // Usar productId
                                          className="w-16 text-center"
                                          min="0"
                                        />
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => handleDeleteRule(config.productId, ruleIndex)} // Usar productId
                                          className="h-6 w-6 text-red-500 hover:bg-red-100"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    ))}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleAddRule(config.productId)} // Usar productId
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