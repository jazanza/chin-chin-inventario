import { Html, Text } from "@react-three/drei";

interface Customer {
  name: string;
  liters: number;
}

const glassMaterial = (
  <meshPhysicalMaterial
    transmission={0.9}
    opacity={1}
    metalness={0}
    roughness={0.2}
    ior={1.5}
    thickness={0.5}
    clearcoat={1}
    clearcoatRoughness={0}
  />
);

const CustomerBar = ({ customer, index, maxLiters }: { customer: Customer; index: number; maxLiters: number }) => {
  const height = maxLiters > 0 ? (customer.liters / maxLiters) * 5 : 0.01;
  const angle = (index / 10) * Math.PI * 2;
  const radius = 4;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;

  return (
    <group position={[x, 0, z]}>
      <mesh scale={[1, height, 1]} position={[0, height / 2, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 1, 16]} />
        {glassMaterial}
      </mesh>
      <Html position={[0, height + 0.5, 0]} center>
        <div style={{
          width: '120px',
          textAlign: 'center',
          background: 'rgba(255, 255, 255, 0.2)',
          backdropFilter: 'blur(5px)',
          padding: '4px 8px',
          borderRadius: '8px',
          color: 'white',
          fontSize: '14px',
          border: '1px solid rgba(255, 255, 255, 0.3)',
        }}>
          <strong>{customer.name}</strong><br />
          {customer.liters.toFixed(1)} L
        </div>
      </Html>
    </group>
  );
};

export function LoyaltyConstellation({ loyaltyMetrics, ...props }: { loyaltyMetrics: { topCustomers: Customer[] } } & JSX.IntrinsicElements['group']) {
  const { topCustomers } = loyaltyMetrics;
  const hasData = topCustomers && topCustomers.length > 0;
  const maxLiters = hasData ? Math.max(...topCustomers.map(c => c.liters)) : 0;

  return (
    <group {...props}>
      {!hasData && <Text position={[0, 0, 0]} fontSize={0.3} color="white">No customer data available</Text>}
      {hasData && topCustomers.slice(0, 10).map((customer, index) => (
        <CustomerBar key={customer.name} customer={customer} index={index} maxLiters={maxLiters} />
      ))}
    </group>
  );
}