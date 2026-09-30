import { getCardPlaceholderImage } from '@/lib/card';
import type { GameSnapshotVM } from '@/lib/replay/viewModel';
import { temperatureImg, oxygenImg, oceanImg } from './replayShared';

interface GlobalParamsBarProps {
  snapshot: Pick<GameSnapshotVM, 'generation' | 'globals' | 'piles'> | undefined;
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

export function GlobalParamsBar({ snapshot, onOpenDiscardPile }: GlobalParamsBarProps) {
  if (!snapshot?.globals) return null;
  const { generation, globals, piles } = snapshot;
  return (
    <div className="glass-panel rounded-xl p-4 space-y-3">
      {/* Generation — large */}
      <div className="text-center">
        <span className="text-3xl font-bold text-white glow-white">Gen {generation}</span>
      </div>

      {/* Global parameters */}
      <div className="flex gap-2 justify-center">
        <ParamBadge icon={temperatureImg} value={globals.temperature != null ? `${globals.temperature}\u00B0C` : null} />
        <ParamBadge icon={oxygenImg} value={globals.oxygen != null ? `${globals.oxygen}%` : null} />
        <ParamBadge icon={oceanImg} value={globals.oceans != null ? `${globals.oceans}/9` : null} />
      </div>

      {/* Draw + Discard */}
      <div className="flex gap-2 justify-center">
        <ParamBadge icon={getCardPlaceholderImage()} value={piles.draw ?? 0} label="Draw:" />
        {onOpenDiscardPile ? (
          <button onClick={onOpenDiscardPile} className="hover:opacity-80 transition-opacity">
            <ParamBadge icon={getCardPlaceholderImage()} value={piles.discard ?? 0} label="Discard:" />
          </button>
        ) : (
          <ParamBadge icon={getCardPlaceholderImage()} value={piles.discard ?? 0} label="Discard:" />
        )}
      </div>
    </div>
  );
}
