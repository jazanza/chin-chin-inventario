import { useState, useEffect } from "react";
import { FileUploader } from "@/components/FileUploader";
import { InventoryTypeSelector } from "@/components/InventoryTypeSelector";
import { InventoryTable } from "@/components/InventoryTable";
import { useInventoryContext, InventoryItem } from "@/context/InventoryContext"; // Importar el contexto y la interfaz directamente

const InventoryDashboard = () => {
  const {
    dbBuffer,
    inventoryType,
    inventoryData,
    loading,
    error,
    setDbBuffer,
    setInventoryType,
    setInventoryData,
    processInventoryData,
  } = useInventoryContext(); // Usar el contexto directamente

  const handleFileLoaded = (buffer: Uint8Array) => {
    setDbBuffer(buffer);
    setInventoryType(null); // Reset inventory type selection
  };

  const handleInventoryTypeSelect = (type: "weekly" | "monthly") => {
    setInventoryType(type);
  };

  const handleInventoryChange = (updatedData: InventoryItem[]) => {
    setInventoryData(updatedData); // Actualizar el estado global del inventario
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
        <InventoryTable inventoryData={inventoryData} onInventoryChange={handleInventoryChange} />
      )}
    </div>
  );
};

export default InventoryDashboard;