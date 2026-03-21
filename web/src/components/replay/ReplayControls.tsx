import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { GameState } from '@/types/gamelog';

interface ReplayControlsProps {
  currentStep: number;
  totalMoves: number;
  gameState: GameState | undefined;
  isAnimating: boolean;
  onPrev: () => void;
  onNext: () => void;
  onJump: (target: number) => void;
}

export function ReplayControls({
  currentStep, totalMoves, gameState, isAnimating,
  onPrev, onNext, onJump,
}: ReplayControlsProps) {
  const [jumpTarget, setJumpTarget] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(jumpTarget, 10);
    if (!isNaN(parsed)) {
      onJump(parsed - 1); // input is 1-based
      setJumpTarget('');
    }
  };

  return (
    <div className="flex items-center justify-center gap-4 mt-4 py-3 border-t border-slate-200 dark:border-slate-700">
      <button
        onClick={onPrev}
        disabled={currentStep <= 0 || isAnimating}
        className="flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm font-medium disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
      >
        <ChevronLeft className="w-4 h-4" /> Prev
      </button>
      <span className="text-sm text-slate-600 dark:text-slate-400">
        Move {currentStep + 1} of {totalMoves}
        {gameState?.generation != null && (
          <span className="ml-2">&middot; Gen {gameState.generation}</span>
        )}
      </span>
      <button
        onClick={onNext}
        disabled={currentStep >= totalMoves - 1 || isAnimating}
        className="flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm font-medium disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
      >
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
  );
}
