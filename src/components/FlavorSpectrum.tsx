import { useMemo } from "react";
import { Text } from "@react-three/drei";
import * as THREE from "three";

const COLORS: { [key: string]: string } = {
  IPA: "#FFC107",
  Lager: "#03A9F4",
  Stout: "#3F51B5",
  Porter: "#795548",
  Pilsner: "#8BC34A",
  Ale: "#FF9800",
  Other: "#9E9E9E",
};

const ArcSegment = ({ startAngle, angle, color, radius }: { startAngle: number; angle: number; color: string; radius: number; }) => {
  const arcColor = new THREE.Color(color);
  return (
    <mesh rotation={[0, startAngle, 0]}>
      <torusGeometry args={[radius, 0.1, 16, 100, angle]} />
      <meshStandardMaterial
        color={arcColor}
        emissive={arcColor}
        emissiveIntensity={3}
        toneMapped={false}
      />
    </mesh>
  );
};

export function FlavorSpectrum({ flavorData }: { flavorData: { [key: string]: number } }) {
  const totalMl = useMemo(() => Object.values(flavorData).reduce((sum, v) => sum + v, 0), [flavorData]);

  if (totalMl === 0) {
    return (
      <group>
        <Text position={[0, 0, 0]} fontSize={0.3} color="white">No flavor data available</Text>
      </group>
    );
  }

  let accumulatedAngle = 0;

  return (
    <group rotation-x={-Math.PI / 2}>
      {Object.entries(flavorData).map(([category, ml]) => {
        const percentage = ml / totalMl;
        const angle = percentage * Math.PI * 2;
        const color = COLORS[category] || COLORS["Other"];

        const segment = (
          <ArcSegment key={category} startAngle={accumulatedAngle} angle={angle} color={color} radius={2.5} />
        );

        const midAngle = accumulatedAngle + angle / 2;
        const textRadius = 3.0;
        const textX = Math.cos(midAngle) * textRadius;
        const textY = Math.sin(midAngle) * textRadius;

        accumulatedAngle += angle;

        return (
          <group key={`group-${category}`}>
            {segment}
            <Text position={[textX, textY, 0.5]} fontSize={0.2} color="white">
              {`${category} (${(percentage * 100).toFixed(0)}%)`}
            </Text>
          </group>
        );
      })}
    </group>
  );
}