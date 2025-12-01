import { useRef, useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";

const PARTICLE_COUNT = 100000; // Increased particle count for density
const CYLINDER_RADIUS = 1.5;
const MAX_LITERS_FOR_SCALE = 1000;

export function BeerVisualizer({ liters, ...props }: { liters: number } & JSX.IntrinsicElements['group']) {
  const { viewport } = useThree();
  const pointsRef = useRef<THREE.Points>(null!);
  const textRef = useRef<any>(null!);
  const animatedLiters = useRef(0);

  const maxHeight = viewport.height * 1.2; // Increased height for dominance
  const bottomY = -maxHeight / 2; // Centering the visualizer vertically

  const [positions, colors] = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const col = new Float32Array(PARTICLE_COUNT * 3);
    const color = new THREE.Color();

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const y = bottomY + (i / PARTICLE_COUNT) * maxHeight;
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * CYLINDER_RADIUS;
      
      pos[i * 3] = Math.cos(angle) * radius;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(angle) * radius;

      // Rainbow gradient based on height (Y)
      color.setHSL((y - bottomY) / maxHeight, 1.0, 0.5);
      col[i * 3] = color.r;
      col[i * 3 + 1] = color.g;
      col[i * 3 + 2] = color.b;
    }
    return [pos, col];
  }, [maxHeight, bottomY]);

  useFrame(() => {
    animatedLiters.current = THREE.MathUtils.lerp(animatedLiters.current, liters, 0.05);
    const targetParticleCount = Math.floor((animatedLiters.current / MAX_LITERS_FOR_SCALE) * PARTICLE_COUNT);

    if (pointsRef.current) {
      (pointsRef.current.geometry as THREE.BufferGeometry).setDrawRange(0, targetParticleCount);
    }

    if (textRef.current) {
      const topOfLiquid = bottomY + (targetParticleCount / PARTICLE_COUNT) * maxHeight;
      textRef.current.position.y = topOfLiquid + 0.3;
    }
  });

  useEffect(() => {
    if (liters === 0) {
      animatedLiters.current = 0;
    }
  }, [liters]);

  return (
    <group {...props}>
      <points ref={pointsRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={PARTICLE_COUNT} array={positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={PARTICLE_COUNT} array={colors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={0.02} vertexColors={true} transparent={true} opacity={0.7} />
      </points>

      <Text
        ref={textRef}
        position={[0, bottomY + 0.3, 0]}
        fontSize={0.5}
        color="white"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#000000"
      >
        {`${liters.toFixed(2)} L`}
      </Text>
    </group>
  );
}