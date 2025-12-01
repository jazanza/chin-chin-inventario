import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Cylinder, Text } from "@react-three/drei";
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

  useFrame(() => {
    if (ref.current) {
      currentHeight.current = THREE.MathUtils.lerp(currentHeight.current, targetHeight, 0.05);
      const cylinder = ref.current.children[0] as THREE.Mesh;
      if (cylinder) {
        cylinder.scale.y = currentHeight.current;
        cylinder.position.y = currentHeight.current / 2;
      }
      const text = ref.current.children[1] as THREE.Object3D;
      if (text) {
        text.position.y = currentHeight.current + 0.3;
      }
    }
  });

  const isTopBeer = index === 0;

  return (
    <group ref={ref} position={[(index - 4.5) * 1.2, 0, 0]}>
      <Cylinder args={[0.4, 0.4, 1, 32]} scale-y={0}>
        <meshStandardMaterial
          color={beer.color}
          emissive={beer.color}
          emissiveIntensity={isTopBeer ? 1.5 : 0.7}
          toneMapped={false}
        />
      </Cylinder>
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