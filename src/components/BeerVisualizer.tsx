import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";

const MAX_LITERS_FOR_GAUGE = 1000;
const GAUGE_ANGLE = Math.PI * 1.5;
const START_ANGLE = -GAUGE_ANGLE / 2;

const glassMaterial = (
  <meshPhysicalMaterial
    transmission={0.9}
    opacity={1}
    metalness={0}
    roughness={0.1}
    ior={1.5}
    thickness={0.5}
    clearcoat={1}
    clearcoatRoughness={0}
  />
);

export function BeerVisualizer({ liters, ...props }: { liters: number } & JSX.IntrinsicElements['group']) {
  const needleRef = useRef<THREE.Mesh>(null!);
  const animatedLiters = useRef(0);

  useFrame(() => {
    animatedLiters.current = THREE.MathUtils.lerp(animatedLiters.current, liters, 0.05);
    
    if (needleRef.current) {
      const normalizedValue = Math.min(animatedLiters.current, MAX_LITERS_FOR_GAUGE) / MAX_LITERS_FOR_GAUGE;
      const targetRotation = START_ANGLE + normalizedValue * GAUGE_ANGLE;
      needleRef.current.rotation.z = THREE.MathUtils.lerp(needleRef.current.rotation.z, targetRotation, 0.1);
    }
  });

  return (
    <group {...props}>
      <mesh rotation={[0, 0, START_ANGLE]}>
        <torusGeometry args={[2.5, 0.1, 16, 100, GAUGE_ANGLE]} />
        {glassMaterial}
      </mesh>

      <mesh ref={needleRef} position={[0, 0, 0.1]}>
        <boxGeometry args={[0.05, 2.8, 0.05]} />
        <meshStandardMaterial color="#FFFFFF" metalness={0.8} roughness={0.2} />
        <mesh position={[0, -1.4, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.1, 32]} />
          <meshStandardMaterial color="#FFFFFF" />
        </mesh>
      </mesh>

      <Text
        position={[0, 0, 0]}
        fontSize={1.2}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {`${liters.toFixed(1)}`}
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