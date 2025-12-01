import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { useThree } from "@react-three/fiber";
import React from "react";

export const SceneEffects = () => {
  const { gl, size } = useThree();

  // Si el contexto GL o el tamaño no están listos, no renderizamos.
  if (!gl || size.width === 0 || size.height === 0) {
    return null;
  }

  // Forzamos el re-montaje del EffectComposer cuando el tamaño del viewport cambia.
  // Esto resuelve el error de ciclo de vida al asegurar que se inicializa con un estado válido.
  const key = `${size.width}-${size.height}`;

  return (
    <EffectComposer key={key}>
      <Bloom
        mipmapBlur
        luminanceThreshold={1}
        luminanceSmoothing={0.025}
        intensity={1.5}
      />
    </EffectComposer>
  );
};