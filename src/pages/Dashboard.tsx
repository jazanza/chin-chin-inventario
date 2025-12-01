import { useState, Suspense, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useDb } from "@/hooks/useDb";
import { BeerVisualizer } from "@/components/BeerVisualizer";
import { ConsumptionRanking } from "@/components/ConsumptionRanking";
import { VarietyBalance } from "@/components/VarietyBalance";
import { LoyaltyConstellation } from "@/components/LoyaltyConstellation";
import { FlavorSpectrum } from "@/components/FlavorSpectrum";
import { CameraAnimator } from "@/components/CameraAnimator";
import { FileUploader } from "@/components/FileUploader";
import { DateRangeSelector } from "@/components/DateRangeSelector";
import { SceneEffects } from "@/components/SceneEffects";

type ViewMode = "meter" | "ranking" | "loyalty" | "balance" | "spectrum";
const VIEWS: ViewMode[] = ["meter", "ranking", "loyalty", "balance", "spectrum"];
const VIEW_DURATION = 15000; // 15 segundos por vista

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

  const handleRangeChange = async (newRange: string) => {
    setRangeKey(newRange);
    if (dbBuffer) {
      await processData(dbBuffer, newRange);
    }
  };

  if (!dbBuffer) {
    return (
      <div className="w-screen h-screen bg-black text-white flex flex-col items-center justify-center">
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
    <div className="w-screen h-screen bg-black text-white flex flex-col font-mono">
      <div className="absolute top-4 left-4 z-10">
        <DateRangeSelector
          selectedRange={rangeKey}
          onRangeChange={handleRangeChange}
        />
      </div>

      <div className="flex-grow">
        <Canvas
          shadows
          camera={{ position: [0, 1, 7], fov: 50 }}
        >
          <color attach="background" args={["#000000"]} />
          <fog attach="fog" args={["#000000", 5, 20]} />
          
          {loading ? (
            <Html center>
              <p className="text-xl text-center">Analizando los datos...</p>
            </Html>
          ) : error ? (
            <Html center>
              <p className="text-xl text-red-500 text-center">Error: {error}</p>
            </Html>
          ) : (
            <>
              <Suspense fallback={null}>
                <BeerVisualizer {...consumptionMetrics} rankedBeers={rankedBeers} visible={viewMode === "meter"} />
                <ConsumptionRanking rankedBeers={rankedBeers} visible={viewMode === "ranking"} />
                <VarietyBalance varietyMetrics={varietyMetrics} visible={viewMode === "balance"} />
                <LoyaltyConstellation loyaltyMetrics={loyaltyMetrics} visible={viewMode === "loyalty"} />
                <FlavorSpectrum flavorData={flavorData} visible={viewMode === "spectrum"} />
              </Suspense>
              <CameraAnimator viewMode={viewMode} />
              <SceneEffects />
            </>
          )}
        </Canvas>
      </div>
    </div>
  );
};

export default Dashboard;