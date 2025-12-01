import { useRef, useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text, Box } from "@react-three/drei"; // Usar Box en lugar de Cylinder
import * as THREE from "three";

interface RankedBeer {
  name: string;
  liters: number;
  color: string;
}

// Eliminamos DataBubble y AestheticBubbles para un enfoque más brutalista y simple.

export function BeerVisualizer({ liters, rankedBeers, ...props }: { liters: number; rankedBeers: RankedBeer[] } & JSX.IntrinsicElements['group']) {
  const { viewport } = useThree();
  const liquidRef = useRef<THREE.Mesh>(null!);
  const textRef = useRef<any>(null!);
  const animatedHeight = useRef(0);

  const MAX_LITERS_FOR_SCALE = 1000;
  const targetHeight = (liters / MAX_LITERS_FOR_SCALE) * (viewport.height * 0.8);
  const bottomY = -viewport.height / 2;

  useFrame(() => {
    animatedHeight.current = THREE.MathUtils.lerp(animatedHeight.current, targetHeight, 0.05);
    
    if (liquidRef.current) {
      liquidRef.current.scale.y = animatedHeight.current;
      liquidRef.current.position.y = bottomY + (animatedHeight.current / 2);
    }

    if (textRef.current) {
      const topOfLiquid = bottomY + animatedHeight.current;
      textRef.current.position.y = topOfLiquid + 0.3;
    }
  });
  
  useEffect(() => {
    if (liters === 0) {
      animatedHeight.current = 0;
    }
  }, [liters]);

  return (
    <group {...props}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[0, 5, 5]} intensity={1} />

      {/* Pilar rectangular que emerge del fondo */}
      <Box ref={liquidRef} args={[viewport.width * 0.4, 1, 0.5]} position={[0, bottomY, 0]} scale-y={0}>
        <meshBasicMaterial color="var(--secondary-glitch-cyan)" wireframe={true} />
      </Box>

      <Text
        ref={textRef}
        position={[0, bottomY + 0.3, 0]}
        fontSize={0.5}
        color="var(--secondary-glitch-cyan)"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#000000"
      >
        {`${liters.toFixed(2)} L`}
      </Text>
    </group>
  );
}