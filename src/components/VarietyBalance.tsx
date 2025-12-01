import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";

const volumeColor = new THREE.Color("#2196F3");
const varietyColor = new THREE.Color("#4CAF50");

export function VarietyBalance({ varietyMetrics }: { varietyMetrics: { totalLiters: number; uniqueProducts: number } }) {
  const volumeRef = useRef<THREE.Mesh>(null!);
  const varietyRef = useRef<THREE.Mesh>(null!);
  const { totalLiters, uniqueProducts } = varietyMetrics;

  const volumeHeight = Math.log(totalLiters + 1) * 0.5;
  const varietyHeight = Math.log(uniqueProducts + 1) * 0.5;

  useFrame(() => {
    if (volumeRef.current) {
      volumeRef.current.scale.y = THREE.MathUtils.lerp(volumeRef.current.scale.y, volumeHeight, 0.1);
      volumeRef.current.position.y = volumeRef.current.scale.y / 2;
    }
    if (varietyRef.current) {
      varietyRef.current.scale.y = THREE.MathUtils.lerp(varietyRef.current.scale.y, varietyHeight, 0.1);
      varietyRef.current.position.y = varietyRef.current.scale.y / 2;
    }
  });

  return (
    <group position={[0, -2, 0]}>
      <group position={[-1, 0, 0]}>
        <mesh ref={volumeRef} scale={[1, 0.01, 1]}>
          <cylinderGeometry args={[0.3, 0.3, 1, 16]} />
          <meshStandardMaterial
            color={volumeColor}
            emissive={volumeColor}
            emissiveIntensity={2}
            toneMapped={false}
          />
        </mesh>
        <Text position={[0, -0.5, 0]} fontSize={0.3} color="white">Volume</Text>
        <Text position={[0, -0.8, 0]} fontSize={0.2} color="white" opacity={0.8}>{`${totalLiters.toFixed(1)} L`}</Text>
      </group>

      <group position={[1, 0, 0]}>
        <mesh ref={varietyRef} scale={[1, 0.01, 1]}>
          <cylinderGeometry args={[0.3, 0.3, 1, 16]} />
          <meshStandardMaterial
            color={varietyColor}
            emissive={varietyColor}
            emissiveIntensity={2}
            toneMapped={false}
          />
        </mesh>
        <Text position={[0, -0.5, 0]} fontSize={0.3} color="white">Variety</Text>
        <Text position={[0, -0.8, 0]} fontSize={0.2} color="white" opacity={0.8}>{`${uniqueProducts} Products`}</Text>
      </group>
    </group>
  );
}