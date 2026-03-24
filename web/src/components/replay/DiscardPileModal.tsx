import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Grid3X3, Layers, List, EyeOff } from 'lucide-react';
import { getCardImage, getCardPlaceholderImage } from '@/lib/card';

interface DiscardPileModalProps {
  cards: string[];
  onClose: () => void;
}

type ViewMode = 'grid' | 'stack' | 'synthetic' | 'hidden';

function CardGrid({ cards, cardSize }: { cards: string[]; cardSize: number }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, 1fr))` }}>
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

function CardSynthetic({ cards, cardSize }: { cards: string[]; cardSize: number }) {
  const boxWidth = Math.max(120, cardSize * 1.3);
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${boxWidth}px, 1fr))` }}>
      {cards.map((card, i) => (
        <div key={`${card}-${i}`} className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-750 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
          <div className="bg-slate-100 dark:bg-slate-700 px-2.5 py-1.5 border-b border-slate-200 dark:border-slate-600">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide leading-tight line-clamp-2">{card}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DiscardPileModal({ cards, onClose }: DiscardPileModalProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('synthetic');
  const [cardSize, setCardSize] = useState(130);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const btnClass = "p-1 rounded transition-colors";
  const activeClass = "bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-200";
  const inactiveClass = "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300";

  const viewButtons: { mode: ViewMode; icon: typeof Grid3X3; tip: string }[] = [
    { mode: 'grid', icon: Grid3X3, tip: 'Grid' },
    { mode: 'synthetic', icon: List, tip: 'List' },
    { mode: 'hidden', icon: EyeOff, tip: 'Hide' },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-6xl max-h-[90vh] overflow-hidden mx-4 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
          <div className="flex items-center gap-3">
            <img src={getCardPlaceholderImage()} alt="" className="w-8 h-11 object-cover rounded-sm" />
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Discard Pile</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{cards.length} cards</p>
            </div>
          </div>
          <div className="flex items-center gap-1 ml-3">
            <div className="flex items-center bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5 gap-0.5 mr-2">
              {viewButtons.map(({ mode, icon: Icon, tip }) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`${btnClass} ${viewMode === mode ? activeClass : inactiveClass}`}
                  title={tip}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
            {viewMode !== 'hidden' && (
              <input
                type="range"
                min={70}
                max={200}
                value={cardSize}
                onChange={e => setCardSize(Number(e.target.value))}
                className="w-20 h-1 accent-slate-400 mr-2"
                title="Card size"
              />
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4">
          {cards.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400 italic text-center py-8">No cards discarded yet.</p>
          ) : viewMode === 'hidden' ? (
            <p className="text-slate-500 dark:text-slate-400 italic text-center py-4">{cards.length} cards hidden</p>
          ) : viewMode === 'synthetic' ? (
            <CardSynthetic cards={cards} cardSize={cardSize} />
          ) : (
            <CardGrid cards={cards} cardSize={cardSize} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
