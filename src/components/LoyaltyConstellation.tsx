import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Sphere, Text, Line } from "@react-three/drei"; // Importar Line
import * as THREE from "three";

interface Customer {
  name: string;
  liters: number;
}

const Planet = ({ customer, index, sunPosition }: { customer: Customer; index: number; sunPosition: THREE.Vector3 }) => {
  const ref = useRef<THREE.Group>(null!);
  const velocity = useMemo(() => new THREE.Vector3(), []);
  const position = useMemo(() => new THREE.Vector3(
    (Math.random() - 0.5) * 4,
    (Math.random() - 0.5) * 4,
    (Math.random() - 0.5) * 4
  ), []);

  const mass = 0.1 + customer.liters * 0.005; // Mass proportional to liters

  useFrame((state, delta) => {
    if (ref.current) {
      // Attraction to the sun
      const attractionForce = sunPosition.clone().sub(position).normalize().multiplyScalar(0.05 * mass);
      velocity.add(attractionForce.multiplyScalar(delta));

      // Repulsion from other planets (simplified for performance)
      const distanceToCenter = position.length();
      if (distanceToCenter < 1.5) {
        const repulsionForce = position.clone().normalize().multiplyScalar(-0.01 * mass);
        velocity.add(repulsionForce.multiplyScalar(delta));
      }

      // Damping
      velocity.multiplyScalar(0.98);

      // Update position
      position.add(velocity);

      // Keep within bounds (e.g., a sphere)
      const maxRadius = 6;
      if (position.length() > maxRadius) {
        position.normalize().multiplyScalar(maxRadius);
        velocity.multiplyScalar(-0.5); // Bounce effect
      }

      ref.current.position.copy(position);
    }
  });

  return (
    <group ref={ref}>
      <Sphere args={[0.1 + customer.liters * 0.01, 32, 32]}>
        <meshBasicMaterial color="var(--secondary-glitch-cyan)" /> {/* MeshBasicMaterial */}
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

  const sunPosition = useMemo(() => new THREE.Vector3(0, 0, 0), []); // Sun is always at the center

  return (
    <group {...props}>
      {!hasData && <Text position={[0, 0, 0]} fontSize={0.3} color="white">No customer data available</Text>}
      {sun && (
        <>
          {/* Sun - Top Customer */}
          <Sphere args={[0.5 + sun.liters * 0.01, 32, 32]}>
            <meshBasicMaterial color="var(--primary-glitch-pink)" emissive="var(--primary-glitch-pink)" emissiveIntensity={0.8} /> {/* MeshBasicMaterial */}
          </Sphere>
          <Text position={[0, 0.8, 0]} fontSize={0.2} color="white" anchorX="center">
            {sun.name}
          </Text>
          <Text position={[0, -0.8, 0]} fontSize={0.15} color="white" anchorX="center">
            {`${sun.liters.toFixed(1)} L`}
          </Text>

          {/* Planets - Other Top Customers */}
          {planets.map((customer, index) => (
            <Planet key={customer.name} customer={customer} index={index} sunPosition={sunPosition} />
          ))}

          {/* Líneas de conexión del sol a los planetas */}
          {planets.map((customer, index) => {
            const planetPosition = new THREE.Vector3(
              (Math.random() - 0.5) * 4,
              (Math.random() - 0.5) * 4,
              (Math.random() - 0.5) * 4
            ); // Esto debería ser la posición real del planeta, pero para el wireframe inicial, usamos un placeholder
            return (
              <Line
                key={`line-${customer.name}`}
                points={[sunPosition, planetPosition]}
                color="var(--primary-glitch-pink)"
                lineWidth={2}
              />
            );
          })}
        </>
      )}
    </group>
  );
}