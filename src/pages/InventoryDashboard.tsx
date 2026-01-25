import { useState, useEffect, useCallback } from "react";
import { FileUploader } from "@/components/FileUploader";
import { InventoryTypeSelector } from "@/components/InventoryTypeSelector";
import { InventoryTable } from "@/components/InventoryTable";
import { useInventoryContext, InventoryItem } from "@/context/InventoryContext";
import { SessionManager } from "@/components/SessionManager";
import { Button } from "@/components/ui/button";
import { PlusCircle, RefreshCcw } from "lucide-react"; // Importar RefreshCcw
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils"; // Importar cn para estilos condicionales

const InventoryDashboard = () => {
  const { 
    dbBuffer, 
    inventoryType, 
    filteredInventoryData, // Ahora usamos filteredInventoryData
    loading, 
    error, 
    sessionId, 
    setDbBuffer, 
    setInventoryType, 
    setRawInventoryItemsFromDb, // Nuevo setter para raw items
    resetInventoryState,
    getSessionHistory,
    syncFromSupabase,
    processDbForMasterConfigs, // Importar para 'Actualizar solo nuevos'
    resetAllProductConfigs, // Importar para 'Reiniciar toda la configuración'
    isOnline, // Para deshabilitar el botón si no hay conexión
    isSupabaseSyncInProgress, // Para deshabilitar el botón si ya está en curso
    flushPendingSessionSave, // Importar la nueva función para forzar el guardado
    updateSyncStatus, // Importar para actualizar el estado de sincronización
  } = useInventoryContext();
  
  const [hasSessionHistory, setHasSessionHistory] = useState(false);
  const [showFileUploader, setShowFileUploader] = useState(false);
  const [initialSyncDone, setInitialSyncDone] = useState(false);
  // Eliminado dbBufferForConfigOptions y showConfigOptions ya que la carga de config se mueve a SettingsPage

  useEffect(() => {
    const checkHistory = async () => {
      const history = await getSessionHistory();
      setHasSessionHistory(history.length > 0);
      
      // Si no hay historial y no hay dbBuffer ni sessionId, mostrar el FileUploader por defecto
      if (history.length === 0 && !dbBuffer && !sessionId) {
        setShowFileUploader(true);
      }
    };
    checkHistory();
  }, [getSessionHistory, dbBuffer, sessionId]);

  // Manejar la sincronización inicial desde Supabase
  useEffect(() => {
    const performInitialSync = async () => {
      if (!initialSyncDone) {
        // Verificar si hay sesiones locales
        const localSessions = await getSessionHistory();
        
        // Si no hay sesiones locales, intentar sincronizar desde Supabase
        if (localSessions.length === 0) {
          await syncFromSupabase("InventoryDashboard_InitialSync"); // <-- FIX: Añadir origen
          
          // Volver a verificar el historial después de la sincronización
          const updatedHistory = await getSessionHistory();
          setHasSessionHistory(updatedHistory.length > 0);
          
          // Si después de sincronizar hay sesiones, mostrar el SessionManager
          if (updatedHistory.length > 0 && !dbBuffer && !sessionId) {
            setShowFileUploader(false);
          }
        }
        
        setInitialSyncDone(true);
      }
    };

    performInitialSync();
  }, [getSessionHistory, syncFromSupabase, dbBuffer, sessionId, initialSyncDone]);

  const handleFileLoaded = (buffer: Uint8Array) => {
    setDbBuffer(buffer); // Guardar el buffer en el contexto para el inventario
    // Ya no se necesita dbBufferForConfigOptions ni showConfigOptions aquí
    setInventoryType(null); // Reset inventory type selection
    setShowFileUploader(false); // Ocultar FileUploader una vez que el archivo está cargado
  };

  const handleInventoryChange = (updatedData: InventoryItem[]) => {
    // Cuando la tabla edita, actualiza la lista filtrada, que luego se guarda en la sesión
    // No necesitamos un setter para rawInventoryItemsFromDb aquí, ya que la tabla edita la lista filtrada
    // y saveCurrentSession tomará la lista filtrada directamente.
    // La lógica de saveCurrentSession ya está ajustada para recibir la lista filtrada.
  };

  const handleInventoryTypeSelect = (type: "weekly" | "monthly") => {
    setInventoryType(type);
  };

  const handleStartNewSession = useCallback(() => {
    resetInventoryState(); // Resetear el estado del inventario (excepto dbBuffer si ya estaba cargado)
    setDbBuffer(null); // Forzar la carga de un nuevo archivo DB
    setInventoryType(null); // Asegurarse de que el tipo de inventario se seleccione de nuevo
    setShowFileUploader(true); // Mostrar el FileUploader para la nueva sesión
    // Limpiado dbBufferForConfigOptions y showConfigOptions
  }, [resetInventoryState, setDbBuffer, setInventoryType]);

  const handleManualSync = async () => {
    // 1. Forzar el guardado de cualquier cambio pendiente en la sesión actual
    flushPendingSessionSave();
    // Dar un pequeño respiro para que Dexie procese el flush (aunque es síncrono, es buena práctica)
    await new Promise(resolve => setTimeout(resolve, 50)); 
    
    // 2. Luego, iniciar la sincronización total con Supabase
    await syncFromSupabase("UserManualSave", true);
    updateSyncStatus(); // Asegurarse de que el estado de sincronización se actualice
  };

  // Eliminados handleUpdateOnlyNew y handleResetAndReload ya que la lógica se mueve a SettingsPage


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
          <InventoryTable inventoryData={filteredInventoryData} onInventoryChange={handleInventoryChange} />
        )}
      </div>
    );
  }

  // 2. Si no hay dbBuffer cargado, no se ha forzado el FileUploader, y hay historial, mostrar SessionManager
  // Este es el punto de entrada cuando la app inicia con sesiones existentes.
  if (!dbBuffer && !showFileUploader && (hasSessionHistory || initialSyncDone)) {
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