import { useThree, extend } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { RenderPass } from "three-stdlib";
import { useMemo } from "react";

// The @react-three/postprocessing library is a wrapper, but for this low-level fix,
// we need to explicitly use the RenderPass from the underlying library and extend it
// so that react-three-fiber can render it as a component.
extend({ RenderPass });

export const SceneEffects = () => {
  const { gl, scene, camera, size } = useThree();

  // Your stricter guard condition: wait for the entire scene context to be ready.
  if (!gl || !scene || !camera || size.width === 0 || size.height === 0) {
    return null;
  }

  const key = useMemo(() => `${size.width}-${size.height}`, [size]);

  return (
    <EffectComposer key={key}>
      {/* 1. EXPLICIT RENDER PASS: The core of your fix. */}
      {/* This ensures the processing chain starts with a valid, initialized buffer. */}
      <renderPass attach="passes" args={[scene, camera]} />

      {/* 2. BLOOM EFFECT: Now added as the second pass in the chain. */}
      <Bloom
        mipmapBlur
        luminanceThreshold={1}
        luminanceSmoothing={0.025}
        intensity={1.5}
      />
    </EffectComposer>
  );
};