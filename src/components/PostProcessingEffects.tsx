import { EffectComposer, Bloom } from "@react-three/postprocessing";

export const PostProcessingEffects = () => {
  return (
    <EffectComposer disableNormalPass>
      <Bloom
        mipmapBlur
        luminanceThreshold={0.5}
        luminanceSmoothing={0.1}
        intensity={0.75}
      />
    </EffectComposer>
  );
};