import { useRef, useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";

const PARTICLE_COUNT = 50000;
const MAX_LITERS_FOR_SCALE = 15000;

export function BeerVisualizer({ liters, visible, ...props }: { liters: number; visible: boolean } & JSX.IntrinsicElements['group']) {
  const { viewport } = useThree();
  const pointsRef = useRef<THREE.Points>(null!);
  const textRef = useRef<any>(null!);
  const animatedLiters = useRef(0);
  const animatedTextY = useRef(-viewport.height); // Inicia fuera de la pantalla

  const maxHeight = viewport.height * 1.2;
  const bottomY = -maxHeight / 2;
  // Radio del cilindro dinámico basado en el ancho del viewport
  const dynamicCylinderRadius = viewport.width * 0.3; // Ajusta el multiplicador según sea necesario para el tamaño deseado

  const [positions, initialColors] = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const col = new Float32Array(PARTICLE_COUNT * 3);
    const color = new THREE.Color();

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const y = bottomY + (i / PARTICLE_COUNT) * maxHeight;
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * dynamicCylinderRadius; // Usa el radio dinámico
      
      pos[i * 3] = Math.cos(angle) * radius;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(angle) * radius;

      color.setHSL((y - bottomY) / maxHeight, 1.0, 0.5);
      col[i * 3] = color.r;
      col[i * 3 + 1] = color.g;
      col[i * 3 + 2] = color.b;
    }
    return [pos, col];
  }, [maxHeight, bottomY, dynamicCylinderRadius]); // Añade dynamicCylinderRadius a las dependencias

  useEffect(() => {
    if (visible) {
      animatedLiters.current = 0;
      // Reinicia la posición del texto fuera de la pantalla para la animación de entrada
      animatedTextY.current = -viewport.height / 2 - 2;
    }
  }, [visible, viewport.height]);

  useFrame(({ clock }) => {
    if (!visible || !pointsRef.current) return;

    // Anima el número de litros
    animatedLiters.current = THREE.MathUtils.lerp(animatedLiters.current, liters, 0.05);
    const targetParticleCount = Math.floor((animatedLiters.current / MAX_LITERS_FOR_SCALE) * PARTICLE_COUNT);

    const geometry = pointsRef.current.geometry as THREE.BufferGeometry;
    geometry.setDrawRange(0, targetParticleCount);

    const time = clock.getElapsedTime();
    const posAttr = geometry.attributes.position as THREE.BufferAttribute;
    const colors = geometry.attributes.color as THREE.BufferAttribute;
    const color = new THREE.Color();

    for (let i = 0; i < targetParticleCount; i++) {
      const y = positions[i * 3 + 1];
      const waveX = Math.sin(y * 2 + time) * 0.1;
      const waveZ = Math.cos(y * 2 + time) * 0.1;
      const waveY = Math.sin(positions[i * 3] * 0.5 + time) * 0.1;
      posAttr.setXYZ(i, positions[i * 3] + waveX, y + waveY, positions[i * 3 + 2] + waveZ);
      const hue = (time * 0.1 + (y - bottomY) / maxHeight * 0.1) % 1;
      color.setHSL(hue, 1.0, 0.5);
      colors.setXYZ(i, color.r, color.g, color.b);
    }
    posAttr.needsUpdate = true;
    colors.needsUpdate = true;

    // Anima la posición Y del texto hacia el centro (y=0)
    animatedTextY.current = THREE.MathUtils.lerp(animatedTextY.current, 0, 0.05);

    if (textRef.current) {
      textRef.current.position.y = animatedTextY.current; // Usa la posición Y animada
      textRef.current.text = `${animatedLiters.current.toFixed(2)} L`;
      textRef.current.fontSize = Math.min(2, viewport.width * 0.15); // Escala la fuente con el ancho del viewport, con un máximo de 2
    }
  });

  return (
    <group {...props} visible={visible}>
      <points ref={pointsRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={PARTICLE_COUNT} array={positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={PARTICLE_COUNT} array={initialColors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={0.3} vertexColors={true} transparent={true} opacity={0.7} />
      </points>

      <Text
        ref={textRef}
        position={[0, -viewport.height, 0]} // Posición inicial fuera de la pantalla
        fontSize={2} // Valor inicial, se actualizará en useFrame
        color="white"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.1}
        outlineColor="#000000"
      >
        {`0.00 L`}
      </Text>
    </group>
  );
}