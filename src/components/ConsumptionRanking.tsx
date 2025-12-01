import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import { ZALANDO_FONT_URL } from "@/lib/constants";

interface RankedBeer {
  name: string;
  liters: number;
  color: string;
}

const PARTICLE_COUNT_PER_COLUMN = 5000;
const COLUMN_WIDTH = 0.8;
const MAX_COLUMN_HEIGHT = 5;

const BeerColumn = ({ beer, index, maxLiters }: { beer: RankedBeer; index: number; maxLiters: number }) => {
  const pointsRef = useRef<THREE.Points>(null!);
  const textRef = useRef<any>(null!);
  const animatedHeight = useRef(0);
  
  const targetHeight = maxLiters > 0 ? (beer.liters / maxLiters) * MAX_COLUMN_HEIGHT : 0;
  const color = index % 2 === 0 ? "var(--primary-glitch-pink)" : "var(--secondary-glitch-cyan)";

  const originalPositions = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT_PER_COLUMN * 3);
    for (let i = 0; i < PARTICLE_COUNT_PER_COLUMN; i++) {
      pos[i * 3] = (Math.random() - 0.5) * COLUMN_WIDTH;
      pos[i * 3 + 1] = (i / PARTICLE_COUNT_PER_COLUMN) * MAX_COLUMN_HEIGHT;
      pos[i * 3 + 2] = (Math.random() - 0.5) * COLUMN_WIDTH;
    }
    return pos;
  }, []);

  useFrame(({ clock }) => {
    animatedHeight.current = THREE.MathUtils.lerp(animatedHeight.current, targetHeight, 0.05);
    const visibleParticles = Math.floor((animatedHeight.current / MAX_COLUMN_HEIGHT) * PARTICLE_COUNT_PER_COLUMN);

    if (pointsRef.current) {
      const geom = pointsRef.current.geometry as THREE.BufferGeometry;
      geom.setDrawRange(0, visibleParticles);

      // Sinusoidal wave distortion
      const positions = geom.attributes.position.array as Float32Array;
      const time = clock.getElapsedTime();
      for (let i = 0; i < visibleParticles; i++) {
        const y = originalPositions[i * 3 + 1];
        positions[i * 3] = originalPositions[i * 3] + Math.sin(y * 2 + time * 2 + index) * 0.1;
        positions[i * 3 + 2] = originalPositions[i * 3 + 2] + Math.cos(y * 2 + time * 2 + index) * 0.1;
      }
      geom.attributes.position.needsUpdate = true;
    }

    if (textRef.current) {
      textRef.current.position.y = animatedHeight.current + 0.3;
    }
  });

  return (
    <group position={[(index - 4.5) * 1.2, 0, 0]}>
      <points ref={pointsRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={PARTICLE_COUNT_PER_COLUMN} array={originalPositions.slice()} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={0.02} color={color} />
      </points>
      <Text
        ref={textRef}
        font={ZALANDO_FONT_URL}
        position={[0, 0.3, 0]}
        fontSize={0.2}
        color="white"
        anchorX="center"
        maxWidth={1}
        textAlign="center"
      >
        {beer.name}
      </Text>
    </group>
  );
};

export function ConsumptionRanking({ rankedBeers, ...props }: { rankedBeers: RankedBeer[] } & JSX.IntrinsicElements['group']) {
  const maxLiters = Math.max(...rankedBeers.map(b => b.liters), 1);

  return (
    <group {...props} position={[0, -2, 0]}>
      {rankedBeers.map((beer, index) => (
        <BeerColumn key={beer.name} beer={beer} index={index} maxLiters={maxLiters} />
      ))}
    </group>
  );
}