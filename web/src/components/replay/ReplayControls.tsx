import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, SkipBack, SkipForward } from 'lucide-react';
import type { GameState } from '@/types/gamelog';

interface ReplayControlsProps {
  currentStep: number;
  totalMoves: number;
  gameState: GameState | undefined;
  isAnimating: boolean;
  onPrev: () => void;
  onNext: () => void;
  onJump: (target: number) => void;
  generationBoundaries: Map<number, { start: number; end: number }>;
}

export function ReplayControls({
  currentStep, totalMoves, gameState, isAnimating,
  onPrev, onNext, onJump, generationBoundaries,
}: ReplayControlsProps) {
  const [sliderHover, setSliderHover] = useState<{ value: number; pct: number } | null>(null);
  const [showGenPicker, setShowGenPicker] = useState(false);
  const sliderRef = useRef<HTMLInputElement>(null);
  const genPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showGenPicker) return;
    const onClick = (e: MouseEvent) => {
      if (genPickerRef.current && !genPickerRef.current.contains(e.target as Node)) {
        setShowGenPicker(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [showGenPicker]);

  const handleSliderHover = useCallback((e: React.MouseEvent<HTMLInputElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const value = Math.round(pct * (totalMoves - 1));
    setSliderHover({ value, pct: pct * 100 });
  }, [totalMoves]);

  const currentGen = gameState?.generation ?? null;
  const sortedGens = useMemo(
    () => Array.from(generationBoundaries.keys()).sort((a, b) => a - b),
    [generationBoundaries],
  );

  const jumpGenStart = () => {
    if (currentGen == null) return;
    const bounds = generationBoundaries.get(currentGen);
    if (bounds) onJump(bounds.start);
  };

  const jumpGenEnd = () => {
    if (currentGen == null) return;
    const bounds = generationBoundaries.get(currentGen);
    if (bounds) onJump(bounds.end);
  };

  const jumpPrevGen = () => {
    if (currentGen == null || sortedGens.length === 0) return;
    const idx = sortedGens.indexOf(currentGen);
    const prevGen = idx > 0 ? sortedGens[idx - 1] : null;
    if (prevGen != null) {
      const bounds = generationBoundaries.get(prevGen);
      if (bounds) onJump(bounds.start);
    }
  };

  const jumpNextGen = () => {
    if (currentGen == null || sortedGens.length === 0) return;
    const idx = sortedGens.indexOf(currentGen);
    const nextGen = idx >= 0 && idx < sortedGens.length - 1 ? sortedGens[idx + 1] : null;
    if (nextGen != null) {
      const bounds = generationBoundaries.get(nextGen);
      if (bounds) onJump(bounds.start);
    }
  };

  const hasGenerations = sortedGens.length > 0 && currentGen != null;
  const hasPrevGen = hasGenerations && sortedGens.indexOf(currentGen) > 0;
  const hasNextGen = hasGenerations && sortedGens.indexOf(currentGen) < sortedGens.length - 1;

  const sliderPct = totalMoves > 1 ? (currentStep / (totalMoves - 1)) * 100 : 0;

  const navBtn = "nav-btn flex items-center justify-center w-10 h-10 rounded-xl text-slate-300";
  const genBtn = "nav-btn flex items-center justify-center px-3 h-8 rounded-lg text-xs font-medium text-slate-400";

  return (
    <div className="mt-4 controls-panel rounded-2xl px-5 py-4 space-y-3 max-w-3xl mx-auto">
      {/* Move info */}
      <div className="flex items-center justify-center gap-4 text-sm">
        <span className="text-slate-400">
          Move <span className="text-white font-semibold glow-white">{currentStep + 1}</span>
          <span className="text-slate-500"> / {totalMoves}</span>
        </span>
        {hasGenerations && (
          <div className="relative" ref={genPickerRef}>
            <button
              onClick={() => setShowGenPicker(v => !v)}
              className="text-slate-400 hover:text-amber-300 transition-colors cursor-pointer"
            >
              Gen <span className="text-amber-400 font-semibold glow-amber">{currentGen}</span>
            </button>
            {showGenPicker && (
              <div className="glass-panel rounded-xl py-2 shadow-xl max-h-52 overflow-y-auto min-w-[4.5rem] scrollbar-hidden" style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '0.5rem', zIndex: 50 }}>
                {sortedGens.map(g => (
                  <button
                    key={g}
                    onClick={() => {
                      const bounds = generationBoundaries.get(g);
                      if (bounds) onJump(bounds.start);
                      setShowGenPicker(false);
                    }}
                    className={`block w-full px-4 py-1.5 text-sm text-left transition-colors ${
                      g === currentGen
                        ? 'text-amber-400 font-semibold bg-white/10'
                        : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    Gen {g}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Slider */}
      <div className="relative px-1 pt-1 pb-2">
        <input
          ref={sliderRef}
          type="range"
          min={0}
          max={totalMoves - 1}
          value={currentStep}
          onChange={e => onJump(parseInt(e.target.value, 10))}
          onMouseMove={handleSliderHover}
          onMouseLeave={() => setSliderHover(null)}
          disabled={isAnimating}
          className="replay-slider"
          style={{ '--slider-pct': `${sliderPct}%` } as React.CSSProperties}
        />
        {sliderHover && (
          <div
            className="absolute -top-6 -translate-x-1/2 pointer-events-none text-amber-200 text-xs font-bold rounded-md px-2 py-0.5 whitespace-nowrap glow-amber"
            style={{ background: 'linear-gradient(180deg, rgba(217,119,6,0.9), rgba(180,80,0,0.95))', boxShadow: 'inset 0 1px 0 rgba(255,220,150,0.3), 0 0 12px rgba(217,119,6,0.5), 0 4px 8px rgba(0,0,0,0.4)', left: `${sliderHover.pct}%` }}
          >
            {sliderHover.value + 1}
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-center gap-1">
        {hasGenerations && (
          <button onClick={jumpPrevGen} disabled={!hasPrevGen || isAnimating} className={navBtn} title="Previous generation">
            <ChevronsLeft className="w-5 h-5" />
          </button>
        )}
        <button onClick={onPrev} disabled={currentStep <= 0 || isAnimating} className={navBtn} title="Previous move">
          <ChevronLeft className="w-5 h-5" />
        </button>

        {hasGenerations && (
          <div className="flex items-center gap-1 mx-2">
            <button onClick={jumpGenStart} disabled={isAnimating} className={genBtn} title="Start of generation">
              <SkipBack className="w-3.5 h-3.5 mr-1" /> Start
            </button>
            <button onClick={jumpGenEnd} disabled={isAnimating} className={genBtn} title="End of generation">
              End <SkipForward className="w-3.5 h-3.5 ml-1" />
            </button>
          </div>
        )}

        <button onClick={onNext} disabled={currentStep >= totalMoves - 1 || isAnimating} className={navBtn} title="Next move">
          <ChevronRight className="w-5 h-5" />
        </button>
        {hasGenerations && (
          <button onClick={jumpNextGen} disabled={!hasNextGen || isAnimating} className={navBtn} title="Next generation">
            <ChevronsRight className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}
