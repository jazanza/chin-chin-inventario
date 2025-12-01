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
import { NarrativeOverlay } from "@/components/NarrativeOverlay";

type ViewMode = "meter" | "ranking" | "loyalty" | "balance" | "spectrum";

interface Scene {
  viewMode: ViewMode;
  rangeKey: string;
  title: string;
}

const SCENE_PLAYLIST: Scene[] = [
  { viewMode: "meter", rangeKey: "last_month", title: "LITROS CERVEZA" },
  { viewMode: "meter", rangeKey: "last_3_months", title: "LITROS CERVEZA" },
  { viewMode: "meter", rangeKey: "last_6_months", title: "LITROS CERVEZA" },
  { viewMode: "meter", rangeKey: "this_year", title: "LITROS CERVEZA" },
  { viewMode: "meter", rangeKey: "last_year", title: "CONLITROS CERVEZASUMO" },
  { viewMode: "meter", rangeKey: "all_time", title: "LITROS CERVEZA" },
];

const RANGE_MAP: { [key: string]: string } = {
  this_week: "ESTA SEMANA",
  last_week: "SEMANA PASADA",
  last_15_days: "ÚLTIMOS 15 DÍAS",
  this_month: "ESTE MES",
  last_month: "ÚLTIMO MES",
  last_3_months: "ÚLTIMOS 3 MESES",
  last_6_months: "ÚLTIMOS 6 MESES",
  last_1_year: "ÚLTIMO AÑO",
  this_year: "AÑO ACTUAL",
  last_year: "AÑO PASADO",
  all_time: "HISTÓRICO",
};

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
    <div className="w-screen h-screen bg-black text-white flex flex-col relative">
      <NarrativeOverlay
        key={currentSceneIndex}
        title={currentScene.title}
        range={RANGE_MAP[currentScene.rangeKey] || ""}
      />
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