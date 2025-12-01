import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Box, Sphere, Cylinder, Text } from "@react-three/drei";
import * as THREE from "three";

export function VarietyBalance({ varietyMetrics, ...props }: { varietyMetrics: { totalLiters: number; uniqueProducts: number } } & JSX.IntrinsicElements['group']) {
  const balanceRef = useRef<THREE.Group>(null!);
  const { totalLiters, uniqueProducts } = varietyMetrics;

  const volumeWeight = totalLiters * 0.1;
  const varietyWeight = uniqueProducts * 1.0;
  const totalWeight = volumeWeight + varietyWeight;
  const targetRotation = totalWeight > 0 ? (varietyWeight - volumeWeight) / totalWeight * (Math.PI / 8) : 0;

  useFrame(() => {
    if (balanceRef.current) {
      balanceRef.current.rotation.z = THREE.MathUtils.lerp(balanceRef.current.rotation.z, targetRotation, 0.05);
    }
  });

  return (
    <group position={[0, -1, 0]} {...props}>
      {/* Base */}
      <Cylinder args={[0.2, 0.2, 2, 32]} position={[0, 1, 0]}>
        <meshBasicMaterial color="gray" wireframe={true} /> {/* Wireframe */}
      </Cylinder>
      <Cylinder args={[1, 1, 0.1, 32]}>
        <meshBasicMaterial color="darkgray" wireframe={true} /> {/* Wireframe */}
      </Cylinder>

      {/* Balance Beam */}
      <group ref={balanceRef} position={[0, 2.1, 0]}>
        <Box args={[4, 0.1, 0.1]}>
          <meshBasicMaterial color="silver" wireframe={true} /> {/* Wireframe */}
        </Box>

        {/* Left Side: Volume */}
        <group position={[-2, 0.5, 0]}>
          <Box args={[0.8, 0.8, 0.8]}>
            <meshBasicMaterial color="var(--primary-glitch-pink)" wireframe={true} /> {/* Wireframe */}
          </Box>
          <Text position={[0, -0.8, 0]} fontSize={0.2} color="white">
            Volume
          </Text>
          <Text position={[0, -1.1, 0]} fontSize={0.15} color="white">
            {`${totalLiters.toFixed(1)} L`}
          </Text>
        </group>

        {/* Right Side: Variety */}
        <group position={[2, 0.5, 0]}>
          <Sphere args={[0.5, 32, 32]}>
            <meshBasicMaterial color="var(--secondary-glitch-cyan)" wireframe={true} /> {/* Wireframe */}
          </Sphere>
          <Text position={[0, -0.8, 0]} fontSize={0.2} color="white">
            Variety
          </Text>
          <Text position={[0, -1.1, 0]} fontSize={0.15} color="white">
            {`${uniqueProducts} Products`}
          </Text>
        </group>
      </group>
    </group>
  );
}