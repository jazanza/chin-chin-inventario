import { useState, useEffect } from "react";
import { useDb } from "@/hooks/useDb";
import { FileUploader } from "@/components/FileUploader";
import { InventoryTypeSelector } from "@/components/InventoryTypeSelector";
import { InventoryTable, InventoryItem } from "@/components/InventoryTable";
// OrderGenerationModule ya no se importa aquí

const InventoryDashboard = () => {
  const {
    inventoryData: initialInventoryData,
    loading,
    error,
    processInventoryData,
  } = useDb();
  const [dbBuffer, setDbBuffer] = useState<Uint8Array | null>(null);
  const [inventoryType, setInventoryType] = useState<"weekly" | "monthly" | null>(null);
  const [currentInventoryData, setCurrentInventoryData] = useState<InventoryItem[]>([]);

  useEffect(() => {
    if (initialInventoryData) {
      setCurrentInventoryData(initialInventoryData);
    }
  }, [initialInventoryData]);

  useEffect(() => {
    if (dbBuffer && inventoryType) {
      processInventoryData(dbBuffer, inventoryType);
    }
  }, [dbBuffer, inventoryType, processInventoryData]);

  const handleFileLoaded = (buffer: Uint8Array) => {
    setDbBuffer(buffer);
    setInventoryType(null); // Reset inventory type selection
  };

  const handleInventoryTypeSelect = (type: "weekly" | "monthly") => {
    setInventoryType(type);
  };

  const handleInventoryChange = (updatedData: InventoryItem[]) => {
    setCurrentInventoryData(updatedData);
  };

  if (!dbBuffer) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-4 text-gray-900">Chin Chin Inventarios y Pedidos</h1>
          <FileUploader onFileLoaded={handleFileLoaded} loading={loading} />
          {error && <p className="text-base sm:text-lg mt-4 text-red-500">Error: {error}</p>}
        </div>
      </div>
    );
  }

  if (!inventoryType) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-4">
        <InventoryTypeSelector onSelect={handleInventoryTypeSelect} loading={loading} />
        {error && <p className="text-base sm:text-lg mt-4 text-red-500">Error: {error}</p>}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col p-4">
      <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-6 text-center text-gray-900">
        Inventario {inventoryType === "weekly" ? "Semanal" : "Mensual"}
      </h1>
      
      {loading ? (
        <p className="text-base sm:text-lg text-center text-gray-700">Analizando los datos...</p>
      ) : error ? (
        <p className="text-base sm:text-lg text-red-500 text-center">Error: {error}</p>
      ) : (
        <>
          <InventoryTable inventoryData={currentInventoryData} onInventoryChange={handleInventoryChange} />
          {/* OrderGenerationModule ya no se renderiza aquí */}
        </>
      )}
    </div>
  );
};

export default InventoryDashboard;