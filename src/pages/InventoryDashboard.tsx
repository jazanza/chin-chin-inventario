import { useState, useEffect } from "react";
import { useDb } from "@/hooks/useDb"; // Ahora useDb usa el contexto
import { FileUploader } from "@/components/FileUploader";
import { InventoryTypeSelector } from "@/components/InventoryTypeSelector";
import { InventoryTable, InventoryItem } from "@/components/InventoryTable";
import { useInventoryContext } from "@/context/InventoryContext"; // Importar el contexto directamente

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

  // No necesitamos un estado local para currentInventoryData aquí, ya viene del contexto
  // y se actualiza a través de setInventoryData.

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

  // El useEffect para procesar los datos ahora está en InventoryContext.tsx
  // Este componente solo reacciona a los cambios en el contexto.

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