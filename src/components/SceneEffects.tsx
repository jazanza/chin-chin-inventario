import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { useThree } from "@react-three/fiber";
import React from "react";

export const SceneEffects = () => {
  const { gl } = useThree();

  // Si el contexto GL no está disponible, no renderizamos.
  if (!gl) {
    return null;
  }

  // Eliminamos skipRender y los props de tamaño.
  // Esto permite que EffectComposer tome el control total del renderizado,
  // lo que a menudo soluciona problemas de inicialización de buffers.
  return (
    <EffectComposer>
      <Bloom
        mipmapBlur
        luminanceThreshold={1}
        luminanceSmoothing={0.025}
        intensity={1.5}
      />
    </EffectComposer>
  );
};