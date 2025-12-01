import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Box, Text } from "@react-three/drei"; // Usar Box en lugar de Cylinder
import * as THREE from "three";

interface RankedBeer {
  name: string;
  liters: number;
  color: string;
}

const BeerColumn = ({ beer, index, maxLiters }: { beer: RankedBeer; index: number; maxLiters: number }) => {
  const ref = useRef<THREE.Group>(null!);
  const targetHeight = maxLiters > 0 ? (beer.liters / maxLiters) * 5 : 0.1;
  const currentHeight = useRef(0);
  const initialY = useRef(0); // Para la vibración

  const color = index % 2 === 0 ? "var(--primary-glitch-pink)" : "var(--secondary-glitch-cyan)";

  useFrame(({ clock }) => {
    if (ref.current) {
      currentHeight.current = THREE.MathUtils.lerp(currentHeight.current, targetHeight, 0.05);
      const box = ref.current.children[0] as THREE.Mesh;
      if (box) {
        box.scale.y = currentHeight.current;
        box.position.y = currentHeight.current / 2;
        // Vibración vertical sutil
        box.position.y += Math.sin(clock.getElapsedTime() * 5 + index) * 0.05;
      }
      const text = ref.current.children[1] as THREE.Object3D;
      if (text) {
        text.position.y = currentHeight.current + 0.3;
      }
    }
  });

  return (
    <group ref={ref} position={[(index - 4.5) * 1.2, 0, 0]}>
      <Box args={[0.8, 1, 0.8]} scale-y={0}> {/* Usar Box */}
        <meshBasicMaterial
          color={color}
          wireframe={true} // Wireframe
        />
      </Box>
      <Text
        position={[0, 0.3, 0]}
        fontSize={0.2}
        color="white"
        anchorX="center"
        maxWidth={1}
        textAlign="center"
      >
        {beer.name}
      </Text>
    </group>
  );
};

export function ConsumptionRanking({ rankedBeers, ...props }: { rankedBeers: RankedBeer[] } & JSX.IntrinsicElements['group']) {
  const maxLiters = Math.max(...rankedBeers.map(b => b.liters), 1);

  return (
    <group {...props} position={[0, -2, 0]}>
      {rankedBeers.map((beer, index) => (
        <BeerColumn key={beer.name} beer={beer} index={index} maxLiters={maxLiters} />
      ))}
    </group>
  );
}