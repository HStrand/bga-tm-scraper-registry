import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, GripHorizontal, Eye, EyeOff } from 'lucide-react';
import { getCardImage, getCardPlaceholderImage } from '@/lib/card';
import { getCubeImage } from './replayShared';

export interface StartingHandPlayerData {
  playerName: string;
  color: string;
  corporation: string;
  startingHand: {
    corporations?: string[] | null;
    preludes?: string[] | null;
    project_cards?: string[] | null;
  };
  hasKept: boolean;
  keptCorporation: string | null;
  keptPreludes: string[];
  keptProjectCards: string[];
}

interface StartingHandModalProps {
  players: Record<string, StartingHandPlayerData>;
  onClose: () => void;
  cardSize: number;
  onCardSizeChange: (size: number) => void;
  hiddenPlayers: Set<string>;
  onHiddenPlayersChange: (hidden: Set<string>) => void;
}

function CardGroup({ title, cards, keptCards, hasKept, cardSize }: {
  title: string;
  cards: string[];
  keptCards: string[];
  hasKept: boolean;
  cardSize: number;
}) {
  const keptSet = new Set(keptCards);
  return (
    <div className="px-4 py-2">
      <h4 className="text-xs uppercase tracking-wider text-slate-500 mb-2">
        {title} <span className="text-slate-600">({cards.length})</span>
      </h4>
      <div className="flex flex-wrap gap-2">
        {cards.map((card, i) => {
          const img = getCardImage(card) ?? getCardPlaceholderImage();
          const dimmed = hasKept && !keptSet.has(card);
          return (
            <div key={`${card}-${i}`} className="group relative" style={{ width: cardSize }}>
              <img
                src={img}
                alt={card}
                className={`w-full rounded shadow-sm group-hover:brightness-125 group-hover:shadow-lg relative transition-[filter,box-shadow] duration-150 ${
                  dimmed ? 'opacity-35 grayscale' : ''
                }`}
              />
              <p className={`text-[9px] text-center truncate mt-0.5 ${dimmed ? 'text-slate-600' : 'text-slate-400'}`}>
                {card}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function StartingHandModal({ players, onClose, cardSize, onCardSizeChange: setCardSize, hiddenPlayers, onHiddenPlayersChange: setHiddenPlayers }: StartingHandModalProps) {
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef<{ startX: number; startY: number; startLeft: number; startTop: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const startDrag = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input')) return;
    e.preventDefault();
    const rect = dialogRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragging.current = {
      startX: e.clientX, startY: e.clientY,
      startLeft: rect.left, startTop: rect.top,
    };
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

  const pids = Object.keys(players);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
      {/* Dialog */}
      <div
        ref={dialogRef}
        className="glass-panel rounded-2xl shadow-2xl flex flex-col max-w-5xl max-h-[85vh] w-[90vw] pointer-events-auto"
        style={dragPos ? { position: 'fixed', left: dragPos.x, top: dragPos.y, margin: 0 } : { position: 'relative' }}
      >
        {/* Header — draggable */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-white/10 cursor-grab active:cursor-grabbing select-none flex-shrink-0"
          onMouseDown={startDrag}
        >
          <div className="flex items-center gap-2">
            <GripHorizontal size={16} className="text-slate-500" />
            <h2 className="text-lg font-bold text-white">Starting Hands</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Size</span>
              <input
                type="range"
                min={70}
                max={180}
                value={cardSize}
                onChange={e => setCardSize(Number(e.target.value))}
                className="w-20 h-1.5 accent-amber-500"
              />
            </div>
            <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors" title="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body — scrollable */}
        <div className="overflow-y-auto scrollbar-subtle p-2">
          {pids.map((pid, idx) => {
            const p = players[pid];
            const cube = getCubeImage(p.color);
            const sh = p.startingHand;
            const isHidden = hiddenPlayers.has(pid);
            const toggleHidden = () => {
              const next = new Set(hiddenPlayers);
              if (next.has(pid)) next.delete(pid); else next.add(pid);
              setHiddenPlayers(next);
            };
            return (
              <div key={pid} className={idx > 0 ? 'border-t border-white/5 mt-2 pt-2' : ''}>
                {/* Player header */}
                <div className="flex items-center gap-2 px-4 py-2">
                  {cube ? (
                    <img src={cube} alt="" className="w-5 h-5" />
                  ) : (
                    <span className="inline-block w-4 h-4 rounded-full" style={{ backgroundColor: p.color }} />
                  )}
                  <span className="font-bold text-white">{p.playerName}</span>
                  {p.hasKept && (
                    <span className="text-slate-500 text-sm">chose {p.keptCorporation ?? p.corporation}</span>
                  )}
                  <button onClick={toggleHidden} className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors ml-auto" title={isHidden ? 'Show cards' : 'Hide cards'}>
                    {isHidden ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>

                {/* Card groups */}
                {isHidden ? null : (<>
                {sh.corporations && sh.corporations.length > 0 && (
                  <CardGroup
                    title="Corporations"
                    cards={sh.corporations}
                    keptCards={p.keptCorporation ? [p.keptCorporation] : []}
                    hasKept={p.hasKept}
                    cardSize={cardSize * 1.1}
                  />
                )}
                {sh.preludes && sh.preludes.length > 0 && (
                  <CardGroup
                    title="Preludes"
                    cards={sh.preludes}
                    keptCards={p.keptPreludes}
                    hasKept={p.hasKept}
                    cardSize={cardSize}
                  />
                )}
                {sh.project_cards && sh.project_cards.length > 0 && (
                  <CardGroup
                    title="Project Cards"
                    cards={sh.project_cards}
                    keptCards={p.keptProjectCards}
                    hasKept={p.hasKept}
                    cardSize={cardSize * 0.9}
                  />
                )}
                </>)}
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
