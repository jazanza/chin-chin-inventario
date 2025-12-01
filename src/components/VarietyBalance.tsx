import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Box, Sphere, Cylinder, Text } from "@react-three/drei";
import * as THREE from "three";

export function VarietyBalance({ varietyMetrics, ...props }: { varietyMetrics: { totalLiters: number; uniqueProducts: number } } & JSX.IntrinsicElements['group']) {
  const balanceRef = useRef<THREE.Group>(null!);
  const { totalLiters, uniqueProducts } = varietyMetrics;

  // Normalize and weigh the values to create a sensible tilt.
  // These factors can be tweaked for aesthetic balance.
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
        <meshStandardMaterial color="gray" />
      </Cylinder>
      <Cylinder args={[1, 1, 0.1, 32]}>
        <meshStandardMaterial color="darkgray" />
      </Cylinder>

      {/* Balance Beam */}
      <group ref={balanceRef} position={[0, 2.1, 0]}>
        <Box args={[4, 0.1, 0.1]}>
          <meshStandardMaterial color="silver" />
        </Box>

        {/* Left Side: Volume */}
        <group position={[-2, 0.5, 0]}>
          <Box args={[0.8, 0.8, 0.8]}>
            <meshStandardMaterial color="#FFA82E" />
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
            <meshStandardMaterial color="#4169E1" />
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