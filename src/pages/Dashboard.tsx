import { useState, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { DateRange } from "react-day-picker";
import { subDays } from "date-fns";
import { Download } from "lucide-react";
import { useDb } from "@/hooks/useDb";
import { BeerVisualizer } from "@/components/BeerVisualizer";
import { FlavorSpectrum } from "@/components/FlavorSpectrum";
import { VarietyBalance } from "@/components/VarietyBalance";
import { LoyaltyConstellation } from "@/components/LoyaltyConstellation";
import { Button } from "@/components/ui/button";
import { FileUploader } from "@/components/FileUploader";
import { DatePickerWithRange } from "@/components/DatePicker";
import { exportToExcel } from "@/lib/export";

type ViewMode = "meter" | "spectrum" | "balance" | "loyalty";

const Dashboard = () => {
  const { consumptionMetrics, flavorData, varietyMetrics, loyaltyMetrics, rankedBeers, loading, error, processData } = useDb();
  const [viewMode, setViewMode] = useState<ViewMode>("meter");
  const [dbBuffer, setDbBuffer] = useState<Uint8Array | null>(null);
  const [date, setDate] = useState<DateRange | undefined>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });

  const handleFileLoaded = async (buffer: Uint8Array) => {
    setDbBuffer(buffer);
    await processData(buffer, date);
  };

  const handleAnalyze = () => {
    if (dbBuffer) {
      processData(dbBuffer, date);
    }
  };

  const handleExport = () => {
    if (!dbBuffer) return;
    const dataToExport = {
      consumptionMetrics,
      flavorData,
      varietyMetrics,
      loyaltyMetrics,
      rankedBeers,
    };
    exportToExcel(dataToExport, date);
  };

  const renderVisualization = () => {
    switch (viewMode) {
      case "meter":
        return <BeerVisualizer {...consumptionMetrics} rankedBeers={rankedBeers} />;
      case "spectrum":
        return <FlavorSpectrum flavorData={flavorData} />;
      case "balance":
        return <VarietyBalance varietyMetrics={varietyMetrics} />;
      case "loyalty":
        return <LoyaltyConstellation loyaltyMetrics={loyaltyMetrics} />;
      default:
        return null;
    }
  };

  if (!dbBuffer) {
    return (
      <div className="w-screen h-screen bg-gray-900 text-white flex flex-col items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Visualizador de Cervecería</h1>
          <p className="text-xl text-gray-400 mb-8">Carga tu archivo de base de datos Aronium (.db) para comenzar.</p>
          <FileUploader onFileLoaded={handleFileLoaded} loading={loading} />
          {error && <p className="text-red-500 mt-4">Error: {error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-gray-900 text-white flex flex-col">
      <div className="absolute top-4 left-4 z-10 flex items-center gap-4">
        <DatePickerWithRange date={date} setDate={setDate} />
        <Button onClick={handleAnalyze} disabled={loading}>
          Analizar Rango
        </Button>
        <Button onClick={handleExport} disabled={loading || !dbBuffer}>
          <Download className="mr-2 h-4 w-4" />
          Exportar
        </Button>
      </div>

      <div className="absolute top-4 right-4 z-10 p-2 bg-gray-800/50 rounded-lg flex gap-2">
        <Button onClick={() => setViewMode("meter")} variant={viewMode === "meter" ? "secondary" : "ghost"}>
          Consumo
        </Button>
        <Button onClick={() => setViewMode("spectrum")} variant={viewMode === "spectrum" ? "secondary" : "ghost"}>
          Sabor
        </Button>
        <Button onClick={() => setViewMode("balance")} variant={viewMode === "balance" ? "secondary" : "ghost"}>
          Variedad
        </Button>
        <Button onClick={() => setViewMode("loyalty")} variant={viewMode === "loyalty" ? "secondary" : "ghost"}>
          Lealtad
        </Button>
      </div>

      <div className="flex-grow pt-20">
        {loading && <p className="text-xl text-center pt-40">Analizando los datos...</p>}
        {error && <p className="text-xl text-red-500 text-center pt-40">Error: {error}</p>}
        {!loading && !error && (
          <Canvas shadows camera={{ position: [0, 1, 5], fov: 50 }}>
            <color attach="background" args={["#101010"]} />
            <fog attach="fog" args={["#101010", 5, 15]} />
            <Suspense fallback={null}>
              {renderVisualization()}
            </Suspense>
            <OrbitControls enableZoom={true} />
          </Canvas>
        )}
      </div>
    </div>
  );
};

export default Dashboard;