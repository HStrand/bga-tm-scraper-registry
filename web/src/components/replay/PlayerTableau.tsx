import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { getCardImage, getCardPlaceholderImage } from '@/lib/card';

interface PlayerTableauProps {
  playerName: string;
  corporation: string;
  color: string;
  cards: string[];
  onClose: () => void;
}

export function PlayerTableau({ playerName, corporation, color, cards, onClose }: PlayerTableauProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-4xl max-h-[90vh] overflow-y-auto mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <span className="inline-block w-4 h-4 rounded-full" style={{ backgroundColor: color }} />
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{playerName}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">{corporation} &middot; {cards.length} card{cards.length !== 1 ? 's' : ''} played</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4">
          {cards.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400 italic text-center py-8">No cards played yet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {cards.map((card, i) => {
                const img = getCardImage(card) ?? getCardPlaceholderImage();
                return (
                  <div key={`${card}-${i}`} className="space-y-1">
                    <img
                      src={img}
                      alt={card}
                      className="w-full rounded-lg shadow"
                    />
                    <p className="text-xs text-center text-slate-600 dark:text-slate-400 truncate">{card}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
