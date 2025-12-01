import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useMemo } from "react";

type ViewMode = "meter" | "spectrum" | "balance" | "loyalty";

const CAMERA_PRESETS: { [key in ViewMode]: { position: THREE.Vector3; lookAt: THREE.Vector3 } } = {
  meter: {
    position: new THREE.Vector3(0, 1, 7),
    lookAt: new THREE.Vector3(0, 0, 0),
  },
  spectrum: {
    position: new THREE.Vector3(0, 4, 4),
    lookAt: new THREE.Vector3(0, 0, 0),
  },
  balance: {
    position: new THREE.Vector3(5, 1, 0),
    lookAt: new THREE.Vector3(0, 1, 0),
  },
  loyalty: {
    position: new THREE.Vector3(0, 3, 8),
    lookAt: new THREE.Vector3(0, 0, 0),
  },
};

export function CameraAnimator({ viewMode }: { viewMode: ViewMode }) {
  const { camera } = useThree();
  const currentLookAt = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }) => {
    const preset = CAMERA_PRESETS[viewMode];
    const targetPosition = preset.position.clone();
    const targetLookAt = preset.lookAt.clone();

    // For loyalty view, add a slow orbit
    if (viewMode === 'loyalty') {
      const time = clock.getElapsedTime() * 0.08;
      targetPosition.x = 8 * Math.cos(time);
      targetPosition.z = 8 * Math.sin(time);
      targetPosition.y = 3 + Math.sin(time * 0.5);
    }

    // Smoothly interpolate camera position
    camera.position.lerp(targetPosition, 0.03);

    // Smoothly interpolate lookAt target
    currentLookAt.lerp(targetLookAt, 0.03);
    camera.lookAt(currentLookAt);
  });

  return null;
}