import { useState, useEffect, useCallback } from "react";
import { FileUploader } from "@/components/FileUploader";
import { InventoryTypeSelector } from "@/components/InventoryTypeSelector";
import { InventoryTable } from "@/components/InventoryTable";
import { useInventoryContext, InventoryItem } from "@/context/InventoryContext";
import { SessionManager } from "@/components/SessionManager";
import { Button } from "@/components/ui/button";
import { PlusCircle, RefreshCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    updateSyncStatus, // Importado correctamente
    fetchInitialData,
  } = useInventoryContext();
  
  const [hasSessionHistory, setHasSessionHistory] = useState(false);
  const [showFileUploader, setShowFileUploader] = useState(false);
  const [initialSyncDone, setInitialSyncDone] = useState(false);

  // 1. Verificar historial y decidir qué mostrar al inicio
  useEffect(() => {
    const checkHistory = async () => {
      const history = await getSessionHistory();
      setHasSessionHistory(history.length > 0);
      
      // Si no hay historial y no hay dbBuffer ni sessionId, mostrar el FileUploader por defecto
      if (history.length === 0 && !dbBuffer && !sessionId) {
        setShowFileUploader(true);
      }
      setInitialSyncDone(true); // Marcar como hecho después de la primera verificación
    };
    checkHistory();
  }, [getSessionHistory, dbBuffer, sessionId]);

  // 2. Manejar la carga inicial de datos de la nube (si Dexie estaba vacío)
  useEffect(() => {
    // fetchInitialData se llama en el contexto si Dexie está vacío.
    // Aquí solo nos aseguramos de que el estado de la UI se actualice después de la carga.
    if (!initialSyncDone) {
      fetchInitialData().then(() => {
        // Después de la carga inicial, re-verificamos el historial
        getSessionHistory().then(history => {
          setHasSessionHistory(history.length > 0);
          if (history.length > 0 && !dbBuffer && !sessionId) {
            setShowFileUploader(false);
          }
          setInitialSyncDone(true);
        });
      });
    }
  }, [fetchInitialData, getSessionHistory, dbBuffer, sessionId, initialSyncDone]);


  const handleFileLoaded = (buffer: Uint8Array) => {
    setDbBuffer(buffer); // Guardar el buffer en el contexto para el inventario
    setInventoryType(null); // Reset inventory type selection
    setShowFileUploader(false); // Ocultar FileUploader una vez que el archivo está cargado
  };

  const handleInventoryChange = (updatedData: InventoryItem[]) => {
    // La lógica de guardado debounced se maneja en InventoryTable y Context
  };

  const handleInventoryTypeSelect = (type: "weekly" | "monthly") => {
    setInventoryType(type);
  };

  const handleStartNewSession = useCallback(() => {
    resetInventoryState(); // Resetear el estado del inventario
    setDbBuffer(null); // Forzar la carga de un nuevo archivo DB
    setInventoryType(null); // Asegurarse de que el tipo de inventario se seleccione de nuevo
    setShowFileUploader(true); // Mostrar el FileUploader para la nueva sesión
  }, [resetInventoryState, setDbBuffer, setInventoryType]);

  const handleManualSync = async () => {
    // 1. Forzar el guardado de cualquier cambio pendiente en la sesión actual
    flushPendingSessionSave();
    // Dar un pequeño respiro para que Dexie procese el flush
    await new Promise(resolve => setTimeout(resolve, 50)); 
    
    // 2. Luego, iniciar la sincronización total con Supabase
    await syncToSupabase();
    updateSyncStatus(); // Asegurarse de que el estado de sincronización se actualice
  };

  // Lógica de renderizado condicional
  if (loading && !initialSyncDone) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-4">
        <p className="text-base sm:text-lg text-center text-gray-700">Cargando o procesando datos...</p>
        {error && <p className="text-base sm:text-lg mt-4 text-red-500">Error: {error}</p>}
      </div>
    );
  }

  // 1. Si una sesión está completamente cargada (nueva o del historial), mostrar la InventoryTable
  if (sessionId && inventoryType && filteredInventoryData.length > 0) {
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
        ) : (
          <InventoryTable inventoryData={filteredInventoryData} />
        )}
      </div>
    );
  }

  // 2. Si no hay dbBuffer cargado, no se ha forzado el FileUploader, y hay historial, mostrar SessionManager
  // Este es el punto de entrada cuando la app inicia con sesiones existentes.
  if (!dbBuffer && !showFileUploader && hasSessionHistory) {
    return <SessionManager onStartNewSession={handleStartNewSession} />;
  }

  // 3. Si no hay dbBuffer cargado, o se ha forzado el FileUploader (ej. se hizo clic en "Nueva Sesión")
  // Esto es para iniciar una sesión completamente nueva subiendo un archivo.
  if (!dbBuffer || showFileUploader) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-4 text-gray-900">Chin Chin Inventarios y Pedidos</h1>
          <FileUploader onFileLoaded={handleFileLoaded} loading={loading} />
          {error && <p className="text-base sm:text-lg mt-4 text-red-500">Error: {error}</p>}
          {hasSessionHistory && ( // Solo mostrar "O cargar una sesión existente" si hay historial
            <Button 
              onClick={() => setShowFileUploader(false)} // Este botón debe ocultar FileUploader y mostrar SessionManager
              variant="link" 
              className="mt-4 text-blue-600 hover:text-blue-800"
            >
              O cargar una sesión existente
            </Button>
          )}
        </div>
      </div>
    );
  }

  // 4. Si dbBuffer está cargado, pero el tipo de inventario aún no ha sido seleccionado
  if (dbBuffer && !inventoryType) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-4">
        <InventoryTypeSelector onSelect={handleInventoryTypeSelect} loading={loading} />
        {error && <p className="text-base sm:text-lg mt-4 text-red-500">Error: {error}</p>}
      </div>
    );
  }

  // Fallback, idealmente no debería alcanzarse si la lógica es completa
  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-4">
      <p className="text-base sm:text-lg text-center text-gray-700">Cargando base de datos. Espera unos segundo.</p>
    </div>
  );
};

export default InventoryDashboard;