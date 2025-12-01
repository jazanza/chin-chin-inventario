import { useMemo } from "react";
import { Text, Box } from "@react-three/drei"; // Usar Box en lugar de Cylinder
import * as THREE from "three";

const COLORS: { [key: string]: string } = {
  IPA: "var(--primary-glitch-pink)",
  Lager: "var(--secondary-glitch-cyan)",
  Stout: "#8B008B", // Un tono de púrpura para contraste
  Porter: "#FF4500", // Naranja rojizo
  Pilsner: "#00FF00", // Verde brillante
  Ale: "#FFFF00", // Amarillo brillante
  Other: "#FFFFFF", // Blanco puro
};

export function FlavorSpectrum({ flavorData, ...props }: { flavorData: { [key: string]: number } } & JSX.IntrinsicElements['group']) {
  const totalMl = useMemo(() => Object.values(flavorData).reduce((sum, v) => sum + v, 0), [flavorData]);

  if (totalMl === 0) {
    return (
      <group {...props}>
        <Text position={[0, 0, 0]} fontSize={0.3} color="white">No flavor data available</Text>
      </group>
    );
  }

  let accumulatedAngle = 0;

  return (
    <group rotation={[Math.PI / 4, 0, 0]} {...props}>
      {Object.entries(flavorData).map(([category, ml]) => {
        const percentage = ml / totalMl;
        const angle = percentage * Math.PI * 2;
        const color = COLORS[category] || COLORS["Other"];

        // Usar BoxGeometry para un look brutalista
        const segment = (
          <mesh key={category} rotation={[0, 0, accumulatedAngle]} position={[0, 0, 0]}>
            <boxGeometry args={[1.5, 0.4, 0.4]} /> {/* Un prisma rectangular */}
            <meshBasicMaterial color={color} wireframe={true} /> {/* Wireframe */}
          </mesh>
        );

        const midAngle = accumulatedAngle + angle / 2;
        const textX = Math.cos(midAngle) * 2.3;
        const textY = Math.sin(midAngle) * 2.3;

        accumulatedAngle += angle;

        return (
          <group key={`group-${category}`}>
            {segment}
            <Text position={[textY, -textX, 0]} fontSize={0.15} color="white" rotation={[0, 0, -Math.PI / 2]}>
              {`${category} (${(percentage * 100).toFixed(1)}%)`}
            </Text>
          </group>
        );
      })}
    </group>
  );
}