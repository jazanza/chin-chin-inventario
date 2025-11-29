import { useDb } from "@/hooks/useDb";
import { BeerVisualizer } from "@/components/BeerVisualizer";

const Dashboard = () => {
  const { liters, percentage, goal, loading, error } = useDb();

  return (
    <div className="w-screen h-screen bg-gray-900 text-white flex flex-col items-center justify-center">
      {loading && <p>Cargando datos de la cervecería...</p>}
      {error && <p className="text-red-500">Error: {error}</p>}
      {!loading && !error && (
        <BeerVisualizer percentage={percentage} liters={liters} goal={goal} />
      )}
    </div>
  );
};

export default Dashboard;