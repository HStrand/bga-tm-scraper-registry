import { memo, useState, useEffect, useRef, useCallback } from 'react';
import { X, Pin, PinOff, Grid3X3, Layers, List, EyeOff } from 'lucide-react';
import { getCardImage, getCardPlaceholderImage } from '@/lib/card';
import type { PlayerVictoryPoints } from '@/types/gamelog';
import { getCubeImage, startingPlayerImg, PlayerTrackers } from './replayShared';
import { getCardCategory } from '@/lib/cardMetadata';

interface PlayerCardProps {
  playerId: string;
  playerName: string;
  corporation: string;
  color: string;
  elo: number | null;
  vp: PlayerVictoryPoints | undefined;
  trackers: Record<string, number> | undefined;
  tileCounts: { cities: number; greeneries: number; total: number } | undefined;
  isStartingPlayer: boolean;
  isExpanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  headquarters: string[];
  played: string[];
  hand: string[];
  sold: string[];
  cardResources: Record<string, number>;
}

type ViewMode = 'grid' | 'stack' | 'synthetic' | 'hidden';

// --- Card view components (dark-themed) ---

const CardGrid = memo(function CardGrid({ cards, cardResources, cardSize }: { cards: string[]; cardResources?: Record<string, number>; cardSize: number }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, 1fr))` }}>
      {cards.map((card, i) => {
        const img = getCardImage(card) ?? getCardPlaceholderImage();
        const res = cardResources?.[card];
        return (
          <div key={`${card}-${i}`} className="group/card relative">
            <div className="relative">
              <img src={img} alt={card} className="w-full rounded shadow-sm group-hover/card:scale-110 group-hover/card:shadow-lg group-hover/card:z-10 relative transition-transform duration-150" />
              {res != null && res > 0 && (
                <span className="absolute top-0.5 right-0.5 bg-amber-500 text-white text-[8px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow">{res}</span>
              )}
            </div>
            <p className="text-[9px] text-center text-slate-500 truncate mt-0.5">{card}</p>
          </div>
        );
      })}
    </div>
  );
});

const CardStack = memo(function CardStack({ cards, cardResources, cardSize }: { cards: string[]; cardResources?: Record<string, number>; cardSize: number }) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  if (cards.length === 0) return null;

  const cardWidth = cardSize;
  const cardOffset = Math.round(cardWidth * 0.35);
  const cardHeight = Math.round(cardWidth * 1.4);
  const cardsPerCol = Math.max(3, Math.round(350 / cardOffset));
  const columns: string[][] = [];
  for (let i = 0; i < cards.length; i += cardsPerCol) columns.push(cards.slice(i, i + cardsPerCol));

  return (
    <div className="flex gap-3 flex-wrap">
      {columns.map((col, colIdx) => (
        <div key={colIdx} className="relative flex-shrink-0" style={{ width: `${cardWidth}px`, height: `${cardOffset * (col.length - 1) + cardHeight}px` }}>
          {col.map((card, i) => {
            const globalIdx = colIdx * cardsPerCol + i;
            const hoverKey = `s-${globalIdx}`;
            const img = getCardImage(card) ?? getCardPlaceholderImage();
            const res = cardResources?.[card];
            const isHovered = hoveredKey === hoverKey;
            const hoveredInCol = hoveredKey?.startsWith('s-') ? parseInt(hoveredKey.split('-').pop()!, 10) : null;
            const hoveredColIdx = hoveredInCol !== null ? Math.floor(hoveredInCol / cardsPerCol) : -1;
            const hoveredLocalIdx = hoveredInCol !== null ? hoveredInCol % cardsPerCol : -1;
            const isAfterHovered = hoveredColIdx === colIdx && i > hoveredLocalIdx;
            const top = cardOffset * i + (isAfterHovered ? cardHeight * 0.45 : 0);
            return (
              <div key={`${card}-${globalIdx}`} className="absolute left-0 transition-all duration-150 ease-out" style={{ top: `${top}px`, zIndex: isHovered ? 100 : i, width: `${cardWidth}px` }} onMouseEnter={() => setHoveredKey(hoverKey)} onMouseLeave={() => setHoveredKey(null)}>
                <img src={img} alt={card} className={`rounded shadow-sm transition-transform duration-150 ${isHovered ? 'scale-[1.15] shadow-lg' : ''}`} style={{ width: `${cardWidth}px` }} />
                {res != null && res > 0 && (
                  <span className="absolute top-0.5 right-0.5 bg-amber-500 text-white text-[8px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow">{res}</span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
});

const CardSynthetic = memo(function CardSynthetic({ cards, cardResources, cardSize }: { cards: string[]; cardResources?: Record<string, number>; cardSize: number }) {
  const boxWidth = Math.max(100, cardSize * 1.2);
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${boxWidth}px, 1fr))` }}>
      {cards.map((card, i) => {
        const res = cardResources?.[card];
        return (
          <div key={`${card}-${i}`} className="rounded-lg overflow-hidden" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0.1) 100%)', border: '1px solid rgba(148,163,184,0.08)' }}>
            <div className="px-2 py-1.5">
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wide leading-tight line-clamp-2">{card}</span>
            </div>
            {res != null && res > 0 && (
              <div className="px-2 py-1 flex items-center gap-1 border-t border-white/5">
                <span className="inline-flex items-center justify-center bg-amber-500 text-white text-[9px] font-bold rounded-full w-4 h-4 shadow-sm">{res}</span>
                <span className="text-[9px] text-slate-500">res</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

const CardSection = memo(function CardSection({ cards, title, color, cardResources, defaultViewMode = 'grid', defaultCardSize = 140 }: {
  cards: string[]; title: string; color: string; cardResources?: Record<string, number>; defaultViewMode?: ViewMode; defaultCardSize?: number;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);
  const [cardSize, setCardSize] = useState(defaultCardSize);
  if (cards.length === 0) return null;

  const btnClass = "p-1 rounded transition-colors";
  const activeClass = "bg-white/10 text-white";
  const inactiveClass = "text-slate-500 hover:text-slate-300";
  const viewButtons: { mode: ViewMode; icon: typeof Grid3X3; tip: string }[] = [
    { mode: 'grid', icon: Grid3X3, tip: 'Grid' },
    { mode: 'stack', icon: Layers, tip: 'Stack' },
    { mode: 'synthetic', icon: List, tip: 'List' },
    { mode: 'hidden', icon: EyeOff, tip: 'Hide' },
  ];

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-2">
        <div className="h-px flex-1 bg-white/10" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex-shrink-0">
          {title} <span style={{ color }} className="font-bold">{cards.length}</span>
        </h3>
        <div className="flex items-center bg-white/5 rounded-lg p-0.5 gap-0.5 flex-shrink-0">
          {viewButtons.map(({ mode, icon: Icon, tip }) => (
            <button key={mode} onClick={() => setViewMode(mode)} className={`${btnClass} ${viewMode === mode ? activeClass : inactiveClass}`} title={tip}>
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
        {viewMode !== 'hidden' && (
          <input type="range" min={60} max={180} value={cardSize} onChange={e => setCardSize(Number(e.target.value))} className="w-20 h-1.5 accent-amber-500 flex-shrink-0" title="Card size" />
        )}
        <div className="h-px flex-1 bg-white/10" />
      </div>
      {viewMode === 'hidden' ? null : viewMode === 'stack' ? (
        <CardStack cards={cards} cardResources={cardResources} cardSize={cardSize} />
      ) : viewMode === 'synthetic' ? (
        <CardSynthetic cards={cards} cardResources={cardResources} cardSize={cardSize} />
      ) : (
        <CardGrid cards={cards} cardResources={cardResources} cardSize={cardSize} />
      )}
    </div>
  );
});

export const PlayerCard = memo(function PlayerCard({
  playerId, playerName, corporation, color, elo, vp, trackers, tileCounts,
  isStartingPlayer, isExpanded, onExpand, onCollapse,
  headquarters, played, hand, sold, cardResources,
}: PlayerCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const compactRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  const [customSize, setCustomSize] = useState<{ w: number; h: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  type ResizeEdge = 'right' | 'bottom' | 'left' | 'top' | 'corner-br' | 'corner-bl' | 'corner-tr' | 'corner-tl';
  const resizing = useRef<{ edge: ResizeEdge; startX: number; startY: number; startW: number; startH: number; startPosX: number; startPosY: number } | null>(null);
  const dragging = useRef<{ startX: number; startY: number; startLeft: number; startTop: number } | null>(null);

  const handleClose = () => {
    setPinned(false);
    setCustomSize(null);
    setDragPos(null);
    onCollapse();
  };

  const startDrag = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const el = overlayRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Use viewport coords since we switch to position:fixed when dragged
    dragging.current = { startX: e.clientX, startY: e.clientY, startLeft: rect.left, startTop: rect.top };

    const onMove = (ev: MouseEvent) => {
      const d = dragging.current;
      if (!d) return;
      setDragPos({
        x: d.startLeft + (ev.clientX - d.startX),
        y: d.startTop + (ev.clientY - d.startY),
      });
    };
    const onUp = () => {
      dragging.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  const startResize = useCallback((edge: ResizeEdge, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = overlayRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const parentRect = containerRef.current?.getBoundingClientRect();
    resizing.current = {
      edge, startX: e.clientX, startY: e.clientY, startW: rect.width, startH: rect.height,
      startPosX: dragPos?.x ?? rect.left - (parentRect?.left ?? 0),
      startPosY: dragPos?.y ?? rect.top - (parentRect?.top ?? 0),
    };

    const onMove = (ev: MouseEvent) => {
      const r = resizing.current;
      if (!r) return;
      const dx = ev.clientX - r.startX;
      const dy = ev.clientY - r.startY;
      const resizesRight = edge === 'right' || edge === 'corner-br' || edge === 'corner-tr';
      const resizesLeft = edge === 'left' || edge === 'corner-bl' || edge === 'corner-tl';
      const resizesBottom = edge === 'bottom' || edge === 'corner-br' || edge === 'corner-bl';
      const resizesTop = edge === 'top' || edge === 'corner-tr' || edge === 'corner-tl';

      let newW = r.startW;
      let newH = r.startH;
      let newX = dragPos?.x ?? r.startPosX;
      let newY = dragPos?.y ?? r.startPosY;

      if (resizesRight) newW = Math.max(320, r.startW + dx);
      if (resizesLeft) { newW = Math.max(320, r.startW - dx); newX = r.startPosX + (r.startW - newW); }
      if (resizesBottom) newH = Math.max(200, r.startH + dy);
      if (resizesTop) { newH = Math.max(200, r.startH - dy); newY = r.startPosY + (r.startH - newH); }

      setCustomSize({ w: newW, h: newH });
      if (resizesLeft || resizesTop) setDragPos({ x: newX, y: newY });
    };
    const onUp = () => {
      resizing.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [dragPos]);

  useEffect(() => {
    if (!isExpanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isExpanded, onCollapse]);

  // Unpin if collapsed externally (e.g. another card hovered)
  useEffect(() => {
    if (!isExpanded) setPinned(false);
  }, [isExpanded]);

  const cubeImg = getCubeImage(color);
  const d = vp?.total_details;

  const compactCard = (
    <div ref={compactRef} className="glass-panel rounded-xl p-4 cursor-pointer">
      <div className="flex items-center gap-3">
        {cubeImg ? (
          <img src={cubeImg} alt="" className="w-10 h-10 flex-shrink-0" />
        ) : (
          <span className="inline-block w-6 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white text-lg truncate">{playerName}</span>
            {elo != null && (
              <span className="text-base text-slate-400 flex-shrink-0">({elo})</span>
            )}
          </div>
          <div className="text-base text-slate-400 truncate">{corporation}</div>
        </div>
        <span className="text-2xl font-bold text-white glow-white flex-shrink-0">
          {vp?.total ?? '?'}
        </span>
      </div>
      <div className="flex items-center gap-2.5 mt-3 pt-2.5 border-t border-white/5">
        <img src={getCardPlaceholderImage()} alt="Cards" className="w-8 h-11 object-cover rounded-sm opacity-60" />
        <span className="text-xl font-semibold text-white">{hand.length}</span>
        <div className="flex-1" />
        <img src={startingPlayerImg} alt="1st" className={`w-9 h-9 flex-shrink-0 ${isStartingPlayer ? '' : 'invisible'}`} />
      </div>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{ zIndex: isExpanded ? 50 : 1 }}
      onMouseEnter={onExpand}
      onMouseLeave={() => { if (!pinned) onCollapse(); }}
    >
      {/* Compact card — in flow when not dragged, fixed when dragged */}
      {dragPos ? (
        <>
          {/* Placeholder to keep column spacing */}
          <div style={{ visibility: 'hidden' }}>{compactCard}</div>
          {/* Floating compact card at drag position — hidden while expanded */}
          {!isExpanded && (
            <div className="w-[320px]" style={{ position: 'fixed', top: dragPos.y, left: dragPos.x, zIndex: 1 }}>
              {compactCard}
            </div>
          )}
        </>
      ) : (
        compactCard
      )}

      {/* Expanded overlay — grows rightward */}
      <div
        ref={overlayRef}
        className={`glass-panel rounded-xl overflow-hidden flex flex-col
          ${isExpanded
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
          }`}
        style={{
          position: dragPos ? 'fixed' : 'absolute',
          top: dragPos ? `${dragPos.y}px` : 0,
          left: dragPos ? `${dragPos.x}px` : 0,
          width: isExpanded ? (customSize ? `${customSize.w}px` : 'calc(100vw - 14rem)') : '100%',
          maxWidth: customSize ? undefined : '900px',
          height: customSize ? `${customSize.h}px` : undefined,
          maxHeight: isExpanded ? (customSize ? undefined : '85vh') : '0px',
          transition: (resizing.current || dragging.current) ? 'opacity 200ms ease' : 'width 500ms cubic-bezier(0.4,0,0.2,1), max-height 500ms cubic-bezier(0.4,0,0.2,1), opacity 400ms ease',
        }}
      >
        {/* Header — drag handle */}
        <div
          className="flex items-center justify-between px-3 py-2.5 flex-shrink-0 cursor-grab active:cursor-grabbing select-none"
          style={{ background: `linear-gradient(180deg, ${color}18 0%, ${color}08 100%)`, borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          onMouseDown={startDrag}
        >
          <div className="flex items-center gap-3 min-w-0">
            {cubeImg ? (
              <img src={cubeImg} alt="" className="w-10 h-10 flex-shrink-0" />
            ) : (
              <span className="inline-block w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-lg">
                  {playerName}
                  {elo != null && (
                    <span className="font-normal text-base text-slate-400 ml-1.5">({elo})</span>
                  )}
                </span>
                <img src={startingPlayerImg} alt="Starting player" className={`w-8 h-8 flex-shrink-0 ${isStartingPlayer ? '' : 'invisible'}`} />
              </div>
              <div className="text-sm text-slate-400">{corporation}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-white glow-white">
              {vp?.total ?? '?'} <span className="text-sm font-medium text-slate-400" style={{ textShadow: 'none' }}>VP</span>
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); setPinned(p => !p); }}
              className={`nav-btn w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${pinned ? 'text-amber-400' : 'text-slate-400 hover:text-white'}`}
              title={pinned ? 'Unpin' : 'Pin open'}
            >
              {pinned ? <Pin className="w-4 h-4" /> : <PinOff className="w-4 h-4" />}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleClose(); }}
              className="nav-btn w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Stats — VP breakdown (left) + Trackers (right, wraps below when narrow) */}
        <div className="flex flex-wrap flex-shrink-0 border-t border-white/10">
          {/* VP breakdown (left, fixed) */}
          {d && (
            <div className="flex-shrink-0 grid grid-cols-3 gap-px" style={{ background: 'rgba(255,255,255,0.03)' }}>
              {([
                ['TR', d.tr],
                ['Awards', d.awards],
                ['Milestones', d.milestones],
                ['Cities', d.cities],
                ['Greeneries', d.greeneries],
                ['Cards', d.cards],
              ] as const).map(([label, val]) => (
                <div key={label} className="px-4 py-2 text-center" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.15) 100%)' }}>
                  <div className="text-lg font-semibold text-slate-200">{val ?? 0}</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Trackers (right, wraps below when narrow) */}
          {trackers && (
            <div className="flex-1 min-w-[280px] border-l border-white/10">
              <PlayerTrackers trackers={trackers} tileCounts={tileCounts} />
            </div>
          )}
        </div>

        {/* Cards — scrollable */}
        <div className="overflow-y-auto scrollbar-hidden flex-1 min-h-0">
          <div className="px-3 py-2.5 space-y-3 border-t border-white/10">
            <CardSection cards={headquarters} title="Headquarters" color={color} defaultViewMode="grid" defaultCardSize={180} />
            <CardSection cards={hand} title="Hand" color={color} defaultViewMode="grid" defaultCardSize={130} />
            {(() => {
              const automated: string[] = [];
              const actions: string[] = [];
              const effects: string[] = [];
              const events: string[] = [];
              for (const card of played) {
                const cat = getCardCategory(card);
                if (cat === 'automated') automated.push(card);
                else if (cat === 'action') actions.push(card);
                else if (cat === 'effect') effects.push(card);
                else if (cat === 'event') events.push(card);
                else automated.push(card); // fallback
              }
              return (
                <>
                  <CardSection cards={actions} title="Actions" color="#60a5fa" cardResources={cardResources} defaultViewMode="grid" />
                  <CardSection cards={effects} title="Effects" color="#60a5fa" cardResources={cardResources} defaultViewMode="stack" />
                  <CardSection cards={automated} title="Automated" color="#4ade80" cardResources={cardResources} defaultViewMode="synthetic" />
                  <CardSection cards={events} title="Events" color="#f87171" cardResources={cardResources} defaultViewMode="hidden" />
                </>
              );
            })()}
            <CardSection cards={sold} title="Sold" color={color} defaultViewMode="hidden" />
          </div>
        </div>

        {/* Resize handles — edges */}
        {isExpanded && (
          <>
            <div className="absolute top-0 left-2 right-2 h-2 cursor-ns-resize hover:bg-amber-500/20 transition-colors" onMouseDown={e => startResize('top', e)} />
            <div className="absolute bottom-0 left-2 right-2 h-2 cursor-ns-resize hover:bg-amber-500/20 transition-colors" onMouseDown={e => startResize('bottom', e)} />
            <div className="absolute left-0 top-2 bottom-2 w-2 cursor-ew-resize hover:bg-amber-500/20 transition-colors" onMouseDown={e => startResize('left', e)} />
            <div className="absolute right-0 top-2 bottom-2 w-2 cursor-ew-resize hover:bg-amber-500/20 transition-colors" onMouseDown={e => startResize('right', e)} />
            {/* Corners */}
            <div className="absolute top-0 left-0 w-3 h-3 cursor-nwse-resize" onMouseDown={e => startResize('corner-tl', e)} />
            <div className="absolute top-0 right-0 w-3 h-3 cursor-nesw-resize" onMouseDown={e => startResize('corner-tr', e)} />
            <div className="absolute bottom-0 left-0 w-3 h-3 cursor-nesw-resize" onMouseDown={e => startResize('corner-bl', e)} />
            <div className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize" onMouseDown={e => startResize('corner-br', e)} />
          </>
        )}
      </div>
    </div>
  );
}, (prev, next) => {
  // Custom comparator: skip re-render if card arrays haven't changed by content
  if (prev.isExpanded !== next.isExpanded) return false;
  if (prev.playerId !== next.playerId) return false;
  if (prev.vp?.total !== next.vp?.total) return false;
  if (prev.color !== next.color) return false;
  if (prev.isStartingPlayer !== next.isStartingPlayer) return false;
  if (prev.elo !== next.elo) return false;
  // Only check card arrays if expanded (they're not rendered when collapsed)
  if (next.isExpanded) {
    if (prev.hand.length !== next.hand.length || prev.hand.some((c, i) => c !== next.hand[i])) return false;
    if (prev.played.length !== next.played.length || prev.played.some((c, i) => c !== next.played[i])) return false;
    if (prev.headquarters.length !== next.headquarters.length) return false;
    if (prev.sold.length !== next.sold.length) return false;
    if (prev.trackers !== next.trackers) return false;
    if (prev.tileCounts !== next.tileCounts) return false;
  }
  return true;
});
