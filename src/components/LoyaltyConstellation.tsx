import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Sphere, Text } from "@react-three/drei";
import * as THREE from "three";

interface Customer {
  name: string;
  liters: number;
}

const Planet = ({ customer, index }: { customer: Customer; index: number }) => {
  const ref = useRef<THREE.Group>(null!);
  const radius = 2 + index * 0.8;
  const speed = 0.2 + (4 - index) * 0.05;

  useFrame(({ clock }) => {
    if (ref.current) {
      const t = clock.getElapsedTime() * speed;
      ref.current.position.x = Math.cos(t) * radius;
      ref.current.position.z = Math.sin(t) * radius;
    }
  });

  return (
    <group ref={ref}>
      <Sphere args={[0.1 + customer.liters * 0.01, 32, 32]}>
        <meshStandardMaterial color="lightblue" />
      </Sphere>
      <Text position={[0, 0.3, 0]} fontSize={0.15} color="white" anchorX="center">
        {customer.name}
      </Text>
      <Text position={[0, -0.3, 0]} fontSize={0.1} color="white" anchorX="center">
        {`${customer.liters.toFixed(1)} L`}
      </Text>
    </group>
  );
};

export function LoyaltyConstellation({ loyaltyMetrics, ...props }: { loyaltyMetrics: { topCustomers: Customer[] } } & JSX.IntrinsicElements['group']) {
  const { topCustomers } = loyaltyMetrics;
  const hasData = topCustomers && topCustomers.length > 0;
  const sun = hasData ? topCustomers[0] : null;
  const planets = hasData ? topCustomers.slice(1) : [];

  return (
    <group {...props}>
      {!hasData && <Text position={[0, 0, 0]} fontSize={0.3} color="white">No customer data available</Text>}
      {sun && (
        <>
          {/* Sun - Top Customer */}
          <Sphere args={[0.5 + sun.liters * 0.01, 32, 32]}>
            <meshStandardMaterial color="gold" emissive="orange" emissiveIntensity={0.6} />
          </Sphere>
          <Text position={[0, 0.8, 0]} fontSize={0.2} color="white" anchorX="center">
            {sun.name}
          </Text>
          <Text position={[0, -0.8, 0]} fontSize={0.15} color="white" anchorX="center">
            {`${sun.liters.toFixed(1)} L`}
          </Text>

          {/* Planets - Other Top Customers */}
          {planets.map((customer, index) => (
            <Planet key={customer.name} customer={customer} index={index} />
          ))}
        </>
      )}
    </group>
  );
}