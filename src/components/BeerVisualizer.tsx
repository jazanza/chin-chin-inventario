import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text, Cylinder } from "@react-three/drei";
import * as THREE from "three";

// Animación de burbujas
function Bubbles({ count = 100, percentage }: { count?: number; percentage: number }) {
  const pointsRef = useRef<THREE.Points>(null!);

  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const x = THREE.MathUtils.randFloatSpread(0.7);
      const y = THREE.MathUtils.randFloat(-1, 1);
      const z = THREE.MathUtils.randFloatSpread(0.7);
      temp.push(x, y, z);
    }
    return new Float32Array(temp);
  }, [count]);

  useFrame((state) => {
    if (!pointsRef.current || percentage === 0) return;
    const positions = pointsRef.current.geometry.attributes.position.array;
    const liquidHeight = percentage * 2.0 - 1.0;

    for (let i = 0; i < positions.length; i += 3) {
      positions[i + 1] += 0.005; // Velocidad de subida
      if (positions[i + 1] > liquidHeight) {
        positions[i + 1] = -1.0; // Reiniciar abajo
      }
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
  });

  if (percentage === 0) return null;

  return (
    <points ref={pointsRef}>
      <bufferGeometry attach="geometry">
        <bufferAttribute
          attach="attributes-position"
          count={particles.length / 3}
          array={particles}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial attach="material" size={0.02} color="#ffffff" transparent opacity={0.5} />
    </points>
  );
}

// Componente principal de la escena 3D
export function BeerVisualizer({ percentage, liters, goal }: { percentage: number; liters: number; goal: number }) {
  const liquidRef = useRef<THREE.Mesh>(null!);
  const foamRef = useRef<THREE.Mesh>(null!);

  const glassHeight = 2.2;
  const liquidBaseY = -glassHeight / 2;

  useFrame(() => {
    if (liquidRef.current && foamRef.current) {
      const targetLiquidScaleY = percentage;
      const targetLiquidPosY = liquidBaseY + (glassHeight * percentage) / 2;
      const targetFoamPosY = liquidBaseY + glassHeight * percentage;

      // Interpolar suavemente (LERP) para una animación fluida
      liquidRef.current.scale.y = THREE.MathUtils.lerp(liquidRef.current.scale.y, targetLiquidScaleY, 0.1);
      liquidRef.current.position.y = THREE.MathUtils.lerp(liquidRef.current.position.y, targetLiquidPosY, 0.1);
      foamRef.current.position.y = THREE.MathUtils.lerp(foamRef.current.position.y, targetFoamPosY, 0.1);
    }
  });

  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1.5} />
      <spotLight position={[-10, 10, 5]} angle={0.3} penumbra={1} intensity={2} castShadow />

      <group>
        {/* Vaso de Pinta */}
        <Cylinder args={[0.5, 0.4, glassHeight, 32]} position={[0, 0, 0]}>
          <meshPhysicalMaterial
            color="#ffffff"
            transparent
            opacity={0.2}
            transmission={0.95}
            roughness={0.1}
            thickness={0.1}
            ior={1.5}
          />
        </Cylinder>

        {/* Líquido */}
        <mesh ref={liquidRef} scale={[1, 0, 1]} position={[0, liquidBaseY, 0]}>
          <cylinderGeometry args={[0.48, 0.38, glassHeight, 32]} />
          <meshStandardMaterial color="#FFA82E" metalness={0.2} roughness={0.3} />
        </mesh>

        {/* Espuma */}
        <mesh ref={foamRef} position={[0, liquidBaseY, 0]}>
          <cylinderGeometry args={[0.48, 0.48, 0.1, 32]} />
          <meshStandardMaterial color="#FFFFFF" roughness={0.8} />
        </mesh>

        <Bubbles percentage={percentage} />
      </group>

      {/* Texto 3D con métricas */}
      <Text position={[0, 2, 0]} fontSize={0.3} color="white" anchorX="center" anchorY="middle">
        {`${(percentage * 100).toFixed(0)}%`}
      </Text>
      <Text position={[0, 1.6, 0]} fontSize={0.15} color="white" anchorX="center" anchorY="middle">
        {`${liters.toFixed(2)} L / ${goal} L`}
      </Text>

      <OrbitControls enableZoom={false} />
    </Canvas>
  );
}