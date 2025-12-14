import { useState, useEffect, useCallback } from "react";
import { FileUploader } from "@/components/FileUploader";
import { InventoryTypeSelector } from "@/components/InventoryTypeSelector";
import { InventoryTable } from "@/components/InventoryTable";
import { useInventoryContext, InventoryItem } from "@/context/InventoryContext";
import { SessionManager } from "@/components/SessionManager"; // Importar SessionManager
import { Button } from "@/components/ui/button"; // Importar Button
import { PlusCircle } from "lucide-react"; // Importar icono

const InventoryDashboard = () => {
  const {
    dbBuffer,
    inventoryType,
    inventoryData,
    loading,
    error,
    sessionId, // Nuevo: para saber si hay una sesión cargada
    setDbBuffer,
    setInventoryType,
    setInventoryData,
    resetInventoryState, // Nuevo: para iniciar una nueva sesión
    getSessionHistory, // Nuevo: para verificar si hay historial
  } = useInventoryContext();

  const [hasSessionHistory, setHasSessionHistory] = useState(false);
  const [showFileUploader, setShowFileUploader] = useState(false); // Nuevo estado para controlar cuándo mostrar FileUploader

  // Verificar si hay historial de sesiones al cargar el componente
  useEffect(() => {
    const checkHistory = async () => {
      const history = await getSessionHistory();
      setHasSessionHistory(history.length > 0);
      // Si no hay historial y no hay dbBuffer, mostrar el FileUploader por defecto
      if (history.length === 0 && !dbBuffer) {
        setShowFileUploader(true);
      }
    };
    checkHistory();
  }, [getSessionHistory, dbBuffer]);

  const handleFileLoaded = (buffer: Uint8Array) => {
    setDbBuffer(buffer);
    setInventoryType(null); // Reset inventory type selection
    setShowFileUploader(false); // Ocultar FileUploader una vez que el archivo está cargado
  };

  const handleInventoryTypeSelect = (type: "weekly" | "monthly") => {
    setInventoryType(type);
  };

  const handleInventoryChange = (updatedData: InventoryItem[]) => {
    setInventoryData(updatedData); // Actualizar el estado global del inventario
  };

  const handleStartNewSession = useCallback(() => {
    resetInventoryState(); // Resetear el estado del inventario (excepto dbBuffer si ya está cargado)
    setDbBuffer(null); // Forzar la carga de un nuevo archivo DB
    setInventoryType(null); // Asegurarse de que el tipo de inventario se seleccione de nuevo
    setShowFileUploader(true); // Mostrar el FileUploader para la nueva sesión
  }, [resetInventoryState, setDbBuffer, setInventoryType]);

  // Lógica de renderizado condicional
  if (loading) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-4">
        <p className="text-base sm:text-lg text-center text-gray-700">Cargando o procesando datos...</p>
        {error && <p className="text-base sm:text-lg mt-4 text-red-500">Error: {error}</p>}
      </div>
    );
  }

  if (!dbBuffer && !showFileUploader && hasSessionHistory) {
    // Si no hay DB cargada, no se ha forzado el FileUploader y hay historial, mostrar SessionManager
    return <SessionManager onStartNewSession={handleStartNewSession} />;
  }

  if (!dbBuffer || showFileUploader) {
    // Si no hay DB cargada O se ha forzado el FileUploader
    return (
      <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-4 text-gray-900">Chin Chin Inventarios y Pedidos</h1>
          <FileUploader onFileLoaded={handleFileLoaded} loading={loading} />
          {error && <p className="text-base sm:text-lg mt-4 text-red-500">Error: {error}</p>}
          {hasSessionHistory && (
            <Button
              onClick={() => setShowFileUploader(false)}
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

  if (!inventoryType) {
    // Si hay DB cargada pero no se ha seleccionado el tipo de inventario
    return (
      <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-4">
        <InventoryTypeSelector onSelect={handleInventoryTypeSelect} loading={loading} />
        {error && <p className="text-base sm:text-lg mt-4 text-red-500">Error: {error}</p>}
      </div>
    );
  }

  // Si todo está cargado y seleccionado, mostrar la tabla de inventario
  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">
          Inventario {inventoryType === "weekly" ? "Semanal" : "Mensual"}
        </h1>
        <Button onClick={handleStartNewSession} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm sm:text-base">
          <PlusCircle className="mr-2 h-4 w-4" />
          Nueva Sesión
        </Button>
      </div>
      
      {error ? (
        <p className="text-base sm:text-lg text-red-500 text-center">Error: {error}</p>
      ) : (
        <InventoryTable inventoryData={inventoryData} onInventoryChange={handleInventoryChange} />
      )}
    </div>
  );
};

export default InventoryDashboard;