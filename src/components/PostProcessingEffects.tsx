import { useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, Glitch } from "@react-three/postprocessing";
import { useMemo } from "react";
import * as THREE from 'three';
import { GlitchMode } from 'postprocessing';

export const PostProcessingEffects = () => {
  const { size } = useThree();

  if (size.width === 0 || size.height === 0) {
    return null;
  }

  const key = useMemo(() => `${size.width}-${size.height}`, [size]);

  return (
    <EffectComposer key={key}>
      <Bloom
        mipmapBlur
        luminanceThreshold={0.1}
        luminanceSmoothing={0.025}
        intensity={2.0}
      />
      <Glitch
        delay={new THREE.Vector2(1.5, 3.5)}
        duration={new THREE.Vector2(0.6, 1.0)}
        strength={new THREE.Vector2(0.01, 0.02)}
        mode={GlitchMode.SPORADIC}
        active
        ratio={0.85}
      />
    </EffectComposer>
  );
};