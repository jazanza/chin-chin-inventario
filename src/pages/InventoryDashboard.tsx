import { useState, useEffect } from "react";
import { useDb } from "@/hooks/useDb";
import { FileUploader } from "@/components/FileUploader";
import { InventoryTypeSelector } from "@/components/InventoryTypeSelector";
import { InventoryTable, InventoryItem } from "@/components/InventoryTable";
import { OrderGenerationModule } from "@/components/OrderGenerationModule";

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
      <div className="w-screen h-screen bg-black text-white flex flex-col items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4 text-[var(--primary-glitch-pink)]">Chin Chin Inventarios y Pedidos</h1>
          <FileUploader onFileLoaded={handleFileLoaded} loading={loading} />
          {error && <p className="text-red-500 mt-4">Error: {error}</p>}
        </div>
      </div>
    );
  }

  if (!inventoryType) {
    return (
      <div className="w-screen h-screen bg-black text-white flex flex-col items-center justify-center">
        <InventoryTypeSelector onSelect={handleInventoryTypeSelect} loading={loading} />
        {error && <p className="text-red-500 mt-4">Error: {error}</p>}
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-black text-white flex flex-col p-4">
      <h1 className="text-4xl font-bold mb-6 text-center text-[var(--primary-glitch-pink)]">
        Inventario {inventoryType === "weekly" ? "Semanal" : "Mensual"}
      </h1>
      
      {loading ? (
        <p className="text-xl text-center text-[var(--secondary-glitch-cyan)]">Analizando los datos...</p>
      ) : error ? (
        <p className="text-xl text-red-500 text-center">Error: {error}</p>
      ) : (
        <>
          <InventoryTable inventoryData={currentInventoryData} onInventoryChange={handleInventoryChange} />
          <OrderGenerationModule inventoryData={currentInventoryData} />
        </>
      )}
    </div>
  );
};

export default InventoryDashboard;