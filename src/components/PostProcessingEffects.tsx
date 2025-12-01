import { useThree, extend } from "@react-three/fiber";
import { EffectComposer, Bloom, Glitch } from "@react-three/postprocessing";
import { RenderPass } from "three-stdlib";
import { useMemo } from "react";
import * as THREE from 'three';
import { GlitchMode } from 'postprocessing';

extend({ RenderPass });

export const PostProcessingEffects = () => {
  const { gl, scene, camera, size } = useThree();

  if (!gl || !scene || !camera || size.width === 0 || size.height === 0) {
    return null;
  }

  const key = useMemo(() => `${size.width}-${size.height}`, [size]);

  return (
    <EffectComposer key={key}>
      <renderPass attachArray="passes" args={[scene, camera]} />
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