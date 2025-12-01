interface NarrativeOverlayProps {
  title: string;
  range: string;
}

export const NarrativeOverlay = ({ title, range }: NarrativeOverlayProps) => {
  return (
    <div className="absolute top-8 left-8 z-10 text-white pointer-events-none animate-text-glitch-in">
      <h1
        className="text-5xl font-bold text-[var(--primary-glitch-pink)] uppercase tracking-widest"
        style={{ textShadow: "2px 2px var(--secondary-glitch-cyan)" }}
      >
        {title}
      </h1>
      <p
        className="text-2xl font-bold text-[var(--secondary-glitch-cyan)] uppercase tracking-wide"
        style={{ textShadow: "1px 1px var(--primary-glitch-pink)" }}
      >
        {range}
      </p>
    </div>
  );
};