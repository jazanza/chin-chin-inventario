import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";

interface RankedBeer {
  name: string;
  liters: number;
}

const MAX_COLUMN_HEIGHT = 5;

const glassMaterial = (
  <meshPhysicalMaterial
    transmission={0.9}
    opacity={1}
    metalness={0}
    roughness={0.2}
    ior={1.5}
    thickness={0.5}
    clearcoat={1}
    clearcoatRoughness={0}
  />
);

const BeerColumn = ({ beer, index, maxLiters }: { beer: RankedBeer; index: number; maxLiters: number }) => {
  const meshRef = useRef<THREE.Mesh>(null!);
  const textRef = useRef<any>(null!);
  
  const targetHeight = maxLiters > 0 ? (beer.liters / maxLiters) * MAX_COLUMN_HEIGHT : 0.01;

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.scale.y = THREE.MathUtils.lerp(meshRef.current.scale.y, targetHeight, 0.1);
      meshRef.current.position.y = meshRef.current.scale.y / 2;
    }
    if (textRef.current) {
      textRef.current.position.y = (meshRef.current?.scale.y || 0) + 0.3;
    }
  });

  return (
    <group position={[(index - 4.5) * 1.2, 0, 0]}>
      <mesh ref={meshRef} scale={[1, 0.01, 1]}>
        <boxGeometry args={[0.8, 1, 0.8]} />
        {glassMaterial}
      </mesh>
      <Text
        ref={textRef}
        position={[0, 0.3, 0]}
        fontSize={0.2}
        color="white"
        anchorX="center"
        maxWidth={1.1}
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
    <group {...props} position={[0, -2.5, 0]}>
      {rankedBeers.map((beer, index) => (
        <BeerColumn key={beer.name} beer={beer} index={index} maxLiters={maxLiters} />
      ))}
    </group>
  );
}