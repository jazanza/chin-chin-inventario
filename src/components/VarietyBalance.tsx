import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Torus, Cylinder, Text } from "@react-three/drei";
import * as THREE from "three";

const PulsingParticles = ({ color, weight }: { color: string; weight: number }) => {
  const pointsRef = useRef<THREE.Points>(null!);
  const particleCount = 100;
  const radius = 0.5 + Math.log(weight + 1) * 0.1;

  const points = useMemo(() => {
    const p = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const r = Math.random() * radius;
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(2 * Math.random() - 1);
      p[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      p[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      p[i * 3 + 2] = r * Math.cos(phi);
    }
    return p;
  }, [particleCount, radius]);

  useFrame(({ clock }) => {
    if (pointsRef.current) {
      const scale = 1 + Math.sin(clock.getElapsedTime() * 2) * 0.1;
      pointsRef.current.scale.set(scale, scale, scale);
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={particleCount} array={points} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.05} color={color} />
    </points>
  );
};

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
      <Cylinder args={[0.2, 0.2, 2, 8]} position={[0, 1, 0]}>
        <meshBasicMaterial color="gray" wireframe={true} />
      </Cylinder>
      <Cylinder args={[1, 1, 0.1, 16]}>
        <meshBasicMaterial color="darkgray" wireframe={true} />
      </Cylinder>

      <group ref={balanceRef} position={[0, 2.1, 0]}>
        <Cylinder args={[0.05, 0.05, 4, 8]} rotation-z={Math.PI / 2}>
          <meshBasicMaterial color="silver" wireframe={true} />
        </Cylinder>

        <group position={[-2, 0.5, 0]}>
          <PulsingParticles color="var(--primary-glitch-pink)" weight={totalLiters} />
          <Text position={[0, -0.8, 0]} fontSize={0.2} color="white">Volume</Text>
          <Text position={[0, -1.1, 0]} fontSize={0.15} color="white">{`${totalLiters.toFixed(1)} L`}</Text>
        </group>

        <group position={[2, 0.5, 0]}>
          <Torus args={[0.5, 0.1, 8, 32]}>
            <meshBasicMaterial color="var(--secondary-glitch-cyan)" wireframe={true} />
          </Torus>
          <Text position={[0, -0.8, 0]} fontSize={0.2} color="white">Variety</Text>
          <Text position={[0, -1.1, 0]} fontSize={0.15} color="white">{`${uniqueProducts} Products`}</Text>
        </group>
      </group>
    </group>
  );
}