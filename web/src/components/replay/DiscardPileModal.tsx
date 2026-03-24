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
            <p className="text-[10px] text-center text-slate-500 truncate mt-0.5">{card}</p>
          </div>
        );
      })}
    </div>
  );
}

function CardStack({ cards, cardSize }: { cards: string[]; cardSize: number }) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  if (cards.length === 0) return null;

  const cardWidth = cardSize;
  const cardOffset = Math.round(cardWidth * 0.22);
  const cardHeight = Math.round(cardWidth * 1.4);
  const cardsPerCol = Math.max(4, Math.round(400 / cardOffset));
  const columns: string[][] = [];
  for (let i = 0; i < cards.length; i += cardsPerCol) {
    columns.push(cards.slice(i, i + cardsPerCol));
  }

  return (
    <div className="flex gap-4 flex-wrap">
      {columns.map((col, colIdx) => (
        <div
          key={colIdx}
          className="relative flex-shrink-0"
          style={{
            width: `${cardWidth}px`,
            height: `${cardOffset * (col.length - 1) + cardHeight}px`,
          }}
        >
          {col.map((card, i) => {
            const globalIdx = colIdx * cardsPerCol + i;
            const hoverKey = `discard-${globalIdx}`;
            const img = getCardImage(card) ?? getCardPlaceholderImage();
            const isHovered = hoveredKey === hoverKey;
            const hoveredInCol = hoveredKey?.startsWith('discard-')
              ? parseInt(hoveredKey.split('-').pop()!, 10)
              : null;
            const hoveredColIdx = hoveredInCol !== null ? Math.floor(hoveredInCol / cardsPerCol) : -1;
            const hoveredLocalIdx = hoveredInCol !== null ? hoveredInCol % cardsPerCol : -1;
            const isAfterHovered = hoveredColIdx === colIdx && i > hoveredLocalIdx;
            const top = cardOffset * i + (isAfterHovered ? cardHeight * 0.45 : 0);

            return (
              <div
                key={`${card}-${globalIdx}`}
                className="absolute left-0 transition-all duration-150 ease-out"
                style={{
                  top: `${top}px`,
                  zIndex: isHovered ? 100 : i,
                  width: `${cardWidth}px`,
                }}
                onMouseEnter={() => setHoveredKey(hoverKey)}
                onMouseLeave={() => setHoveredKey(null)}
              >
                <img
                  src={img}
                  alt={card}
                  className={`rounded shadow-sm transition-transform duration-150 ${isHovered ? 'scale-[1.15] shadow-lg' : ''}`}
                  style={{ width: `${cardWidth}px` }}
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function CardSynthetic({ cards, cardSize }: { cards: string[]; cardSize: number }) {
  const boxWidth = Math.max(120, cardSize * 1.3);
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${boxWidth}px, 1fr))` }}>
      {cards.map((card, i) => (
        <div key={`${card}-${i}`} className="rounded-lg overflow-hidden" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0.1) 100%)', border: '1px solid rgba(148,163,184,0.08)' }}>
          <div className="px-2.5 py-1.5">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wide leading-tight line-clamp-2">{card}</span>
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
  const activeClass = "bg-white/10 text-white";
  const inactiveClass = "text-slate-500 hover:text-slate-300";

  const viewButtons: { mode: ViewMode; icon: typeof Grid3X3; tip: string }[] = [
    { mode: 'grid', icon: Grid3X3, tip: 'Grid' },
    { mode: 'stack', icon: Layers, tip: 'Stack' },
    { mode: 'synthetic', icon: List, tip: 'List' },
    { mode: 'hidden', icon: EyeOff, tip: 'Hide' },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative glass-panel rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden mx-4 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%)' }}>
          <div className="flex items-center gap-3">
            <img src={getCardPlaceholderImage()} alt="" className="w-8 h-11 object-cover rounded-sm" />
            <div>
              <h2 className="text-lg font-bold text-white">Discard Pile</h2>
              <p className="text-xs text-slate-400">{cards.length} cards</p>
            </div>
          </div>
          <div className="flex items-center gap-1 ml-3">
            <div className="flex items-center bg-white/5 rounded-lg p-0.5 gap-0.5 mr-2">
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
                className="w-20 h-1 accent-amber-500 mr-2"
                title="Card size"
              />
            )}
            <button
              onClick={onClose}
              className="nav-btn p-1.5 rounded-lg text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4 scrollbar-hidden">
          {cards.length === 0 ? (
            <p className="text-slate-500 italic text-center py-8">No cards discarded yet.</p>
          ) : viewMode === 'hidden' ? (
            <p className="text-slate-500 italic text-center py-4">{cards.length} cards hidden</p>
          ) : viewMode === 'stack' ? (
            <CardStack cards={cards} cardSize={cardSize} />
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
