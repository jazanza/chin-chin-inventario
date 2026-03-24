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
import { Loader2, Trash2, PlusCircle, Eye, EyeOff, Upload, RefreshCcw, Save } from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { MasterProductConfig, ProductRule } from "@/lib/persistence";
import { FileUploader } from "@/components/FileUploader";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";


const SettingsPage = () => {
  const {
    masterProductConfigs,
    saveAllMasterProductConfigs,
    deleteMasterProductConfig,
    loading,
    processDbForMasterConfigs,
    loadMasterProductConfigs,
    clearLocalDatabase,
    forceDownloadConfigFromSupabase,
    isOnline,
    isSupabaseSyncInProgress,
  } = useInventoryContext();

  const [editableProductConfigs, setEditableProductConfigs] = useState<{
    [productId: number]: MasterProductConfig;
  }>({});
  const [showHiddenProducts, setShowHiddenProducts] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
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


  // Agrupar productos por proveedor
  const productsGroupedBySupplier = useMemo(() => {
    const grouped: { [supplier: string]: MasterProductConfig[] } = {};
    Object.values(editableProductConfigs).forEach((config: MasterProductConfig) => {
      if (!grouped[config.supplier]) {
        grouped[config.supplier] = [];
      }
      grouped[config.supplier].push(config);
    });
    for (const supplier in grouped) {
      grouped[supplier].sort((a, b) => a.productName.localeCompare(b.productName));
    }
    return grouped;
  }, [editableProductConfigs]);

  const allSuppliers = useMemo(() => {
    const suppliers = new Set<string>();
    masterProductConfigs.forEach(config => suppliers.add(config.supplier));
    return Array.from(suppliers).sort();
  }, [masterProductConfigs]);

  const handleProductSupplierChange = (productId: number, newSupplier: string) => {
    setEditableProductConfigs(prev => ({
      ...prev,
      [productId]: { ...prev[productId], supplier: newSupplier }
    }));
  };

  const handleProductInventoryTypeChange = (productId: number, newType: 'weekly' | 'monthly' | 'ignored') => {
    setEditableProductConfigs(prev => ({
      ...prev,
      [productId]: { ...prev[productId], inventory_type: newType }
    }));
  };

  const handleHideProductConfig = async (productId: number) => {
    try {
      await deleteMasterProductConfig(productId);
      showSuccess("✓ Visibilidad actualizada");
    } catch (e) {
      console.error("Error hiding product config:", e);
      showError("✗ Error al actualizar visibilidad.");
    }
  };

  const handleAddRule = (productId: number) => {
    const currentConfig = editableProductConfigs[productId];
    if (!currentConfig) return;

    const newRule: ProductRule = { minStock: 0, orderAmount: 0 };
    const updatedRules = [...(currentConfig.rules || []), newRule];
    const updatedConfig = { ...currentConfig, rules: updatedRules };

    setEditableProductConfigs(prev => ({ ...prev, [productId]: updatedConfig }));
  };

  const handleRuleChange = (
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
  };

  const handleDeleteRule = (productId: number, ruleIndex: number) => {
    const config = editableProductConfigs[productId];
    if (config) {
      const updatedRules = config.rules.filter((_, idx) => idx !== ruleIndex);
      setEditableProductConfigs(prev => ({
        ...prev,
        [productId]: { ...config, rules: updatedRules }
      }));
    }
  };

  const handleSaveAllChanges = async () => {
    setIsSaving(true);
    try {
      const configsArray = Object.values(editableProductConfigs);
      await saveAllMasterProductConfigs(configsArray);
      showSuccess("✓ Cambios guardados correctamente");
    } catch (err) {
      console.error("Error al guardar configuraciones:", err);
      showError("✗ Error al guardar. Intenta nuevamente.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDbFileLoadedFromSettings = async (buffer: Uint8Array) => {
    setIsUploadingConfig(true);
    try {
      await processDbForMasterConfigs(buffer);
    } catch (error) {
      console.error("Error uploading DB:", error);
      showError("Error al cargar el archivo DB.");
    } finally {
      setIsUploadingConfig(false);
    }
  };

  const handleClearLocalDatabase = async () => {
    await clearLocalDatabase();
  };

  const handleForceTotalSync = async () => {
    await forceDownloadConfigFromSupabase();
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
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">Configuración de Pedidos</h1>
        <Button 
          onClick={handleSaveAllChanges} 
          disabled={isSaving || !isOnline} 
          className="bg-green-600 hover:bg-green-700 text-white font-bold text-sm sm:text-base min-w-[160px]"
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Guardar cambios
            </>
          )}
        </Button>
      </div>

      <Card className="mb-8 bg-white text-gray-900 border-gray-200 shadow-md">
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl font-semibold text-gray-900">Actualizar Catálogo de Productos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <p className="text-center text-gray-700">
            Sube un nuevo archivo .db de Aronium para detectar nuevos productos o actualizar nombres.
          </p>
          <FileUploader onFileLoaded={handleDbFileLoadedFromSettings} loading={isUploadingConfig} />
        </CardContent>
      </Card>

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
            <p className="text-center text-gray-500">No hay productos configurados.</p>
          ) : (
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
                            <TableHead className="text-xs sm:text-sm text-gray-700">Proveedor</TableHead>
                            <TableHead className="text-xs sm:text-sm text-gray-700">Tipo Inventario</TableHead>
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
                                        <SelectValue placeholder="Proveedor" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {allSuppliers.map(sup => (
                                          <SelectItem key={sup} value={sup}>{sup}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                  <TableCell className="py-2 px-2">
                                    <Select
                                      value={editableProductConfigs[config.productId]?.inventory_type ?? 'monthly'}
                                      onValueChange={(value) => handleProductInventoryTypeChange(config.productId, value as 'weekly' | 'monthly' | 'ignored')}
                                      disabled={isHidden}
                                    >
                                      <SelectTrigger className="w-[120px] text-xs sm:text-sm">
                                        <SelectValue placeholder="Tipo" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="weekly">Semanal</SelectItem>
                                        <SelectItem value="monthly">Mensual</SelectItem>
                                        <SelectItem value="ignored">Ignorado</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                  <TableCell className="py-2 px-2 text-center">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleHideProductConfig(config.productId)}
                                      className={cn("h-7 w-7 p-0", isHidden ? "text-green-600 border-green-600" : "text-red-600 border-red-600")}
                                    >
                                      {isHidden ? <Eye className="h-3 w-3" /> : <Trash2 className="h-3 w-3" />}
                                    </Button>
                                  </TableCell>
                                </TableRow>
                                <TableRow className={cn("bg-gray-50", isHidden && "bg-gray-100")}>
                                  <TableCell colSpan={4} className="py-2 px-2">
                                    <div className="flex flex-col gap-2 pl-4">
                                      {(editableProductConfigs[config.productId]?.rules || []).map((rule, ruleIndex) => (
                                        <div key={ruleIndex} className="flex items-center gap-2 text-xs">
                                          <span>{'Si Stock <='}</span>
                                          <Input
                                            type="number"
                                            value={rule.minStock}
                                            onChange={(e) => handleRuleChange(config.productId, ruleIndex, "minStock", e.target.value)}
                                            className="w-16 text-center"
                                            disabled={isHidden}
                                          />
                                          <span>Pedir</span>
                                          <Input
                                            type="number"
                                            value={rule.orderAmount}
                                            onChange={(e) => handleRuleChange(config.productId, ruleIndex, "orderAmount", e.target.value)}
                                            className="w-16 text-center"
                                            disabled={isHidden}
                                          />
                                          <Button variant="ghost" size="icon" onClick={() => handleDeleteRule(config.productId, ruleIndex)} className="h-6 w-6 text-red-500" disabled={isHidden}>
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      ))}
                                      <Button variant="outline" size="sm" onClick={() => handleAddRule(config.productId)} className="mt-2 w-fit text-blue-600 border-blue-600 text-xs" disabled={isHidden}>
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

      <Card className="mb-8 bg-white text-gray-900 border-gray-200 shadow-md">
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl font-semibold text-gray-900">Herramientas de Base de Datos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={loading || !isOnline || isSupabaseSyncInProgress} className="text-blue-600 border-blue-600">
                <RefreshCcw className={cn("h-4 w-4 mr-2", isSupabaseSyncInProgress && "animate-spin")} />
                Forzar Sincronización Total
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Forzar sincronización de emergencia?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esto borrará todos los datos locales y descargará la versión maestra de Supabase. Úsalo si ves datos corruptos o desincronizados.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleForceTotalSync}>Sí, Restaurar Datos</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={loading}>Limpiar Base de Datos Local</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Limpiar base de datos local?</AlertDialogTitle>
                <AlertDialogDescription>Esta acción eliminará todos los datos locales. Se recargarán de la nube si hay conexión.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearLocalDatabase} className="bg-red-600">Sí, Limpiar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;