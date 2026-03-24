import { memo, useState, useRef, useEffect } from 'react';
import { getCardImage, getCardPlaceholderImage } from '@/lib/card';
import type { GameLogMove } from '@/types/gamelog';
import { getCubeImage } from './replayShared';

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
        {cubeImg ? (
          <img src={cubeImg} alt="" className="w-4 h-4 flex-shrink-0" />
        ) : (
          <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: playerColor }} />
        )}
        <span className="font-bold text-white text-xs">{move.player_name}</span>
        <span className="text-[10px] text-slate-500">{move.action_type}</span>
      </div>
      <p className="text-[11px] text-slate-300 leading-relaxed">{move.description}</p>
      {move.tile_placed && move.tile_location && (
        <p className="text-[10px] text-slate-400 mt-0.5">
          Placed {move.tile_placed} at {move.tile_location}
        </p>
      )}
      {isExpanded && move.card_played && (
        <CardPreview cardName={move.card_played} cardCost={move.card_cost} />
      )}
    </div>
  );
});

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
      <div ref={scrollRef} className="overflow-y-auto scrollbar-hidden py-2 space-y-1">
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
