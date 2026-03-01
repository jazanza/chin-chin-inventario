import { useState, useEffect, useCallback } from "react";
import { FileUploader } from "@/components/FileUploader";
import { InventoryTypeSelector } from "@/components/InventoryTypeSelector";
import { InventoryTable } from "@/components/InventoryTable";
import { useInventoryContext } from "@/context/InventoryContext";
import { SessionManager } from "@/components/SessionManager";
import { Button } from "@/components/ui/button";
import { PlusCircle, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";

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
    syncToSupabase,
    isOnline,
    isSupabaseSyncInProgress,
    flushPendingSessionSave,
    updateSyncStatus,
    processInventoryData,
  } = useInventoryContext();
  
  const [showFileUploader, setShowFileUploader] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<any[] | null>(null);

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

  const handleInventoryTypeSelect = (type: "weekly" | "monthly") => {
    setInventoryType(type);
  };

  const handleStartNewSession = useCallback(() => {
    resetInventoryState();
    setDbBuffer(null);
    setInventoryType(null);
    setShowFileUploader(true);
  }, [resetInventoryState, setDbBuffer, setInventoryType]);

  const handleManualSync = async () => {
    flushPendingSessionSave();
    await new Promise(resolve => setTimeout(resolve, 50)); 
    await syncToSupabase();
    updateSyncStatus();
  };

  // --- LÓGICA DE RENDERIZADO PRIORIZADA ---

  // 1. Estado de carga global (solo si no hay sesión activa)
  if (loading && !sessionId) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-4">
        <p className="text-base sm:text-lg text-center text-gray-700">Cargando o procesando datos...</p>
        {error && <p className="text-base sm:text-lg mt-4 text-red-500">Error: {error}</p>}
      </div>
    );
  }

  // 2. SI HAY SESIÓN ACTIVA: Mostrar la tabla (Prioridad Máxima)
  if (sessionId && inventoryType) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex flex-col p-4">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">
            Inventario {inventoryType === "weekly" ? "Semanal" : "Mensual"}
          </h1>
          <div className="flex gap-2">
            <Button 
              onClick={handleManualSync} 
              disabled={loading || !isOnline || isSupabaseSyncInProgress} 
              className="bg-green-600 hover:bg-green-700 text-white font-bold text-sm sm:text-base"
            >
              <RefreshCcw className={cn("mr-2 h-4 w-4", isSupabaseSyncInProgress && "animate-spin")} />
              Guardar y Sincronizar Ahora
            </Button>
            <Button onClick={handleStartNewSession} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm sm:text-base">
              <PlusCircle className="mr-2 h-4 w-4" /> Nueva Sesión
            </Button>
          </div>
        </div>
        {error ? (
          <p className="text-base sm:text-lg text-red-500 text-center">Error: {error}</p>
        ) : filteredInventoryData.length === 0 && !loading ? (
          <div className="text-center p-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
            <p className="text-gray-600">No hay productos configurados para este tipo de inventario.</p>
            <p className="text-sm text-gray-500 mt-2">Verifica la configuración de productos o sincroniza con la nube.</p>
          </div>
        ) : (
          <InventoryTable inventoryData={filteredInventoryData} />
        )}
      </div>
    );
  }

  // 3. SI HAY BUFFER PERO NO TIPO: Mostrar selector de tipo
  if (dbBuffer && !inventoryType) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-4">
        <InventoryTypeSelector onSelect={handleInventoryTypeSelect} loading={loading} />
      </div>
    );
  }

  // 4. SI SE FORZÓ EL UPLOADER (Botón Nueva Sesión)
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

  // 5. SI HAY HISTORIAL: Mostrar el gestor de sesiones (Vista por defecto)
  if (sessionHistory && sessionHistory.length > 0) {
    return <SessionManager onStartNewSession={handleStartNewSession} />;
  }

  // 6. POR DEFECTO: Mostrar cargador de archivos
  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-4 text-gray-900">Chin Chin Inventarios y Pedidos</h1>
        <FileUploader onFileLoaded={handleFileLoaded} loading={loading} />
        {error && <p className="text-base sm:text-lg mt-4 text-red-500">Error: {error}</p>}
      </div>
    </div>
  );
};

export default InventoryDashboard;