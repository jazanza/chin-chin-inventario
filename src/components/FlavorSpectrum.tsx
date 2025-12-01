import { useMemo } from "react";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import { ZALANDO_FONT_URL } from "@/lib/constants";

const COLORS: { [key: string]: string } = {
  IPA: "var(--primary-glitch-pink)",
  Lager: "var(--secondary-glitch-cyan)",
  Stout: "#8B008B",
  Porter: "#FF4500",
  Pilsner: "#00FF00",
  Ale: "#FFFF00",
  Other: "#FFFFFF",
};

const PARTICLE_COUNT_PER_SEGMENT = 2000;
const INNER_RADIUS = 1.5;
const OUTER_RADIUS = 2.0;

const FlavorSegment = ({ startAngle, angle, color }: { startAngle: number; angle: number; color: string }) => {
  const points = useMemo(() => {
    const p = new Float32Array(PARTICLE_COUNT_PER_SEGMENT * 3);
    for (let i = 0; i < PARTICLE_COUNT_PER_SEGMENT; i++) {
      const currentAngle = startAngle + Math.random() * angle;
      const radius = INNER_RADIUS + Math.random() * (OUTER_RADIUS - INNER_RADIUS);
      p[i * 3] = Math.cos(currentAngle) * radius;
      p[i * 3 + 1] = Math.sin(currentAngle) * radius;
      p[i * 3 + 2] = (Math.random() - 0.5) * 0.2; // Give it some depth
    }
    return p;
  }, [startAngle, angle]);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={PARTICLE_COUNT_PER_SEGMENT} array={points} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.02} color={color} />
    </points>
  );
};

export function FlavorSpectrum({ flavorData, ...props }: { flavorData: { [key: string]: number } } & JSX.IntrinsicElements['group']) {
  const totalMl = useMemo(() => Object.values(flavorData).reduce((sum, v) => sum + v, 0), [flavorData]);

  if (totalMl === 0) {
    return (
      <group {...props}>
        <Text position={[0, 0, 0]} fontSize={0.3} color="white" font={ZALANDO_FONT_URL}>No flavor data available</Text>
      </group>
    );
  }

  let accumulatedAngle = 0;

  return (
    <group {...props}>
      {Object.entries(flavorData).map(([category, ml]) => {
        const percentage = ml / totalMl;
        const angle = percentage * Math.PI * 2;
        const color = COLORS[category] || COLORS["Other"];

        const segment = (
          <FlavorSegment key={category} startAngle={accumulatedAngle} angle={angle} color={color} />
        );

        const midAngle = accumulatedAngle + angle / 2;
        const textRadius = OUTER_RADIUS + 0.3;
        const textX = Math.cos(midAngle) * textRadius;
        const textY = Math.sin(midAngle) * textRadius;

        accumulatedAngle += angle;

        return (
          <group key={`group-${category}`}>
            {segment}
            <Text position={[textX, textY, 0]} fontSize={0.15} color="white" font={ZALANDO_FONT_URL}>
              {`${category} (${(percentage * 100).toFixed(1)}%)`}
            </Text>
          </group>
        );
      })}
    </group>
  );
}