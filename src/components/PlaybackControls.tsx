import { Button } from "@/components/ui/button";
import { Play, Pause, SkipForward, SkipBack } from "lucide-react";

interface PlaybackControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
}

export const PlaybackControls = ({ isPlaying, onPlayPause, onNext, onPrev }: PlaybackControlsProps) => {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 p-2 bg-black/50 rounded-lg z-20">
      <Button onClick={onPrev} variant="ghost" size="icon" className="text-[var(--secondary-glitch-cyan)] hover:text-cyan-300">
        <SkipBack className="h-6 w-6" />
      </Button>
      <Button onClick={onPlayPause} variant="ghost" size="icon" className="text-[var(--primary-glitch-pink)] hover:text-pink-400">
        {isPlaying ? <Pause className="h-8 w-8" /> : <Play className="h-8 w-8" />}
      </Button>
      <Button onClick={onNext} variant="ghost" size="icon" className="text-[var(--secondary-glitch-cyan)] hover:text-cyan-300">
        <SkipForward className="h-6 w-6" />
      </Button>
    </div>
  );
};