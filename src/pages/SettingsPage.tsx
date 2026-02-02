import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useInventoryContext, InventoryItem } from "@/context/InventoryContext";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle, XCircle, Trash2, PlusCircle, Eye, EyeOff, Upload, RefreshCcw } from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { MasterProductConfig, ProductRule } from "@/lib/persistence";
import { FileUploader } from "@/components/FileUploader";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";


const SettingsPage = () => {
  const {
    filteredInventoryData,
    masterProductConfigs,
    saveMasterProductConfig,
    deleteMasterProductConfig,
    saveCurrentSession,
    sessionId,
    inventoryType,
    loading,
    processDbForMasterConfigs,
    loadMasterProductConfigs,
    clearLocalDatabase,
    syncToSupabase,
    isOnline,
    isSupabaseSyncInProgress,
  } = useInventoryContext();

  const [editableProductConfigs, setEditableProductConfigs] = useState<{
    [productId: number]: MasterProductConfig;
  }>({});
  const [showHiddenProducts, setShowHiddenProducts] = useState(false);

  const [savingStatus, setSavingStatus] = useState<{
    [key: number]: 'saving' | 'saved' | 'error' | null;
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

  // Cargar configuraciones maestras (con o sin ocultos) cuando el toggle cambia
  useEffect(() => {
    loadMasterProductConfigs(showHiddenProducts);
  }, [showHiddenProducts, loadMasterProductConfigs]);


  // Agrupar productos por proveedor (usando el proveedor de la configuración maestra)
  const productsGroupedBySupplier = useMemo(() => {
    const grouped: { [supplier: string]: MasterProductConfig[] } = {};
    Object.values(editableProductConfigs).forEach((config: MasterProductConfig) => { // Explicitly type config
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
    productId: number,
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

  const handleProductInputBlur = useCallback(async (productId: number) => {
    const config = editableProductConfigs[productId];
    if (!config) return;

    setSavingStatus(prev => ({ ...prev, [productId]: 'saving' }));
    try {
      await saveMasterProductConfig(config);
      setSavingStatus(prev => ({ ...prev, [productId]: 'saved' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productId]: null })), 2000);

      // Actualizar la sesión actual con los datos de inventario filtrados más recientes
      if (sessionId && inventoryType && filteredInventoryData.length > 0) {
        await saveCurrentSession(filteredInventoryData, inventoryType, new Date());
      }
    } catch (e) {
      console.error("Error saving product config on blur:", e);
      setSavingStatus(prev => ({ ...prev, [productId]: 'error' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productId]: null })), 3000);
      showError('Error al guardar la configuración del producto.');
    }
  }, [editableProductConfigs, saveMasterProductConfig, sessionId, inventoryType, filteredInventoryData, saveCurrentSession]);

  const handleProductSupplierChange = useCallback(async (productId: number, newSupplier: string) => {
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

      if (sessionId && inventoryType && filteredInventoryData.length > 0) {
        await saveCurrentSession(filteredInventoryData, inventoryType, new Date());
      }
    } catch (e) {
      console.error("Error changing product supplier:", e);
      setSavingStatus(prev => ({ ...prev, [productId]: 'error' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productId]: null })), 3000);
      showError('Error al cambiar el proveedor del producto.');
    }
  }, [editableProductConfigs, saveMasterProductConfig, filteredInventoryData, saveCurrentSession, sessionId, inventoryType]);

  const handleProductInventoryTypeChange = useCallback(async (productId: number, newType: 'weekly' | 'monthly' | 'ignored') => {
    setSavingStatus(prev => ({ ...prev, [productId]: 'saving' }));
    try {
      setEditableProductConfigs(prev => ({
        ...prev,
        [productId]: { ...prev[productId], inventory_type: newType }
      }));

      const configToSave = { ...editableProductConfigs[productId], inventory_type: newType };
      await saveMasterProductConfig(configToSave);

      setSavingStatus(prev => ({ ...prev, [productId]: 'saved' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productId]: null })), 2000);
      showSuccess(`Tipo de inventario de ${configToSave.productName} actualizado.`);

    } catch (e) {
      console.error("Error changing product inventory type:", e);
      setSavingStatus(prev => ({ ...prev, [productId]: 'error' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productId]: null })), 3000);
      showError('Error al cambiar el tipo de inventario del producto.');
    }
  }, [editableProductConfigs, saveMasterProductConfig]);

  const handleHideProductConfig = async (productId: number) => {
    setSavingStatus(prev => ({ ...prev, [productId]: 'saving' }));
    try {
      await deleteMasterProductConfig(productId);
      setSavingStatus(prev => ({ ...prev, [productId]: 'saved' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productId]: null })), 2000);
      
      // Recargar las configuraciones maestras para que el producto oculto desaparezca de la vista
      await loadMasterProductConfigs(showHiddenProducts);

      // Si hay una sesión activa, guardar el estado actual de filteredInventoryData
      if (sessionId && inventoryType && filteredInventoryData.length > 0) {
        await saveCurrentSession(filteredInventoryData, inventoryType, new Date());
      }
    } catch (e) {
      console.error("Error hiding product config:", e);
      setSavingStatus(prev => ({ ...prev, [productId]: 'error' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productId]: null })), 3000);
      showError('Error al ocultar la configuración del producto.');
    }
  };

  // --- Handlers para Product Rules (reglas múltiples) ---
  const handleAddRule = useCallback(async (productId: number) => {
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
      if (sessionId && inventoryType && filteredInventoryData.length > 0) {
        await saveCurrentSession(filteredInventoryData, inventoryType, new Date());
      }

    } catch (e) {
      console.error("Error adding rule:", e);
      setSavingStatus(prev => ({ ...prev, [productId]: 'error' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productId]: null })), 3000);
      showError('Error al añadir la regla.');
    }
  }, [editableProductConfigs, saveMasterProductConfig, sessionId, inventoryType, filteredInventoryData, saveCurrentSession]);

  const handleRuleChange = useCallback((
    productId: number,
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

  const handleRuleBlur = useCallback(async (productId: number) => {
    const config = editableProductConfigs[productId];
    if (!config) return;

    setSavingStatus(prev => ({ ...prev, [productId]: 'saving' }));
    try {
      await saveMasterProductConfig(config);
      setSavingStatus(prev => ({ ...prev, [productId]: 'saved' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productId]: null })), 2000);
      showSuccess('Regla actualizada y guardada.');

      // Actualizar el inventoryData de la sesión actual si está activa
      if (sessionId && inventoryType && filteredInventoryData.length > 0) {
        await saveCurrentSession(filteredInventoryData, inventoryType, new Date());
      }
    } catch (e) {
      console.error("Error saving rule on blur:", e);
      setSavingStatus(prev => ({ ...prev, [productId]: 'error' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [productId]: null })), 3000);
      showError('Error al guardar la regla.');
    }
  }, [editableProductConfigs, saveMasterProductConfig, sessionId, inventoryType, filteredInventoryData, saveCurrentSession]);

  const handleDeleteRule = useCallback(async (productId: number, ruleIndex: number) => {
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

  const handleClearLocalDatabase = async () => {
    await clearLocalDatabase();
  };

  const handleForceTotalSync = async () => {
    await syncToSupabase();
  };

  if (loading || isUploadingConfig) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-4">
        <p className="text-base sm:text-lg text-center text-gray-700">Cargando configuración...</p>
      </div>
    );
  }

  return (
    <div className="w-full p-4 bg-white text-gray-900">
      <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-6 text-gray-900">Configuración de Pedidos</h1>

      {/* Sección de Carga de Archivo DB */}
      <Card className="mb-8 bg-white text-gray-900 border-gray-200 shadow-md">
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl font-semibold text-gray-900">Actualizar Catálogo de Productos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <p className="text-center text-gray-700">
            Sube un nuevo archivo .db de Aronium para detectar nuevos productos o actualizar nombres.
            Tus configuraciones de proveedores, reglas y productos ocultos se mantendrán.
          </p>
          <FileUploader onFileLoaded={handleDbFileLoadedFromSettings} loading={isUploadingConfig} />
        </CardContent>
      </Card>

      {/* Sección de Reglas de Pedido por Producto */}
      <Card className="mb-8 bg-white text-gray-900 border-gray-200 shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg sm:text-xl font-semibold text-gray-900">Reglas de Pedido por Producto</CardTitle>
          <div className="flex items-center space-x-2">
            <Switch
              id="show-hidden-products"
              checked={showHiddenProducts}
              onCheckedChange={setShowHiddenProducts}
            />
            <label htmlFor="show-hidden-products" className="text-sm font-medium text-gray-700">
              {showHiddenProducts ? <EyeOff className="h-4 w-4 inline-block mr-1" /> : <Eye className="h-4 w-4 inline-block mr-1" />}
              Mostrar ocultos
            </label>
          </div>
        </CardHeader>
        <CardContent>
          {masterProductConfigs.length === 0 && !showHiddenProducts ? (
            <p className="text-center text-gray-500">
              No hay productos configurados. Por favor, sube un archivo .db para inicializar la lista.
            </p>
          ) : (
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
                            <TableHead className="text-xs sm:text-sm text-gray-700">Tipo Inventario</TableHead> {/* New Header */}
                            <TableHead className="text-xs sm:text-sm text-gray-700 text-center">Estado</TableHead>
                            <TableHead className="text-xs sm:text-sm text-gray-700 text-center">Acciones</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {products.map((config) => {
                            const isHidden = config.isHidden;
                            return (
                              <React.Fragment key={config.productId}>
                                <TableRow className={cn(
                                  "border-b border-gray-100 hover:bg-gray-100",
                                  isHidden && "bg-gray-50 text-gray-400 italic"
                                )}>
                                  <TableCell className="py-2 px-2 text-xs sm:text-sm font-medium">{config.productName}</TableCell>
                                  <TableCell className="py-2 px-2">
                                    <Select
                                      value={editableProductConfigs[config.productId]?.supplier ?? config.supplier}
                                      onValueChange={(value) => handleProductSupplierChange(config.productId, value)}
                                      disabled={isHidden}
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
                                  <TableCell className="py-2 px-2"> {/* New Cell for Inventory Type */}
                                    <Select
                                      value={editableProductConfigs[config.productId]?.inventory_type ?? 'monthly'}
                                      onValueChange={(value) => handleProductInventoryTypeChange(config.productId, value as 'weekly' | 'monthly' | 'ignored')}
                                      disabled={isHidden}
                                    >
                                      <SelectTrigger className="w-[120px] text-xs sm:text-sm">
                                        <SelectValue placeholder="Tipo Inventario" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="weekly">Semanal</SelectItem>
                                        <SelectItem value="monthly">Mensual</SelectItem>
                                        <SelectItem value="ignored">Ignorado</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                  <TableCell className="py-2 px-2 text-center">
                                    {savingStatus[config.productId] === 'saving' && (
                                      <Loader2 className="h-4 w-4 animate-spin text-blue-500 inline-block" />
                                    )}
                                    {savingStatus[config.productId] === 'saved' && (
                                      <CheckCircle className="h-4 w-4 text-green-500 inline-block" />
                                    )}
                                    {savingStatus[config.productId] === 'error' && (
                                      <XCircle className="h-4 w-4 text-red-500 inline-block" />
                                    )}
                                    {isHidden && !savingStatus[config.productId] && (
                                      <span className="text-xs text-gray-500">Oculto</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="py-2 px-2 text-center">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleHideProductConfig(config.productId)}
                                      className={cn(
                                        "h-7 w-7 p-0",
                                        isHidden ? "text-green-600 border-green-600 hover:bg-green-600 hover:text-white" : "text-red-600 border-red-600 hover:bg-red-600 hover:text-white"
                                      )}
                                      disabled={savingStatus[config.productId] === 'saving'}
                                    >
                                      {isHidden ? <Eye className="h-3 w-3" /> : <Trash2 className="h-3 w-3" />}
                                    </Button>
                                  </TableCell>
                                </TableRow>
                                {/* Fila para las reglas múltiples */}
                                <TableRow className={cn("bg-gray-50", isHidden && "bg-gray-100")}>
                                  <TableCell colSpan={5} className="py-2 px-2">
                                    <div className="flex flex-col gap-2 pl-4">
                                      <p className="text-xs font-semibold text-gray-700">Reglas de Pedido:</p>
                                      {(editableProductConfigs[config.productId]?.rules || []).map((rule, ruleIndex) => (
                                        <div key={ruleIndex} className="flex items-center gap-2 text-xs">
                                          <span>{'Si Stock es <='}</span>
                                          <Input
                                            type="number"
                                            value={rule.minStock}
                                            onChange={(e) => handleRuleChange(config.productId, ruleIndex, "minStock", e.target.value)}
                                            onBlur={() => handleRuleBlur(config.productId)}
                                            className="w-16 text-center"
                                            min="0"
                                            disabled={isHidden}
                                          />
                                          <span>Pedir</span>
                                          <Input
                                            type="number"
                                            value={rule.orderAmount}
                                            onChange={(e) => handleRuleChange(config.productId, ruleIndex, "orderAmount", e.target.value)}
                                            onBlur={() => handleRuleBlur(config.productId)}
                                            className="w-16 text-center"
                                            min="0"
                                            disabled={isHidden}
                                          />
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleDeleteRule(config.productId, ruleIndex)}
                                            className="h-6 w-6 text-red-500 hover:bg-red-100"
                                            disabled={isHidden}
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      ))}
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleAddRule(config.productId)}
                                        className="mt-2 w-fit text-blue-600 border-blue-600 hover:bg-blue-600 hover:text-white text-xs"
                                        disabled={isHidden}
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
          )}
        </CardContent>
      </Card>

      {/* Sección de Herramientas de Base de Datos */}
      <Card className="mb-8 bg-white text-gray-900 border-gray-200 shadow-md">
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl font-semibold text-gray-900">Herramientas de Base de Datos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="outline" 
                disabled={loading || !isOnline || isSupabaseSyncInProgress}
                className="text-blue-600 border-blue-600 hover:bg-blue-600 hover:text-white"
              >
                <RefreshCcw className={cn("h-4 w-4 mr-2", isSupabaseSyncInProgress && "animate-spin")} />
                Forzar Sincronización Total
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Estás seguro de forzar la sincronización?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta acción intentará subir todos tus cambios locales pendientes a la nube y luego descargará las últimas configuraciones y sesiones de la nube, resolviendo conflictos.
                  Esto puede tardar unos segundos. Asegúrate de tener una conexión a internet estable.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleForceTotalSync} disabled={!isOnline || isSupabaseSyncInProgress}>
                  Sí, Forzar Sincronización
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={loading}>
                Limpiar Base de Datos Local
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta acción eliminará *toda* la información guardada localmente en tu navegador (sesiones de inventario, configuraciones de productos).
                  Una vez eliminados, los datos se recargarán automáticamente desde la nube (Supabase) si hay conexión.
                  Si no hay conexión a la nube, los datos se perderán permanentemente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearLocalDatabase} className="bg-red-600 hover:bg-red-700">
                  Sí, limpiar base de datos
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;