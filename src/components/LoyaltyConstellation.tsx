import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Text, Line } from "@react-three/drei";
import * as THREE from "three";
import { createNoise3D } from 'simplex-noise';

interface Customer {
  name: string;
  liters: number;
}

const noise3D = createNoise3D(Math.random);

const CustomerCluster = ({ customer, sunPosition, isSun = false }: { customer: Customer; sunPosition: THREE.Vector3; isSun?: boolean }) => {
  const groupRef = useRef<THREE.Group>(null!);
  const lineRef = useRef<any>(null!);
  const velocity = useMemo(() => new THREE.Vector3(), []);
  const position = useMemo(() => isSun ? sunPosition.clone() : new THREE.Vector3(
    (Math.random() - 0.5) * 8,
    (Math.random() - 0.5) * 8,
    (Math.random() - 0.5) * 8
  ), [isSun, sunPosition]);

  const mass = 0.1 + customer.liters * 0.005;
  const particleCount = isSun ? 1000 : Math.max(100, Math.floor(customer.liters * 10));
  const clusterRadius = isSun ? 0.5 + customer.liters * 0.01 : 0.1 + customer.liters * 0.01;

  const points = useMemo(() => {
    const p = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const r = Math.random() * clusterRadius;
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(2 * Math.random() - 1);
      p[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      p[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      p[i * 3 + 2] = r * Math.cos(phi);
    }
    return p;
  }, [particleCount, clusterRadius]);

  useFrame(({ clock }, delta) => {
    if (groupRef.current) {
      if (!isSun) {
        const attractionForce = sunPosition.clone().sub(position).normalize().multiplyScalar(0.05 * mass);
        velocity.add(attractionForce.multiplyScalar(delta));
        velocity.multiplyScalar(0.98);
        position.add(velocity);
      }
      groupRef.current.position.copy(position);

      // Organic wavy motion for particles
      const time = clock.getElapsedTime();
      const pointsGeom = (groupRef.current.children[0] as THREE.Points).geometry;
      const posAttr = pointsGeom.attributes.position;
      for (let i = 0; i < particleCount; i++) {
        const x = points[i * 3];
        const y = points[i * 3 + 1];
        const z = points[i * 3 + 2];
        const noise = noise3D(x * 2 + time, y * 2 + time, z * 2 + time) * 0.1;
        posAttr.setXYZ(i, x + noise, y + noise, z + noise);
      }
      posAttr.needsUpdate = true;

      if (!isSun && lineRef.current) {
        lineRef.current.geometry.setPositions([sunPosition.x, sunPosition.y, sunPosition.z, position.x, position.y, position.z]);
      }
    }
  });

  const color = isSun ? "var(--primary-glitch-pink)" : "var(--secondary-glitch-cyan)";

  return (
    <group ref={groupRef}>
      <points frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={particleCount} array={points} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={0.03} color={color} />
      </points>
      <Text position={[0, clusterRadius + 0.2, 0]} fontSize={0.15} color="white" anchorX="center">
        {customer.name}
      </Text>
      <Text position={[0, -clusterRadius - 0.2, 0]} fontSize={0.1} color="white" anchorX="center">
        {`${customer.liters.toFixed(1)} L`}
      </Text>
      {!isSun && (
        <Line
          ref={lineRef}
          points={[sunPosition, position]}
          color="var(--primary-glitch-pink)"
          lineWidth={1}
          transparent
          opacity={0.3}
        />
      )}
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
          <CustomerCluster customer={sun} sunPosition={sunPosition} isSun={true} />
          {planets.map((customer) => (
            <CustomerCluster key={customer.name} customer={customer} sunPosition={sunPosition} />
          ))}
        </>
      )}
    </group>
  );
}