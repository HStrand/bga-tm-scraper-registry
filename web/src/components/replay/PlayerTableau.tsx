import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Grid3X3, Layers } from 'lucide-react';
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

type ViewMode = 'stack' | 'grid';

function CardStack({ cards, label }: { cards: string[]; label: string }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (cards.length === 0) return null;

  // Show ~40px per card in the stack, full card for the last one
  const CARD_OFFSET = 44;

  return (
    <div>
      <div
        className="relative"
        style={{ height: `${CARD_OFFSET * (cards.length - 1) + 200}px` }}
      >
        {cards.map((card, i) => {
          const img = getCardImage(card) ?? getCardPlaceholderImage();
          const isHovered = hoveredIdx === i;
          const isAfterHovered = hoveredIdx !== null && i > hoveredIdx;
          const top = CARD_OFFSET * i + (isAfterHovered ? 80 : 0);

          return (
            <div
              key={`${label}-${card}-${i}`}
              className="absolute left-0 right-0 transition-all duration-150 ease-out"
              style={{
                top: `${top}px`,
                zIndex: isHovered ? 100 : i,
              }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <img
                src={img}
                alt={card}
                className={`w-36 rounded shadow-sm transition-transform duration-150 ${isHovered ? 'scale-125 shadow-lg' : ''}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CardGrid({ cards }: { cards: string[] }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-3">
      {cards.map((card, i) => {
        const img = getCardImage(card) ?? getCardPlaceholderImage();
        return (
          <div key={`${card}-${i}`} className="group relative">
            <img
              src={img}
              alt={card}
              className="w-full rounded shadow-sm group-hover:scale-110 group-hover:shadow-lg group-hover:z-10 relative transition-transform duration-150"
            />
            <p className="text-[10px] text-center text-slate-500 dark:text-slate-400 truncate mt-0.5">{card}</p>
          </div>
        );
      })}
    </div>
  );
}

function CardSection({ cards, title, color, viewMode }: { cards: string[]; title: string; color: string; viewMode: ViewMode }) {
  if (cards.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {title} <span style={{ color }} className="font-bold">{cards.length}</span>
        </h3>
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </div>
      {viewMode === 'stack' ? (
        <CardStack cards={cards} label={title} />
      ) : (
        <CardGrid cards={cards} />
      )}
    </div>
  );
}

export function PlayerTableau({ playerName, corporation, color, played, hand, sold, onClose }: PlayerTableauProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('stack');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleBtn = "p-1.5 rounded-md transition-colors";
  const activeBtn = "bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-200";
  const inactiveBtn = "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300";

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-6xl max-h-[90vh] overflow-hidden mx-4 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700" style={{ backgroundColor: `${color}10` }}>
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-block w-4 h-4 rounded-full flex-shrink-0 ring-2 ring-white dark:ring-slate-700" style={{ backgroundColor: color }} />
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate">{playerName}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {corporation} &middot; {played.length} played &middot; {hand.length} in hand
                {sold.length > 0 && <> &middot; {sold.length} sold</>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 ml-3">
            <div className="flex items-center bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5 mr-2">
              <button
                onClick={() => setViewMode('stack')}
                className={`${toggleBtn} ${viewMode === 'stack' ? activeBtn : inactiveBtn}`}
                title="Stack view"
              >
                <Layers className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`${toggleBtn} ${viewMode === 'grid' ? activeBtn : inactiveBtn}`}
                title="Grid view"
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4 space-y-5">
          <CardSection cards={hand} title="Hand" color={color} viewMode={viewMode} />
          <CardSection cards={played} title="Played" color={color} viewMode={viewMode} />
          <CardSection cards={sold} title="Sold" color={color} viewMode={viewMode} />

          {played.length === 0 && hand.length === 0 && sold.length === 0 && (
            <p className="text-slate-500 dark:text-slate-400 italic text-center py-8">No cards yet.</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
