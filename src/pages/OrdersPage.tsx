import { OrderGenerationModule } from "@/components/OrderGenerationModule";
import { useInventoryContext } from "@/context/InventoryContext"; // Importar el contexto

const OrdersPage = () => {
  const { inventoryData, loading, error } = useInventoryContext(); // Obtener datos del contexto

  if (loading) {
    return (
      <div className="p-4 text-center text-gray-700">Cargando datos de inventario...</div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-500">Error al cargar el inventario: {error}</div>
    );
  }

  if (inventoryData.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        Por favor, carga un archivo de base de datos y selecciona un tipo de inventario en la sección de Inventario para generar pedidos.
      </div>
    );
  }

  return (
    <div className="p-4">
      <OrderGenerationModule inventoryData={inventoryData} />
    </div>
  );
};

export default OrdersPage;