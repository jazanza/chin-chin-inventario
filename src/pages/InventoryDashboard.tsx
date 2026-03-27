import { useState, useEffect, useCallback } from "react";
import { FileUploader } from "@/components/FileUploader";
import { InventoryTypeSelector } from "@/components/InventoryTypeSelector";
import { InventoryTable } from "@/components/InventoryTable";
import { useInventoryContext } from "@/context/InventoryContext";
import { SessionManager } from "@/components/SessionManager";
import { Button } from "@/components/ui/button";
import { PlusCircle, RefreshCcw, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { showSuccess, showError } from "@/utils/toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const InventoryDashboard = () => {
  const {
    dbBuffer,
    inventoryType,
    filteredInventoryData,
    loading,
    error,
    sessionId,
    setDbBuffer,
    setInventoryType,
    resetInventoryState,
    getSessionHistory,
    saveCurrentSession,
    isOnline,
    processInventoryData,
    hasUnsavedChanges,
    setHasUnsavedChanges,
  } = useInventoryContext();
  
  const [showFileUploader, setShowFileUploader] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<any[] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);

  // Efecto para cargar el historial de sesiones
  useEffect(() => {
    const fetchHistory = async () => {
      const history = await getSessionHistory();
      setSessionHistory(history);
    };
    fetchHistory();
  }, [getSessionHistory, sessionId, loading]);

  // Disparar processInventoryData cuando dbBuffer e inventoryType están presentes (Nueva Sesión)
  useEffect(() => {
    const processData = async () => {
      if (dbBuffer && inventoryType && !sessionId) {
        try {
          await processInventoryData(dbBuffer, inventoryType);
        } catch (e) {
          console.error("Error processing inventory data:", e);
        }
      }
    };
    processData();
  }, [dbBuffer, inventoryType, sessionId, processInventoryData]);

  const handleFileLoaded = (buffer: Uint8Array) => {
    setDbBuffer(buffer);
    setInventoryType(null);
    setShowFileUploader(false);
  };

  // FIXED: Replaced recursive self-call with proper state setter to prevent stack overflow
  const handleInventoryTypeSelect = (type: "weekly" | "monthly") => {
    setInventoryType(type);
  };

  const handleManualSave = async () => {
    if (!sessionId || !inventoryType || filteredInventoryData.length === 0) return;
    
    setIsSaving(true);
    try {
      await saveCurrentSession(filteredInventoryData, inventoryType, new Date());
      showSuccess("✓ Cambios guardados correctamente");
    } catch (err) {
      console.error('Error al guardar inventario:', err);
      showError("✗ Error al guardar. Intenta nuevamente.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartNewSession = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowExitDialog(true);
      return;
    }
    resetInventoryState();
    setDbBuffer(null);
    setInventoryType(null);
    setShowFileUploader(true);
  }, [hasUnsavedChanges, resetInventoryState, setDbBuffer, setInventoryType]);

  const confirmExitAndSave = async () => {
    await handleManualSave();
    setShowExitDialog(false);
    resetInventoryState();
    setDbBuffer(null);
    setInventoryType(null);
    setShowFileUploader(true);
  };

  const confirmExitWithoutSaving = () => {
    setHasUnsavedChanges(false);
    setShowExitDialog(false);
    resetInventoryState();
    setDbBuffer(null);
    setInventoryType(null);
    setShowFileUploader(true);
  };

  // --- LÓGICA DE RENDERIZADO PRIORIZADA ---

  if (loading && !sessionId) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-4" />
        <p className="text-base sm:text-lg text-center text-gray-700">Procesando datos...</p>
      </div>
    );
  }

  if (sessionId && inventoryType) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex flex-col p-4">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">
              Inventario {inventoryType === "weekly" ? "Semanal" : "Mensual"}
            </h1>
            {hasUnsavedChanges && (
              <span className="flex items-center gap-1 text-xs font-medium text-yellow-600 bg-yellow-50 px-2 py-1 rounded-full border border-yellow-200">
                <AlertTriangle className="h-3 w-3" />
                Cambios sin guardar
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button               onClick={handleManualSave}               disabled={isSaving || !isOnline || !hasUnsavedChanges} 
              className={cn(
                "font-bold text-sm sm:text-base min-w-[160px] transition-all",
                hasUnsavedChanges ? "bg-green-600 hover:bg-green-700 text-white" : "bg-gray-100 text-gray-400"
              )}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Guardar cambios
                </>
              )}
            </Button>
            <Button onClick={handleStartNewSession} disabled={loading} variant="outline" className="text-blue-600 border-blue-600 hover:bg-blue-50 font-bold text-sm sm:text-base">
              <PlusCircle className="mr-2 h-4 w-4" /> Nueva Sesión            </Button>
          </div>
        </div>
        
        <InventoryTable inventoryData={filteredInventoryData} />

        <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Tienes cambios sin guardar</AlertDialogTitle>
              <AlertDialogDescription>
                ¿Deseas guardar los cambios antes de iniciar una nueva sesión? Si no los guardas, se perderán.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
              <AlertDialogCancel onClick={() => setShowExitDialog(false)}>Cancelar</AlertDialogCancel>
              <Button variant="destructive" onClick={confirmExitWithoutSaving}>No guardar</Button>
              <Button className="bg-green-600 hover:bg-green-700" onClick={confirmExitAndSave}>Guardar y Continuar</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  if (dbBuffer && !inventoryType) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-4">
        <InventoryTypeSelector onSelect={handleInventoryTypeSelect} loading={loading} />
      </div>
    );
  }

  if (showFileUploader) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-4 text-gray-900">Nueva Sesión de Inventario</h1>
          <FileUploader onFileLoaded={handleFileLoaded} loading={loading} />
          {sessionHistory && sessionHistory.length > 0 && (
            <Button 
              onClick={() => setShowFileUploader(false)} 
              variant="link" 
              className="mt-4 text-blue-600 hover:text-blue-800"
            >
              Volver al historial
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (sessionHistory && sessionHistory.length > 0) {
    return <SessionManager onStartNewSession={handleStartNewSession} />;
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-4 text-gray-900">Chin Chin Inventarios y Pedidos</h1>
        <FileUploader onFileLoaded={handleFileLoaded} loading={loading} />
      </div>
    </div>
  );
};

export default InventoryDashboard;