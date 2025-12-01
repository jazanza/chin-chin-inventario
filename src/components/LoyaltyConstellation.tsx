import { Html, Text } from "@react-three/drei";
import * as THREE from "three";

interface Customer {
  name: string;
  liters: number;
}

const CustomerPlane = ({ customer, index, maxLiters }: { customer: Customer; index: number; maxLiters: number }) => {
  const height = maxLiters > 0 ? (customer.liters / maxLiters) * 4 + 0.5 : 0.5;
  const angle = (index / 10) * Math.PI * 2;
  const radius = 4;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;

  return (
    <group position={[x, height, z]}>
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1.5, 1.5]} />
        <meshStandardMaterial
          color="#00ffff"
          opacity={0.5}
          transparent={true}
          side={THREE.DoubleSide}
        />
      </mesh>
      <Html position={[0, 0.2, 0]} center>
        <div style={{
          width: '120px',
          textAlign: 'center',
          color: 'white',
          fontSize: '14px',
          textShadow: '0 0 5px #00ffff',
        }}>
          <strong>{customer.name}</strong><br />
          {customer.liters.toFixed(1)} L
        </div>
      </Html>
    </group>
  );
};

export function LoyaltyConstellation({ loyaltyMetrics }: { loyaltyMetrics: { topCustomers: Customer[] } }) {
  const { topCustomers } = loyaltyMetrics;
  const hasData = topCustomers && topCustomers.length > 0;
  const maxLiters = hasData ? Math.max(...topCustomers.map(c => c.liters)) : 0;

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.1}>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial color="#003333" transparent opacity={0.3} />
      </mesh>
      {!hasData && <Text position={[0, 2, 0]} fontSize={0.3} color="white">No customer data available</Text>}
      {hasData && topCustomers.slice(0, 10).map((customer, index) => (
        <CustomerPlane key={customer.name} customer={customer} index={index} maxLiters={maxLiters} />
      ))}
    </group>
  );
}