import { Volume2, VolumeX } from 'lucide-react';
import { playSound, setSfxSettings, useSfxSettings } from '@/lib/sfx';

/** Mute button with a volume slider, for the replay viewer's and play view's toolbars. */
export function SoundToggle({ className = '' }: { className?: string }) {
  const { on, volume } = useSfxSettings();
  return (
    <div className={`group flex items-center gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={() => {
          setSfxSettings({ on: !on });
          if (!on) playSound('click');
        }}
        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
        title={on ? 'Mute sound effects' : 'Unmute sound effects'}
        aria-label={on ? 'Mute sound effects' : 'Unmute sound effects'}
        aria-pressed={on}
      >
        {on ? <Volume2 size={18} /> : <VolumeX size={18} />}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        disabled={!on}
        aria-label="Sound volume"
        onChange={e => setSfxSettings({ volume: Number(e.target.value) })}
        onPointerUp={() => playSound('coin')}
        className="h-1 w-0 cursor-pointer accent-amber-400 opacity-0 transition-all group-hover:w-20 group-hover:opacity-100 group-focus-within:w-20 group-focus-within:opacity-100 disabled:cursor-default"
      />
    </div>
  );
}
