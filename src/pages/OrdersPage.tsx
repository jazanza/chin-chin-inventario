import { OrderGenerationModule } from "@/components/OrderGenerationModule";

const OrdersPage = () => {
  // OrderGenerationModule requiere inventoryData, pero en esta página no tenemos acceso directo a ella.
  // Para que funcione de forma independiente, OrderGenerationModule necesitará cargar sus propios datos
  // o recibir una forma de obtenerlos. Por ahora, le pasaremos un array vacío para que no falle.
  // En una aplicación real, podrías cargar los datos de inventario aquí o desde un contexto global.
  return (
    <div className="p-4">
      <OrderGenerationModule inventoryData={[]} />
    </div>
  );
};

export default OrdersPage;