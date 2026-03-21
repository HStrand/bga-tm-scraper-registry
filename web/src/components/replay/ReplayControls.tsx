import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
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
  const [jumpTarget, setJumpTarget] = useState('');

  const currentGen = gameState?.generation ?? null;
  const sortedGens = useMemo(
    () => Array.from(generationBoundaries.keys()).sort((a, b) => a - b),
    [generationBoundaries],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(jumpTarget, 10);
    if (!isNaN(parsed)) {
      onJump(parsed - 1); // input is 1-based
      setJumpTarget('');
    }
  };

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

  const btnClass = "flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm font-medium disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300";

  return (
    <div className="mt-4 py-3 border-t border-slate-200 dark:border-slate-700 space-y-2">
      {/* Step navigation */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button onClick={onPrev} disabled={currentStep <= 0 || isAnimating} className={btnClass}>
          <ChevronLeft className="w-4 h-4" /> Prev
        </button>
        <span className="text-sm text-slate-600 dark:text-slate-400">
          Move {currentStep + 1} of {totalMoves}
          {currentGen != null && (
            <span className="ml-2">&middot; Gen {currentGen}</span>
          )}
        </span>
        <button onClick={onNext} disabled={currentStep >= totalMoves - 1 || isAnimating} className={btnClass}>
          Next <ChevronRight className="w-4 h-4" />
        </button>
        <div className="w-px h-6 bg-slate-300 dark:bg-slate-600" />
        <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
          <label className="text-sm text-slate-500 dark:text-slate-400">Go to:</label>
          <input
            type="number"
            min={1}
            max={totalMoves}
            value={jumpTarget}
            onChange={e => setJumpTarget(e.target.value)}
            placeholder="#"
            className="w-16 px-2 py-1.5 text-sm rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-center"
          />
          <button
            type="submit"
            disabled={isAnimating}
            className="px-2.5 py-1.5 text-sm rounded border border-slate-200 dark:border-slate-600 font-medium hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-30"
          >
            Go
          </button>
        </form>
      </div>

      {/* Generation navigation */}
      {hasGenerations && (
        <div className="flex items-center justify-center gap-1.5">
          <button onClick={jumpPrevGen} disabled={!hasPrevGen || isAnimating} className={btnClass} title="Previous generation">
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <select
            value={currentGen ?? ''}
            onChange={e => {
              const gen = parseInt(e.target.value, 10);
              const bounds = generationBoundaries.get(gen);
              if (bounds) onJump(bounds.start);
            }}
            className="px-2 py-1.5 text-sm rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          >
            {sortedGens.map(g => (
              <option key={g} value={g}>Gen {g}</option>
            ))}
          </select>
          <button onClick={jumpGenStart} disabled={isAnimating} className={btnClass} title="Start of current generation">
            Start
          </button>
          <button onClick={jumpGenEnd} disabled={isAnimating} className={btnClass} title="End of current generation">
            End
          </button>
          <button onClick={jumpNextGen} disabled={!hasNextGen || isAnimating} className={btnClass} title="Next generation">
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
