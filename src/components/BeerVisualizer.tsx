import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";

const MAX_LITERS = 1000;
const RINGS = 10;
const BASE_RADIUS = 1.5;
const RING_SPACING = 0.3;

const inactiveColor = new THREE.Color("#333333");
const activeColor = new THREE.Color("#00ffff");

const Ring = ({ index, progress }: { index: number; progress: number }) => {
  const meshRef = useRef<THREE.Mesh>(null!);
  const ringProgress = (index + 1) / RINGS;

  useFrame(() => {
    if (meshRef.current) {
      const material = meshRef.current.material as THREE.MeshStandardMaterial;
      const targetColor = progress >= ringProgress ? activeColor : inactiveColor;
      material.color.lerp(targetColor, 0.1);
      material.emissive.lerp(targetColor, 0.1);
    }
  });

  return (
    <mesh ref={meshRef} rotation-x={-Math.PI / 2} position-y={index * 0.05}>
      <torusGeometry args={[BASE_RADIUS + index * RING_SPACING, 0.05, 16, 100]} />
      <meshStandardMaterial
        color={inactiveColor}
        emissive={inactiveColor}
        emissiveIntensity={2}
      />
    </mesh>
  );
};

export function BeerVisualizer({ liters }: { liters: number }) {
  const animatedLiters = useRef(0);

  useFrame(() => {
    animatedLiters.current = THREE.MathUtils.lerp(animatedLiters.current, liters, 0.05);
  });

  const progress = Math.min(animatedLiters.current, MAX_LITERS) / MAX_LITERS;

  return (
    <group>
      {Array.from({ length: RINGS }).map((_, i) => (
        <Ring key={i} index={i} progress={progress} />
      ))}
      <Text
        position={[0, 0, 0]}
        fontSize={1.2}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {liters.toFixed(1)}
      </Text>
      <Text
        position={[0, -0.8, 0]}
        fontSize={0.4}
        color="white"
        anchorX="center"
        anchorY="middle"
        opacity={0.8}
      >
        Litros
      </Text>
    </group>
  );
}