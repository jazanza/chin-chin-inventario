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
  { viewMode: "meter", rangeKey: "this_week", title: "LITROS DE CERVEZA" },
  { viewMode: "meter", rangeKey: "last_week", title: "LITROS DE CERVEZA" },
  { viewMode: "meter", rangeKey: "last_15_days", title: "LITROS DE CERVEZA" },
  { viewMode: "meter", rangeKey: "this_month", title: "LITROS DE CERVEZA" },
  { viewMode: "meter", rangeKey: "last_month", title: "LITROS DE CERVEZA" },
  { viewMode: "meter", rangeKey: "last_3_months", title: "LITROS DE CERVEZA" },
  { viewMode: "meter", rangeKey: "last_6_months", title: "LITROS DE CERVEZA" },
  { viewMode: "meter", rangeKey: "this_year", title: "LITROS DE CERVEZA" },
  { viewMode: "meter", rangeKey: "last_year", title: "LITROS DE CERVEZA" },
  { viewMode: "meter", rangeKey: "all_time", title: "LITROS DE CERVEZA" },
  // Escenas de visualización que no son 'meter'
  { viewMode: "ranking", rangeKey: "all_time", title: "RANKING DE CERVEZAS" },
  { viewMode: "balance", rangeKey: "all_time", title: "BALANCE DE VARIEDAD" },
  { viewMode: "loyalty", rangeKey: "all_time", title: "CONSTELACIÓN DE LEALTAD" },
  { viewMode: "spectrum", rangeKey: "all_time", title: "ESPECTRO DE SABORES" },
];

const RANGE_MAP: { [key: string]: string } = {
  this_week: "Servidos esta semana",
  last_week: "Servidos la semana pasada",
  last_15_days: "Servidos en las útimas dos semanas",
  this_month: "Servidos este mes",
  last_month: "Servidos el mes pasado",
  last_3_months: "Servidos en los útimos 3 meses",
  last_6_months: "Servidos en los útimos 6 meses",
  this_year: "Servidos este año",
  last_year: "Servidos el año pasado",
  all_time: "Servidos históricamente",
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
  const [previousViewMode, setPreviousViewMode] = useState<ViewMode | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const currentScene = SCENE_PLAYLIST[currentSceneIndex];
  const { viewMode, rangeKey } = currentScene;

  // Función para seleccionar la siguiente escena aleatoria
  const selectNextRandomScene = useCallback(() => {
    if (!SCENE_PLAYLIST.length) return;

    let nextIndex: number;
    let nextSceneViewMode: ViewMode; // Declarada aquí para que esté en el ámbito correcto
    let attempts = 0;
    const maxAttempts = 20;

    const hasNonMeterScenes = SCENE_PLAYLIST.some(s => s.viewMode !== "meter");

    do {
      nextIndex = Math.floor(Math.random() * SCENE_PLAYLIST.length);
      nextSceneViewMode = SCENE_PLAYLIST[nextIndex].viewMode; // Asignada aquí
      attempts++;
    } while (
      attempts < maxAttempts &&
      (nextIndex === currentSceneIndex ||
       (previousViewMode === "meter" && nextSceneViewMode === "meter" && hasNonMeterScenes))
    );

    setCurrentSceneIndex(nextIndex);
    setPreviousViewMode(SCENE_PLAYLIST[nextIndex].viewMode);
  }, [currentSceneIndex, previousViewMode, SCENE_PLAYLIST.length]);

  // Efecto para inicializar la primera escena y el modo de vista anterior
  useEffect(() => {
    if (dbBuffer && SCENE_PLAYLIST.length > 0) {
      // Seleccionar una escena inicial aleatoria
      const initialIndex = Math.floor(Math.random() * SCENE_PLAYLIST.length);
      setCurrentSceneIndex(initialIndex);
      setPreviousViewMode(SCENE_PLAYLIST[initialIndex].viewMode);
      setIsPlaying(true);
    }
  }, [dbBuffer]);

  // Efecto para el temporizador de reproducción automática
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (isPlaying && dbBuffer) {
      intervalRef.current = setInterval(selectNextRandomScene, VIEW_DURATION);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, dbBuffer, selectNextRandomScene]);

  // Efecto para procesar datos cuando cambia la escena
  useEffect(() => {
    if (dbBuffer) {
      processData(dbBuffer, rangeKey);
    }
  }, [dbBuffer, rangeKey, processData]);

  const handleFileLoaded = (buffer: Uint8Array) => {
    setDbBuffer(buffer);
    // Al cargar un nuevo archivo, reiniciamos la reproducción con una escena aleatoria
    const initialIndex = Math.floor(Math.random() * SCENE_PLAYLIST.length);
    setCurrentSceneIndex(initialIndex);
    setPreviousViewMode(SCENE_PLAYLIST[initialIndex].viewMode);
    setIsPlaying(true);
  };

  const handlePlayPause = () => setIsPlaying(prev => !prev);
  const handleNext = () => {
    setIsPlaying(false); // Pausar la reproducción automática al saltar manualmente
    selectNextRandomScene();
  };
  const handlePrev = () => {
    setIsPlaying(false); // Pausar la reproducción automática al saltar manualmente
    selectNextRandomScene(); // En modo aleatorio, "anterior" es simplemente otra escena aleatoria
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
    <div className="w-screen h-screen bg-black text-white flex flex-col relative">
      <NarrativeOverlay
        key={currentSceneIndex} // Usar key para forzar la re-renderización y animación del overlay
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