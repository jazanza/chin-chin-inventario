import { useState, Suspense, useEffect, useCallback, useRef } from "react";
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
import { PostProcessingEffects } from "@/components/PostProcessingEffects";
import { PlaybackControls } from "@/components/PlaybackControls";

type ViewMode = "meter" | "ranking" | "loyalty" | "balance" | "spectrum";

interface Scene {
  viewMode: ViewMode;
  rangeKey: string;
  title: string;
}

const SCENE_PLAYLIST: Scene[] = [
  { viewMode: "meter", rangeKey: "last_month", title: "Consumo Mensual" },
  { viewMode: "ranking", rangeKey: "last_month", title: "Top 10 Mensual" },
  { viewMode: "loyalty", rangeKey: "last_6_months", title: "Lealtad (6 Meses)" },
  { viewMode: "balance", rangeKey: "all_time", title: "Balance Histórico" },
  { viewMode: "spectrum", rangeKey: "last_1_year", title: "Espectro Anual" },
  { viewMode: "ranking", rangeKey: "last_1_year", title: "Top 10 Anual" },
  { viewMode: "loyalty", rangeKey: "all_time", title: "Lealtad Histórica" },
];

const VIEW_DURATION = 15000; // 15 seconds

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
  const [dbBuffer, setDbBuffer] = useState<Uint8Array | null>(null);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const currentScene = SCENE_PLAYLIST[currentSceneIndex];
  const { viewMode, rangeKey } = currentScene;

  const advanceScene = useCallback((direction: 1 | -1) => {
    setCurrentSceneIndex(prevIndex => {
      const newIndex = prevIndex + direction;
      if (newIndex >= SCENE_PLAYLIST.length) return 0;
      if (newIndex < 0) return SCENE_PLAYLIST.length - 1;
      return newIndex;
    });
  }, []);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (isPlaying && dbBuffer) {
      intervalRef.current = setInterval(() => advanceScene(1), VIEW_DURATION);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, dbBuffer, advanceScene, currentSceneIndex]);

  useEffect(() => {
    if (dbBuffer) {
      processData(dbBuffer, rangeKey);
    }
  }, [dbBuffer, rangeKey, processData]);

  const handleFileLoaded = (buffer: Uint8Array) => {
    setDbBuffer(buffer);
    setCurrentSceneIndex(0);
    setIsPlaying(true);
  };

  const handlePlayPause = () => setIsPlaying(prev => !prev);
  const handleNext = () => advanceScene(1);
  const handlePrev = () => advanceScene(-1);

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
    <div className="w-screen h-screen bg-black text-white flex flex-col font-mono relative">
      <div className="absolute top-4 left-4 text-lg z-10 p-2 bg-black/50 rounded">
        <p>{currentScene.title}</p>
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
            <Suspense fallback={null}>
              <BeerVisualizer {...consumptionMetrics} visible={viewMode === "meter"} />
              <ConsumptionRanking rankedBeers={rankedBeers} visible={viewMode === "ranking"} />
              <VarietyBalance varietyMetrics={varietyMetrics} visible={viewMode === "balance"} />
              <LoyaltyConstellation loyaltyMetrics={loyaltyMetrics} visible={viewMode === "loyalty"} />
              <FlavorSpectrum flavorData={flavorData} visible={viewMode === "spectrum"} />
            </Suspense>
          )}

          <CameraAnimator viewMode={viewMode} />
          <PostProcessingEffects />
        </Canvas>
      </div>
      <PlaybackControls
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
        onNext={handleNext}
        onPrev={handlePrev}
      />
    </div>
  );
};

export default Dashboard;