import { useState, Suspense, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { Download } from "lucide-react";
import { useDb } from "@/hooks/useDb";
import { BeerVisualizer } from "@/components/BeerVisualizer";
import { ConsumptionRanking } from "@/components/ConsumptionRanking";
import { VarietyBalance } from "@/components/VarietyBalance";
import { LoyaltyConstellation } from "@/components/LoyaltyConstellation";
import { CameraAnimator } from "@/components/CameraAnimator";
import { Button } from "@/components/ui/button";
import { FileUploader } from "@/components/FileUploader";
import { DateRangeSelector } from "@/components/DateRangeSelector";
import { exportToExcel } from "@/lib/export";
import { calculateDateRange } from "@/lib/dates";

type ViewMode = "meter" | "ranking" | "loyalty" | "balance";
const VIEWS: ViewMode[] = ["meter", "ranking", "loyalty", "balance"];
const VIEW_DURATION = 15000; // 15 seconds per view

const Dashboard = () => {
  const {
    consumptionMetrics,
    flavorData,
    varietyMetrics,
    loyaltyMetrics,
    rankedBeers,
    loading,
    error,
    processData,
  } = useDb();
  const [viewMode, setViewMode] = useState<ViewMode>("meter");
  const [dbBuffer, setDbBuffer] = useState<Uint8Array | null>(null);
  const [rangeKey, setRangeKey] = useState<string>("last_month");

  useEffect(() => {
    if (!dbBuffer || loading) return;

    const timer = setInterval(() => {
      setViewMode((currentView) => {
        const currentIndex = VIEWS.indexOf(currentView);
        const nextIndex = (currentIndex + 1) % VIEWS.length;
        return VIEWS[nextIndex];
      });
    }, VIEW_DURATION);

    return () => clearInterval(timer);
  }, [dbBuffer, loading]);

  const handleFileLoaded = async (buffer: Uint8Array) => {
    setDbBuffer(buffer);
    await processData(buffer, rangeKey);
  };

  const handleRangeChange = (newRangeKey: string) => {
    setRangeKey(newRangeKey);
    if (dbBuffer) {
      processData(dbBuffer, newRangeKey);
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
    const dateRange = calculateDateRange(rangeKey);
    exportToExcel(dataToExport, dateRange);
  };

  if (!dbBuffer) {
    return (
      <div className="w-screen h-screen bg-gray-900 text-white flex flex-col items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Visualizador de Cervecería</h1>
          <p className="text-xl text-gray-400 mb-8">
            Carga tu archivo de base de datos Aronium (.db) para comenzar.
          </p>
          <FileUploader onFileLoaded={handleFileLoaded} loading={loading} />
          {error && <p className="text-red-500 mt-4">Error: {error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-gray-900 text-white flex flex-col">
      <div className="absolute top-4 left-4 z-10 flex items-start gap-4 flex-col">
        <DateRangeSelector
          selectedRange={rangeKey}
          onRangeChange={handleRangeChange}
        />
        <Button onClick={handleExport} disabled={loading || !dbBuffer}>
          <Download className="mr-2 h-4 w-4" />
          Exportar
        </Button>
      </div>

      <div className="flex-grow">
        {loading && (
          <p className="text-xl text-center pt-40">Analizando los datos...</p>
        )}
        {error && (
          <p className="text-xl text-red-500 text-center pt-40">
            Error: {error}
          </p>
        )}
        {!loading && !error && (
          <Canvas shadows camera={{ position: [0, 1, 7], fov: 50 }}>
            <color attach="background" args={["#101010"]} />
            <fog attach="fog" args={["#101010", 5, 20]} />
            <Suspense fallback={null}>
              <BeerVisualizer {...consumptionMetrics} rankedBeers={rankedBeers} visible={viewMode === "meter"} />
              <ConsumptionRanking rankedBeers={rankedBeers} visible={viewMode === "ranking"} />
              <VarietyBalance varietyMetrics={varietyMetrics} visible={viewMode === "balance"} />
              <LoyaltyConstellation loyaltyMetrics={loyaltyMetrics} visible={viewMode === "loyalty"} />
              
              <CameraAnimator viewMode={viewMode} />
              
              <EffectComposer>
                <Bloom
                  mipmapBlur
                  luminanceThreshold={0.8}
                  luminanceSmoothing={0.025}
                  intensity={1.2}
                />
              </EffectComposer>
            </Suspense>
          </Canvas>
        )}
      </div>
    </div>
  );
};

export default Dashboard;