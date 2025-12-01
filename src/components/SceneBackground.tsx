import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const targetColor = new THREE.Color();

export const SceneBackground = ({ color }: { color: string }) => {
  const { scene } = useThree();

  useFrame(() => {
    targetColor.set(color);
    if (scene.background) {
      (scene.background as THREE.Color).lerp(targetColor, 0.05);
    } else {
      scene.background = targetColor;
    }
  });

  return null;
};