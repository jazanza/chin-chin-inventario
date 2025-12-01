import { useRef, useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";

const PARTICLE_COUNT = 100000;
const CYLINDER_RADIUS = 3.0; // Aumentado para hacerlo más ancho
const MAX_LITERS_FOR_SCALE = 1000;

export function BeerVisualizer({ liters, visible, ...props }: { liters: number; visible: boolean } & JSX.IntrinsicElements['group']) {
  const { viewport } = useThree();
  const pointsRef = useRef<THREE.Points>(null!);
  const textRef = useRef<any>(null!);
  const animatedLiters = useRef(0);

  const maxHeight = viewport.height * 1.2;
  const bottomY = -maxHeight / 2;

  const [positions, initialColors] = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const col = new Float32Array(PARTICLE_COUNT * 3);
    const color = new THREE.Color();

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const y = bottomY + (i / PARTICLE_COUNT) * maxHeight;
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * CYLINDER_RADIUS;
      
      pos[i * 3] = Math.cos(angle) * radius;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(angle) * radius;

      color.setHSL((y - bottomY) / maxHeight, 1.0, 0.5);
      col[i * 3] = color.r;
      col[i * 3 + 1] = color.g;
      col[i * 3 + 2] = color.b;
    }
    return [pos, col];
  }, [maxHeight, bottomY]);

  useEffect(() => {
    if (visible) {
      animatedLiters.current = 0;
    }
  }, [visible, liters]);

  useFrame(({ clock }) => {
    if (!visible || !pointsRef.current) return;

    animatedLiters.current = THREE.MathUtils.lerp(animatedLiters.current, liters, 0.05);
    const targetParticleCount = Math.floor((animatedLiters.current / MAX_LITERS_FOR_SCALE) * PARTICLE_COUNT);

    const geometry = pointsRef.current.geometry as THREE.BufferGeometry;
    geometry.setDrawRange(0, targetParticleCount);

    // Animación de color dinámica
    const time = clock.getElapsedTime() * 0.5;
    const colors = geometry.attributes.color as THREE.BufferAttribute;
    const color = new THREE.Color();

    for (let i = 0; i < targetParticleCount; i++) {
      const y = positions[i * 3 + 1];
      const hue = ((y - bottomY) / maxHeight + time) % 1;
      color.setHSL(hue, 1.0, 0.5);
      colors.setXYZ(i, color.r, color.g, color.b);
    }
    colors.needsUpdate = true;

    if (textRef.current) {
      const topOfLiquid = bottomY + (targetParticleCount / PARTICLE_COUNT) * maxHeight;
      textRef.current.position.y = topOfLiquid + 0.3;
      textRef.current.text = `${animatedLiters.current.toFixed(2)} L`;
    }
  });

  return (
    <group {...props} visible={visible}>
      <points ref={pointsRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={PARTICLE_COUNT} array={positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={PARTICLE_COUNT} array={initialColors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={0.03} vertexColors={true} transparent={true} opacity={0.7} />
      </points>

      <Text
        ref={textRef}
        position={[0, bottomY + 0.3, 0]}
        fontSize={0.5}
        color="white"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#000000"
      >
        {`0.00 L`}
      </Text>
    </group>
  );
}