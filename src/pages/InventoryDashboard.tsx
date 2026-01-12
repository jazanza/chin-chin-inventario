import { useState, useEffect, useCallback } from "react";
import { FileUploader } from "@/components/FileUploader";
import { InventoryTypeSelector } from "@/components/InventoryTypeSelector";
import { InventoryTable } from "@/components/InventoryTable";
import { useInventoryContext, InventoryItem } from "@/context/InventoryContext";
import { SessionManager } from "@/components/SessionManager";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const InventoryDashboard = () => {
  const { 
    dbBuffer, 
    inventoryType, 
    inventoryData, 
    loading, 
    error, 
    sessionId, 
    setDbBuffer, 
    setInventoryType, 
    setInventoryData, 
    resetInventoryState,
    getSessionHistory,
    syncFromSupabase,
    processDbForMasterConfigs, // Importar para 'Actualizar solo nuevos'
    resetAllProductConfigs, // Importar para 'Reiniciar toda la configuración'
  } = useInventoryContext();
  
  const [hasSessionHistory, setHasSessionHistory] = useState(false);
  const [showFileUploader, setShowFileUploader] = useState(false);
  const [initialSyncDone, setInitialSyncDone] = useState(false);
  const [dbBufferForConfigOptions, setDbBufferForConfigOptions] = useState<Uint8Array | null>(null); // Para guardar el buffer temporalmente
  const [showConfigOptions, setShowConfigOptions] = useState(false); // Para mostrar las opciones de configuración

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
          await syncFromSupabase();
          
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
    setDbBufferForConfigOptions(buffer); // Guardar el buffer temporalmente para las opciones de configuración
    setInventoryType(null); // Reset inventory type selection
    setShowFileUploader(false); // Ocultar FileUploader una vez que el archivo está cargado
    setShowConfigOptions(true); // Mostrar las opciones de configuración
  };

  const handleInventoryTypeSelect = (type: "weekly" | "monthly") => {
    setInventoryType(type);
  };

  const handleInventoryChange = (updatedData: InventoryItem[]) => {
    setInventoryData(updatedData); // Actualizar el estado global del inventario
  };

  const handleStartNewSession = useCallback(() => {
    resetInventoryState(); // Resetear el estado del inventario (excepto dbBuffer si ya estaba cargado)
    setDbBuffer(null); // Forzar la carga de un nuevo archivo DB
    setInventoryType(null); // Asegurarse de que el tipo de inventario se seleccione de nuevo
    setShowFileUploader(true); // Mostrar el FileUploader para la nueva sesión
    setShowConfigOptions(false); // Ocultar opciones de configuración
    setDbBufferForConfigOptions(null); // Limpiar buffer temporal
  }, [resetInventoryState, setDbBuffer, setInventoryType]);

  const handleUpdateOnlyNew = useCallback(async () => {
    if (dbBufferForConfigOptions) {
      await processDbForMasterConfigs(dbBufferForConfigOptions);
      setShowConfigOptions(false); // Ocultar opciones después de procesar
      setDbBufferForConfigOptions(null); // Limpiar buffer temporal
    }
  }, [dbBufferForConfigOptions, processDbForMasterConfigs]);

  const handleResetAndReload = useCallback(async () => {
    if (dbBufferForConfigOptions) {
      await resetAllProductConfigs(dbBufferForConfigOptions);
      setShowConfigOptions(false); // Ocultar opciones después de procesar
      setDbBufferForConfigOptions(null); // Limpiar buffer temporal
    }
  }, [dbBufferForConfigOptions, resetAllProductConfigs]);


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
  if (sessionId && inventoryType && inventoryData.length > 0) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex flex-col p-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">
            Inventario {inventoryType === "weekly" ? "Semanal" : "Mensual"}
          </h1>
          <Button onClick={handleStartNewSession} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm sm:text-base">
            <PlusCircle className="mr-2 h-4 w-4" /> Nueva Sesión
          </Button>
        </div>
        {error ? (
          <p className="text-base sm:text-lg text-red-500 text-center">Error: {error}</p>
        ) : (
          <InventoryTable inventoryData={inventoryData} onInventoryChange={handleInventoryChange} />
        )}
      </div>
    );
  }

  // 2. Si no hay dbBuffer cargado, no se ha forzado el FileUploader, y hay historial, mostrar SessionManager
  // Este es el punto de entrada cuando la app inicia con sesiones existentes.
  if (!dbBuffer && !showFileUploader && (hasSessionHistory || initialSyncDone)) {
    return <SessionManager onStartNewSession={handleStartNewSession} />;
  }

  // 3. Si dbBuffer está cargado y se deben mostrar las opciones de configuración
  if (dbBufferForConfigOptions && showConfigOptions) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white text-gray-900 border-gray-200 shadow-md">
          <CardHeader>
            <CardTitle className="text-xl sm:text-2xl text-center text-gray-900">Opciones de Configuración</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-center text-gray-700">Se ha cargado un archivo .db. ¿Cómo deseas procesar las configuraciones de productos?</p>
            <Button
              onClick={handleUpdateOnlyNew}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-base"
            >
              Actualizar solo nuevos productos
            </Button>
            <Button
              onClick={handleResetAndReload}
              disabled={loading}
              variant="destructive"
              className="font-bold text-base"
            >
              Reiniciar toda la configuración
            </Button>
            <Button
              onClick={() => {
                setDbBuffer(null); // Limpiar el buffer del contexto
                setDbBufferForConfigOptions(null); // Limpiar el buffer temporal
                setShowConfigOptions(false); // Ocultar opciones
                setShowFileUploader(true); // Volver al uploader
              }}
              variant="link"
              className="text-blue-600 hover:text-blue-800"
            >
              Cancelar
            </Button>
          </CardContent>
        </Card>
        {error && <p className="text-base sm:text-lg mt-4 text-red-500">Error: {error}</p>}
      </div>
    );
  }

  // 4. Si no hay dbBuffer cargado, o se ha forzado el FileUploader (ej. se hizo clic en "Nueva Sesión")
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

  // 5. Si dbBuffer está cargado, pero el tipo de inventario aún no ha sido seleccionado
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