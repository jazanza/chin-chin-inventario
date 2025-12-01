import { useRef, useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";

// 1. Reducción de Densidad
const PARTICLE_COUNT = 50000;
const CYLINDER_RADIUS = 5.0;
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
    const color = new THREE.Color(0x00ffff); // Start with base color

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const y = bottomY + (i / PARTICLE_COUNT) * maxHeight;
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * CYLINDER_RADIUS;
      
      pos[i * 3] = Math.cos(angle) * radius;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(angle) * radius;

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

    pointsRef.current.rotation.y += 0.001;

    animatedLiters.current = THREE.MathUtils.lerp(animatedLiters.current, liters, 0.02);
    const targetParticleCount = Math.floor((animatedLiters.current / MAX_LITERS_FOR_SCALE) * PARTICLE_COUNT);

    const geometry = pointsRef.current.geometry as THREE.BufferGeometry;
    geometry.setDrawRange(0, targetParticleCount);

    const time = clock.getElapsedTime() * 0.5;
    const posAttr = geometry.attributes.position as THREE.BufferAttribute;
    const colors = geometry.attributes.color as THREE.BufferAttribute;
    const color = new THREE.Color();

    // 3. Color Monocromático Animado
    const baseHue = 0.5; // Cyan
    const baseSaturation = 1.0;
    const animatedLuminosity = 0.4 + Math.sin(time * 2) * 0.3; // Pulses between 0.1 and 0.7

    for (let i = 0; i < targetParticleCount; i++) {
      const originalY = positions[i * 3 + 1];
      const originalX = positions[i * 3];
      
      // 2. Movimiento de Líquido Dramático y Orgánico
      const verticalWave = Math.sin(time + originalX * 0.5) * 0.8;
      const newY = originalY + verticalWave;
      
      posAttr.setXYZ(i, positions[i * 3], newY, positions[i * 3 + 2]);

      // Animar Brillo
      color.setHSL(baseHue, baseSaturation, animatedLuminosity);
      colors.setXYZ(i, color.r, color.g, color.b);
    }
    posAttr.needsUpdate = true;
    colors.needsUpdate = true;

    if (textRef.current) {
      const topOfLiquid = bottomY + (targetParticleCount / PARTICLE_COUNT) * maxHeight;
      textRef.current.position.y = topOfLiquid + 0.3;
      textRef.current.text = `${animatedLiters.current.toFixed(2)} L`;
    }
  });

  return (
    <group {...props} visible={visible} position={[0, viewport.height * 0.4, 0]}>
      <points ref={pointsRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={PARTICLE_COUNT} array={positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={PARTICLE_COUNT} array={initialColors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial
          // 1. Tamaño Máximo
          size={1.0}
          sizeAttenuation={false}
          vertexColors={true}
          transparent={true}
          opacity={0.7}
          alphaTest={0.5}
        />
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