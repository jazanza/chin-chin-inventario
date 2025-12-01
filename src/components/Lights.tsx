export const Lights = () => {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 7.5]} intensity={1} castShadow />
      {/* Rim light from the top-left */}
      <pointLight position={[-10, 10, -10]} intensity={0.5} color="#4a90e2" />
      {/* Fill light from the bottom-right */}
      <pointLight position={[10, -10, 10]} intensity={0.3} color="#e24a90" />
    </>
  );
};