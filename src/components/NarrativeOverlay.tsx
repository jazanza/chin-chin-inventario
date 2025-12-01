interface NarrativeOverlayProps {
  title: string;
  range: string;
}

export const NarrativeOverlay = ({ title, range }: NarrativeOverlayProps) => {
  return (
    <div 
      className="absolute top-8 left-8 z-10 p-6 rounded-2xl"
      style={{
        background: 'rgba(0, 0, 0, 0.2)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
      }}
    >
      <h1 className="text-5xl font-bold text-white uppercase tracking-widest">
        {title}
      </h1>
      <p className="text-2xl font-bold text-white/80 uppercase tracking-wide mt-2">
        {range}
      </p>
    </div>
  );
};