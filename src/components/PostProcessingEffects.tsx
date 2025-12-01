import { useThree } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { useMemo } from "react";

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
        intensity={1.5}
      />
    </EffectComposer>
  );
};