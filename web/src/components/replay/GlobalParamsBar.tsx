import { getCardPlaceholderImage } from '@/lib/card';
import type { GameState } from '@/types/gamelog';
import { temperatureImg, oxygenImg, oceanImg } from './replayShared';

interface GlobalParamsBarProps {
  gameState: GameState | undefined;
  onOpenDiscardPile?: () => void;
}

function ParamBadge({ icon, value, label }: { icon?: string; value: string | number | null | undefined; label?: string }) {
  if (value == null) return null;
  return (
    <span className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-base font-medium text-slate-300" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.01) 100%), rgba(15,20,35,0.7)', border: '1px solid rgba(148,163,184,0.1)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 8px rgba(0,0,0,0.3)' }}>
      {icon && <img src={icon} alt="" className="w-8 h-8 object-contain" />}
      {label && <span>{label}</span>}
      <span className="font-bold text-white glow-white text-lg">{value}</span>
    </span>
  );
}

export function GlobalParamsBar({ gameState, onOpenDiscardPile }: GlobalParamsBarProps) {
  if (!gameState) return null;
  return (
    <div className="glass-panel rounded-xl p-4 space-y-3">
      {/* Generation — large */}
      <div className="text-center">
        <span className="text-3xl font-bold text-white glow-white">Gen {gameState.generation}</span>
      </div>

      {/* Global parameters */}
      <div className="flex gap-2 justify-center">
        <ParamBadge icon={temperatureImg} value={gameState.temperature != null ? `${gameState.temperature}\u00B0C` : null} />
        <ParamBadge icon={oxygenImg} value={gameState.oxygen != null ? `${gameState.oxygen}%` : null} />
        <ParamBadge icon={oceanImg} value={gameState.oceans != null ? `${gameState.oceans}/9` : null} />
      </div>

      {/* Draw + Discard */}
      <div className="flex gap-2 justify-center">
        <ParamBadge icon={getCardPlaceholderImage()} value={gameState.draw_pile ?? 0} label="Draw:" />
        {onOpenDiscardPile ? (
          <button onClick={onOpenDiscardPile} className="hover:opacity-80 transition-opacity">
            <ParamBadge icon={getCardPlaceholderImage()} value={gameState.discard_pile ?? 0} label="Discard:" />
          </button>
        ) : (
          <ParamBadge icon={getCardPlaceholderImage()} value={gameState.discard_pile ?? 0} label="Discard:" />
        )}
      </div>
    </div>
  );
}
