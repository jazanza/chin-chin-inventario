import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Sphere, Text, Line } from "@drei";
import * as THREE from "three";

interface Customer {
  name: string;
  liters: number;
}

const Planet = ({ customer, sunPosition }: { customer: Customer; sunPosition: THREE.Vector3 }) => {
  const groupRef = useRef<THREE.Group>(null!);
  const lineRef = useRef<any>(null!);
  const velocity = useMemo(() => new THREE.Vector3(), []);
  const position = useMemo(() => new THREE.Vector3(
    (Math.random() - 0.5) * 8,
    (Math.random() - 0.5) * 8,
    (Math.random() - 0.5) * 8
  ), []);

  const mass = 0.1 + customer.liters * 0.005;

  useFrame((_, delta) => {
    if (groupRef.current) {
      const attractionForce = sunPosition.clone().sub(position).normalize().multiplyScalar(0.05 * mass);
      velocity.add(attractionForce.multiplyScalar(delta));
      velocity.multiplyScalar(0.98);
      position.add(velocity);
      groupRef.current.position.copy(position);

      // Actualizar la línea dinámicamente
      if (lineRef.current) {
        lineRef.current.geometry.setPositions([sunPosition.x, sunPosition.y, sunPosition.z, position.x, position.y, position.z]);
      }
    }
  });

  return (
    <group ref={groupRef}>
      <Sphere args={[0.1 + customer.liters * 0.01, 16, 16]}>
        <meshBasicMaterial color="var(--secondary-glitch-cyan)" />
      </Sphere>
      <Text position={[0, 0.3, 0]} fontSize={0.15} color="white" anchorX="center">
        {customer.name}
      </Text>
      <Text position={[0, -0.3, 0]} fontSize={0.1} color="white" anchorX="center">
        {`${customer.liters.toFixed(1)} L`}
      </Text>
      <Line
        ref={lineRef}
        points={[sunPosition, position]}
        color="var(--primary-glitch-pink)"
        lineWidth={1}
        transparent
        opacity={0.3}
      />
    </group>
  );
};

export function LoyaltyConstellation({ loyaltyMetrics, ...props }: { loyaltyMetrics: { topCustomers: Customer[] } } & JSX.IntrinsicElements['group']) {
  const { topCustomers } = loyaltyMetrics;
  const hasData = topCustomers && topCustomers.length > 0;
  const sun = hasData ? topCustomers[0] : null;
  const planets = hasData ? topCustomers.slice(1) : [];
  const sunPosition = useMemo(() => new THREE.Vector3(0, 0, 0), []);

  return (
    <group {...props}>
      {!hasData && <Text position={[0, 0, 0]} fontSize={0.3} color="white">No customer data available</Text>}
      {sun && (
        <>
          <Sphere args={[0.5 + sun.liters * 0.01, 32, 32]}>
            <meshBasicMaterial color="var(--primary-glitch-pink)" emissive="var(--primary-glitch-pink)" emissiveIntensity={0.8} />
          </Sphere>
          <Text position={[0, 0.8, 0]} fontSize={0.2} color="white" anchorX="center">
            {sun.name}
          </Text>
          <Text position={[0, -0.8, 0]} fontSize={0.15} color="white" anchorX="center">
            {`${sun.liters.toFixed(1)} L`}
          </Text>
          {planets.map((customer) => (
            <Planet key={customer.name} customer={customer} sunPosition={sunPosition} />
          ))}
        </>
      )}
    </group>
  );
}