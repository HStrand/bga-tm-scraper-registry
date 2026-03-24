import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Grid3X3, Layers, List, EyeOff } from 'lucide-react';
import { getCardImage, getCardPlaceholderImage } from '@/lib/card';

const cubeIcons = import.meta.glob('../../../assets/cubes/*.png', { eager: true }) as Record<string, { default: string }>;

function getCubeImage(hexColor: string): string | undefined {
  const slug = hexColor.replace('#', '').toLowerCase();
  const entry = Object.entries(cubeIcons).find(([key]) =>
    key.replace(/^.*[\\/]/, '').toLowerCase() === `${slug}.png`
  );
  return entry?.[1].default;
}

interface PlayerTableauProps {
  playerName: string;
  corporation: string;
  color: string;
  headquarters: string[];
  played: string[];
  hand: string[];
  sold: string[];
  cardResources: Record<string, number>;
  onClose: () => void;
}

type ViewMode = 'grid' | 'stack' | 'synthetic' | 'hidden';

// --- View components ---

function CardStack({ cards, label, cardResources, cardSize }: { cards: string[]; label: string; cardResources?: Record<string, number>; cardSize: number }) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  if (cards.length === 0) return null;

  const cardWidth = cardSize;
  const cardOffset = Math.round(cardWidth * 0.22);
  const cardHeight = Math.round(cardWidth * 1.4);
  // Split cards into columns, ~10-12 cards per column depending on size
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
            const hoverKey = `${label}-${globalIdx}`;
            const img = getCardImage(card) ?? getCardPlaceholderImage();
            const isHovered = hoveredKey === hoverKey;
            const hoveredInCol = hoveredKey?.startsWith(`${label}-`)
              ? parseInt(hoveredKey.split('-').pop()!, 10)
              : null;
            const hoveredColIdx = hoveredInCol !== null ? Math.floor(hoveredInCol / cardsPerCol) : -1;
            const hoveredLocalIdx = hoveredInCol !== null ? hoveredInCol % cardsPerCol : -1;
            const isAfterHovered = hoveredColIdx === colIdx && i > hoveredLocalIdx;
            const top = cardOffset * i + (isAfterHovered ? cardHeight * 0.45 : 0);

            return (
              <div
                key={`${label}-${card}-${globalIdx}`}
                className="absolute left-0 transition-all duration-150 ease-out"
                style={{
                  top: `${top}px`,
                  zIndex: isHovered ? 100 : i,
                  width: `${cardWidth}px`,
                }}
                onMouseEnter={() => setHoveredKey(hoverKey)}
                onMouseLeave={() => setHoveredKey(null)}
              >
                <div className="relative inline-block">
                  <img
                    src={img}
                    alt={card}
                    className={`rounded shadow-sm transition-transform duration-150 ${isHovered ? 'scale-[1.15] shadow-lg' : ''}`}
                    style={{ width: `${cardWidth}px` }}
                  />
                  {cardResources?.[card] != null && cardResources[card] > 0 && (
                    <span className="absolute top-1 right-1 bg-amber-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow">
                      {cardResources[card]}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function CardGrid({ cards, cardResources, cardSize }: { cards: string[]; cardResources?: Record<string, number>; cardSize: number }) {
  // cardSize directly controls the min width of each grid item
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, 1fr))` }}
    >
      {cards.map((card, i) => {
        const img = getCardImage(card) ?? getCardPlaceholderImage();
        const res = cardResources?.[card];
        return (
          <div key={`${card}-${i}`} className="group relative">
            <div className="relative">
              <img
                src={img}
                alt={card}
                className="w-full rounded shadow-sm group-hover:scale-110 group-hover:shadow-lg group-hover:z-10 relative transition-transform duration-150"
              />
              {res != null && res > 0 && (
                <span className="absolute top-1 right-1 bg-amber-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow">
                  {res}
                </span>
              )}
            </div>
            <p className="text-[10px] text-center text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {card}{res != null && res > 0 ? ` (${res})` : ''}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function CardSynthetic({ cards, cardResources, cardSize }: { cards: string[]; cardResources?: Record<string, number>; cardSize: number }) {
  // Scale controls card box width
  const boxWidth = Math.max(120, cardSize * 1.3);

  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${boxWidth}px, 1fr))` }}
    >
      {cards.map((card, i) => {
        const res = cardResources?.[card];
        return (
          <div
            key={`${card}-${i}`}
            className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-750 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="bg-slate-100 dark:bg-slate-700 px-2.5 py-1.5 border-b border-slate-200 dark:border-slate-600">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide leading-tight line-clamp-2">
                {card}
              </span>
            </div>
            {res != null && res > 0 && (
              <div className="px-2.5 py-1.5 flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center bg-amber-500 text-white text-[11px] font-bold rounded-full w-5 h-5 shadow-sm">
                  {res}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">resources</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Section component with independent controls ---

function CardSection({ cards, title, color, cardResources, defaultViewMode = 'grid' }: {
  cards: string[];
  title: string;
  color: string;
  cardResources?: Record<string, number>;
  defaultViewMode?: ViewMode;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);
  const [cardSize, setCardSize] = useState(130);

  if (cards.length === 0) return null;

  const btnClass = "p-1 rounded transition-colors";
  const activeClass = "bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-200";
  const inactiveClass = "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300";

  const viewButtons: { mode: ViewMode; icon: typeof Grid3X3; tip: string }[] = [
    { mode: 'grid', icon: Grid3X3, tip: 'Grid' },
    { mode: 'stack', icon: Layers, tip: 'Stack' },
    { mode: 'synthetic', icon: List, tip: 'List' },
    { mode: 'hidden', icon: EyeOff, tip: 'Hide' },
  ];

  return (
    <div>
      {/* Section header with controls */}
      <div className="flex items-center gap-2 mb-2">
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex-shrink-0">
          {title} <span style={{ color }} className="font-bold">{cards.length}</span>
        </h3>

        {/* View mode buttons */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-700/50 rounded-md p-0.5 gap-0.5 flex-shrink-0">
          {viewButtons.map(({ mode, icon: Icon, tip }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`${btnClass} ${viewMode === mode ? activeClass : inactiveClass}`}
              title={tip}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>

        {/* Size slider (hidden when view is hidden) */}
        {viewMode !== 'hidden' && (
          <input
            type="range"
            min={70}
            max={200}
            value={cardSize}
            onChange={e => setCardSize(Number(e.target.value))}
            className="w-20 h-1 accent-slate-400 flex-shrink-0"
            title="Card size"
          />
        )}

        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </div>

      {/* Card content */}
      {viewMode === 'hidden' ? null : viewMode === 'stack' ? (
        <CardStack cards={cards} label={title} cardResources={cardResources} cardSize={cardSize} />
      ) : viewMode === 'synthetic' ? (
        <CardSynthetic cards={cards} cardResources={cardResources} cardSize={cardSize} />
      ) : (
        <CardGrid cards={cards} cardResources={cardResources} cardSize={cardSize} />
      )}
    </div>
  );
}

// --- Main component ---

export function PlayerTableau({ playerName, corporation, color, headquarters, played, hand, sold, cardResources, onClose }: PlayerTableauProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
            {getCubeImage(color) ? (
              <img src={getCubeImage(color)!} alt="" className="w-6 h-6 flex-shrink-0" />
            ) : (
              <span className="inline-block w-4 h-4 rounded-full flex-shrink-0 ring-2 ring-white dark:ring-slate-700" style={{ backgroundColor: color }} />
            )}
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate">{playerName}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {corporation} &middot; {played.length} played &middot; {hand.length} in hand
                {sold.length > 0 && <> &middot; {sold.length} sold</>}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 ml-3"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4 space-y-5">
          <CardSection cards={headquarters} title="Headquarters" color={color} defaultViewMode="grid" />
          <CardSection cards={hand} title="Hand" color={color} defaultViewMode="grid" />
          <CardSection cards={played} title="Played" color={color} cardResources={cardResources} defaultViewMode="stack" />
          <CardSection cards={sold} title="Sold" color={color} defaultViewMode="hidden" />

          {headquarters.length === 0 && played.length === 0 && hand.length === 0 && sold.length === 0 && (
            <p className="text-slate-500 dark:text-slate-400 italic text-center py-8">No cards yet.</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
