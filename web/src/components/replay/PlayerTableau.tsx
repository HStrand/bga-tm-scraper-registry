import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { getCardImage, getCardPlaceholderImage } from '@/lib/card';

interface PlayerTableauProps {
  playerName: string;
  corporation: string;
  color: string;
  played: string[];
  hand: string[];
  sold: string[];
  onClose: () => void;
}

function CardGrid({ cards }: { cards: string[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {cards.map((card, i) => {
        const img = getCardImage(card) ?? getCardPlaceholderImage();
        return (
          <div key={`${card}-${i}`} className="space-y-1">
            <img src={img} alt={card} className="w-full rounded-lg shadow" />
            <p className="text-xs text-center text-slate-600 dark:text-slate-400 truncate">{card}</p>
          </div>
        );
      })}
    </div>
  );
}

export function PlayerTableau({ playerName, corporation, color, played, hand, sold, onClose }: PlayerTableauProps) {
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
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {corporation} &middot; {played.length} played &middot; {hand.length} in hand
                {sold.length > 0 && <> &middot; {sold.length} sold</>}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-6">
          {hand.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
                Hand ({hand.length})
              </h3>
              <CardGrid cards={hand} />
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
              Played ({played.length})
            </h3>
            {played.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400 italic text-center py-4">No cards played yet.</p>
            ) : (
              <CardGrid cards={played} />
            )}
          </div>

          {sold.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
                Sold ({sold.length})
              </h3>
              <CardGrid cards={sold} />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
