import { memo, useState, useRef, useEffect } from 'react';
import { Info, MapPin } from 'lucide-react';
import { getCardImage, getCardPlaceholderImage } from '@/lib/card';
import type { GameLogMove } from '@/types/gamelog';
import { getCubeImage, getIcon, tileIcons } from './replayShared';
import cityTileImage from '/assets/tiles/city tile.png';
import greeneryTileImage from '/assets/tiles/greenery tile.png';
import oceanTileImage from '/assets/tiles/ocean tile.png';

const specialTileImages = import.meta.glob('../../../assets/tiles/*.png', { eager: true }) as Record<string, { default: string }>;

const TILE_ALIASES: Record<string, string> = {
  'mining area': 'mining',
  'mining rights': 'mining',
};

function getTileImage(tileType: string): string | undefined {
  const norm = tileType.toLowerCase();
  if (norm === 'city') return cityTileImage;
  if (norm === 'greenery' || norm === 'forest') return greeneryTileImage;
  if (norm === 'ocean') return oceanTileImage;
  const slug = TILE_ALIASES[norm] ?? norm;
  const entry = Object.entries(specialTileImages).find(([key]) => {
    const base = key.replace(/^.*[\\/]/, '').toLowerCase().replace('.png', '');
    return base === slug;
  });
  return entry?.[1].default;
}

interface MoveLogProps {
  moves: GameLogMove[];
  currentStep: number;
  generationBoundaries: Map<number, { start: number; end: number }>;
  playerColors: Record<string, string>;
  onJump: (step: number) => void;
}

const MoveEntry = memo(function MoveEntry({ move, moveIndex, isCurrent, isExpanded, cubeImg, playerColor, onClick, onHover, onLeave }: {
  move: GameLogMove; moveIndex: number; isCurrent: boolean; isExpanded: boolean;
  cubeImg: string | undefined; playerColor: string; onClick: () => void; onHover: () => void; onLeave: () => void;
}) {
  return (
    <div
      className={`px-3 py-2 rounded-lg cursor-pointer hover:bg-white/5 ${isCurrent ? 'bg-white/5 border border-white/10' : 'opacity-50 hover:opacity-80'}`}
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-xs font-mono text-slate-500 flex-shrink-0">#{moveIndex + 1}</span>
        {move.action_type === 'game_state_change' ? (<>
          <span className="text-xs text-slate-500 italic">Game State Change</span>
          <span className="relative group flex-shrink-0">
            <Info className="w-3 h-3 text-slate-600 cursor-help" />
            <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover:block z-50 bg-slate-800 text-white text-[10px] rounded-lg px-2.5 py-1.5 shadow-lg whitespace-nowrap border border-slate-700 leading-relaxed">
              BGA stores internal game state changes in logs.<br />These moves have no effect and are shown for completeness.
            </span>
          </span>
        </>) : (<>
          {cubeImg ? (
            <img src={cubeImg} alt="" className="w-4 h-4 flex-shrink-0" />
          ) : (
            <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: playerColor }} />
          )}
          <span className="font-bold text-white text-xs">{move.player_name}</span>
          <span className="text-[10px] text-slate-500">{move.action_type}</span>
        </>)}
      </div>
      {move.action_type === 'place_tile' && move.tile_placed && move.tile_location ? (
        <TilePlacement move={move} />
      ) : move.action_type !== 'game_state_change' ? (
        <p className="text-[11px] text-slate-300 leading-relaxed">{move.description}</p>
      ) : null}
      {isExpanded && move.card_played && (
        <CardPreview cardName={move.card_played} cardCost={move.card_cost} />
      )}
    </div>
  );
});

function resolveTileName(move: GameLogMove): string {
  // 1. Use reason if available
  if (move.tile_placed === 'tile' && move.reason) return move.reason;
  // 2. Look up special_tiles from game_state
  if (move.tile_placed === 'tile' && move.game_state?.special_tiles) {
    const playerTiles = move.game_state.special_tiles[move.player_id];
    if (playerTiles) {
      // Find the special tile whose location matches this move's tile_location
      for (const [name, loc] of Object.entries(playerTiles)) {
        if (move.tile_location && loc.includes(move.tile_location.replace(/^Hex at /, 'Hex '))) return name;
        // Also try matching by coordinates
        const coordMatch = move.tile_location?.match(/\((\d+,\d+)\)/);
        if (coordMatch && loc.includes(coordMatch[1])) return name;
      }
      // If only one special tile for this player, use it
      const entries = Object.keys(playerTiles);
      if (entries.length === 1) return entries[0];
    }
  }
  // 3. Fall back to tile_placed
  return move.tile_placed!;
}

function TilePlacement({ move }: { move: GameLogMove }) {
  const tileName = resolveTileName(move);
  const tileImg = getTileImage(tileName);
  // Parse location name from "Pavonis Mons (2,4)" → name="Pavonis Mons", coords="2,4"
  const locMatch = move.tile_location?.match(/^(.+?)\s*\((\d+,\d+)\)$/);
  const locName = locMatch ? locMatch[1].trim() : move.tile_location;
  const locCoords = locMatch ? locMatch[2] : null;

  return (
    <div className="flex items-center gap-2.5 mt-1">
      {tileImg && (
        <img src={tileImg} alt={tileName} className="w-10 h-10 flex-shrink-0 drop-shadow" />
      )}
      <div className="min-w-0">
        <p className="text-xs font-semibold text-white">{tileName}</p>
        <p className="text-[10px] text-slate-400 flex items-center gap-1">
          <MapPin size={10} className="flex-shrink-0" />
          {locName}
          {locCoords && <span className="text-slate-500">({locCoords})</span>}
        </p>
        {move.reason && move.reason !== tileName && move.reason !== move.tile_placed && (
          <p className="text-[10px] text-slate-500 italic">{move.reason}</p>
        )}
      </div>
    </div>
  );
}

function CardPreview({ cardName, cardCost }: { cardName: string; cardCost?: number | null }) {
  const img = getCardImage(cardName) ?? getCardPlaceholderImage();
  return (
    <div className="mt-1.5">
      <p className="text-[11px] font-medium text-slate-300 mb-1">
        {cardName}
        {cardCost != null && (
          <span className="text-slate-500 ml-1">({cardCost} MC)</span>
        )}
      </p>
      <img src={img} alt={cardName} className="w-full rounded-lg shadow-lg shadow-black/30" />
    </div>
  );
}

export function MoveLog({ moves, currentStep, generationBoundaries, playerColors, onJump }: MoveLogProps) {
  const currentMove = moves[currentStep];
  const currentGen = currentMove?.game_state?.generation;
  const bounds = currentGen != null ? generationBoundaries.get(currentGen) : undefined;
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentStep]);

  const startIdx = bounds?.start ?? currentStep;
  const endIdx = Math.min(bounds?.end ?? currentStep, currentStep);

  return (
    <div className="glass-panel rounded-xl overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 22rem)' }}>
      <div ref={scrollRef} className="overflow-y-auto scrollbar-subtle py-2 space-y-1">
        {Array.from({ length: endIdx - startIdx + 1 }, (_, i) => {
          const idx = endIdx - i;
          const move = moves[idx];
          if (!move) return null;
          const isCurrent = idx === currentStep;
          const color = playerColors[move.player_id] ?? '#888';
          return (
            <div key={idx} ref={isCurrent ? activeRef : undefined}>
              <MoveEntry
                move={move} moveIndex={idx} isCurrent={isCurrent}
                isExpanded={isCurrent || hoveredIdx === idx}
                cubeImg={getCubeImage(color)}
                playerColor={color}
                onClick={() => onJump(idx)}
                onHover={() => setHoveredIdx(idx)}
                onLeave={() => setHoveredIdx(null)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
