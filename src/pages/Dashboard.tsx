import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text, Cylinder } from "@react-three/drei";
import * as THREE from "three";
import { useDb } from "@/hooks/useDb";

// Animated bubbles component
function Bubbles({ count = 150, percentage }: { count?: number; percentage: number }) {
  const pointsRef = useRef<THREE.Points>(null!);
  const liquidHeight = percentage * 2.0 - 1.0;

  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const x = THREE.MathUtils.randFloatSpread(0.7);
      const y = THREE.MathUtils.randFloat(-1, liquidHeight);
      const z = THREE.MathUtils.randFloatSpread(0.7);
      temp.push(x, y, z);
    }
    return new Float32Array(temp);
  }, [count, liquidHeight]);

  useFrame(() => {
    if (!pointsRef.current || percentage === 0) return;
    const positions = pointsRef.current.geometry.attributes.position.array;

    for (let i = 1; i < positions.length; i += 3) {
      positions[i] += 0.005; // Rise speed
      if (positions[i] > liquidHeight) {
        positions[i] = -1.0; // Reset to bottom
      }
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
  });

  if (percentage === 0) return null;

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particles.length / 3}
          array={particles}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial size={0.02} color="#ffffff" transparent opacity={0.6} />
    </points>
  );
}

// Main 3D visualizer component
function BeerVisualizer({ percentage, liters, goal }: { percentage: number; liters: number; goal: number }) {
  const liquidRef = useRef<THREE.Mesh>(null!);
  const foamRef = useRef<THREE.Mesh>(null!);
  const glassHeight = 2.2;
  const liquidBaseY = -glassHeight / 2;

  useFrame(() => {
    if (liquidRef.current && foamRef.current) {
      const targetLiquidScaleY = Math.max(percentage, 0.001); // Avoid zero scale
      const targetLiquidPosY = liquidBaseY + (glassHeight * percentage) / 2;
      const targetFoamPosY = liquidBaseY + glassHeight * percentage;

      liquidRef.current.scale.y = THREE.MathUtils.lerp(liquidRef.current.scale.y, targetLiquidScaleY, 0.1);
      liquidRef.current.position.y = THREE.MathUtils.lerp(liquidRef.current.position.y, targetLiquidPosY, 0.1);
      foamRef.current.position.y = THREE.MathUtils.lerp(foamRef.current.position.y, targetFoamPosY, 0.1);
    }
  });

  return (
    <>
      <ambientLight intensity={0.7} />
      <spotLight position={[10, 15, 10]} angle={0.3} penumbra={1} intensity={2} castShadow />
      <pointLight position={[-10, -10, -10]} intensity={0.5} />

      <group>
        {/* Glass */}
        <Cylinder args={[0.5, 0.4, glassHeight, 64, 1, true]}>
          <meshPhysicalMaterial
            color="#ffffff"
            transparent
            opacity={0.2}
            transmission={0.98}
            roughness={0.05}
            thickness={0.1}
            ior={1.5}
            side={THREE.DoubleSide}
          />
        </Cylinder>

        {/* Liquid */}
        <mesh ref={liquidRef} scale={[1, 0.001, 1]} position={[0, liquidBaseY, 0]}>
          <cylinderGeometry args={[0.48, 0.38, glassHeight, 64]} />
          <meshStandardMaterial color="#FFA82E" metalness={0.3} roughness={0.2} />
        </mesh>

        {/* Foam */}
        <mesh ref={foamRef} position={[0, liquidBaseY, 0]} visible={percentage > 0.01}>
          <cylinderGeometry args={[0.48, 0.48, 0.1, 64]} />
          <meshStandardMaterial color="#F5F5DC" roughness={0.9} emissive="#E1E1D1" emissiveIntensity={0.1} />
        </mesh>

        <Bubbles percentage={percentage} />
      </group>

      {/* 3D Metrics Text */}
      <Text position={[0, 2, 0]} fontSize={0.3} color="white" anchorX="center">
        {`${(percentage * 100).toFixed(0)}%`}
      </Text>
      <Text position={[0, 1.6, 0]} fontSize={0.15} color="white" anchorX="center">
        {`${liters.toFixed(2)} L / ${goal} L`}
      </Text>

      {/* Ground Plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -glassHeight / 2 - 0.01, 0]} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <shadowMaterial opacity={0.4} />
      </mesh>

      <OrbitControls enableZoom={false} minPolarAngle={Math.PI / 4} maxPolarAngle={Math.PI / 2} />
    </>
  );
}

// Main Dashboard Page
const Dashboard = () => {
  const { liters, percentage, goal, loading, error } = useDb();

  return (
    <div className="w-screen h-screen bg-gray-900 text-white flex flex-col items-center justify-center">
      {loading && <p className="text-xl">Connecting to the brewery...</p>}
      {error && <p className="text-xl text-red-500">Error: {error}</p>}
      {!loading && !error && (
        <Canvas shadows camera={{ position: [0, 1, 5], fov: 50 }}>
          <BeerVisualizer percentage={percentage} liters={liters} goal={goal} />
        </Canvas>
      )}
    </div>
  );
};

export default Dashboard;