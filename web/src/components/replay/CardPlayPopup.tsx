import { useEffect, useState, useRef } from 'react';
import { getCardImage, getCardPlaceholderImage } from '@/lib/card';
import { getCubeImage, resourceIcons, getIcon, RESOURCES } from './replayShared';

export interface TrackerDelta {
  key: string;
  label: string;
  icon: string | undefined;
  delta: number;
  isProduction: boolean;
}

interface CardPlayPopupProps {
  cardName: string;
  playerName: string;
  playerColor: string;
  deltas: TrackerDelta[];
  onDone: () => void;
}

export function CardPlayPopup({ cardName, playerName, playerColor, deltas, onDone }: CardPlayPopupProps) {
  const [phase, setPhase] = useState<'enter' | 'hold' | 'exit'>('enter');
  const cardImg = getCardImage(cardName) ?? getCardPlaceholderImage();
  const cubeImg = getCubeImage(playerColor);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    setPhase('enter');
    const t1 = setTimeout(() => setPhase('hold'), 500);
    const t2 = setTimeout(() => setPhase('exit'), 2800);
    const t3 = setTimeout(() => onDoneRef.current(), 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [cardName]);

  const handleClick = () => {
    if (phase !== 'exit') {
      setPhase('exit');
      setTimeout(onDone, 400);
    }
  };

  const animClass =
    phase === 'enter' ? 'card-popup-enter' :
    phase === 'exit' ? 'card-popup-exit' : 'card-popup-hold';

  const spent = deltas.filter(d => d.delta < 0 && !d.isProduction);
  const gained = deltas.filter(d => d.delta > 0 && !d.isProduction);
  const prodGained = deltas.filter(d => d.delta > 0 && d.isProduction);
  const prodLost = deltas.filter(d => d.delta < 0 && d.isProduction);

  return (
    <div
      className={`pointer-events-auto cursor-pointer ${animClass}`}
      onClick={handleClick}
    >
      <div className="glass-panel rounded-2xl p-4 flex flex-col items-center gap-3">
        {/* Card image */}
        <img
          src={cardImg}
          alt={cardName}
          className="w-64 rounded-xl"
          style={{
            boxShadow: `0 0 12px ${playerColor}44, 0 4px 16px rgba(0,0,0,0.5)`,
          }}
        />

        {/* Player tag */}
        <div className="flex items-center gap-2 whitespace-nowrap">
          {cubeImg ? (
            <img src={cubeImg} alt="" className="w-5 h-5" />
          ) : (
            <span className="inline-block w-4 h-4 rounded-full" style={{ backgroundColor: playerColor }} />
          )}
          <span className="text-sm font-bold text-white">
            {playerName}
          </span>
          <span className="text-sm text-slate-400">
            plays
          </span>
          <span className="text-sm font-bold text-amber-300">
            {cardName}
          </span>
        </div>

        {/* Resource deltas */}
        {deltas.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {spent.map(d => <DeltaBadge key={d.key} delta={d} />)}
            {prodLost.map(d => <DeltaBadge key={d.key} delta={d} />)}
            {gained.map(d => <DeltaBadge key={d.key} delta={d} />)}
            {prodGained.map(d => <DeltaBadge key={d.key} delta={d} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function DeltaBadge({ delta }: { delta: TrackerDelta }) {
  const isNeg = delta.delta < 0;
  const sign = isNeg ? '' : '+';
  const color = isNeg ? 'text-red-400' : 'text-green-400';
  const bgColor = isNeg ? 'bg-red-500/15 border-red-500/30' : 'bg-green-500/15 border-green-500/30';

  return (
    <div className={`flex items-center gap-1 rounded-lg px-2 py-1 border ${bgColor}`}>
      {delta.icon && <img src={delta.icon} alt="" className="w-4 h-4" />}
      <span className={`text-xs font-bold ${color}`}>
        {sign}{delta.delta}
      </span>
      {delta.isProduction && (
        <span className="text-[9px] text-slate-500 uppercase tracking-wider">prod</span>
      )}
    </div>
  );
}

/** Compute tracker deltas between two tracker snapshots for a player */
export function computeTrackerDeltas(
  prev: Record<string, number> | undefined,
  curr: Record<string, number> | undefined,
): TrackerDelta[] {
  if (!prev || !curr) return [];
  const deltas: TrackerDelta[] = [];

  for (const res of RESOURCES) {
    const resDelta = (curr[res.key] ?? 0) - (prev[res.key] ?? 0);
    if (resDelta !== 0) {
      deltas.push({
        key: res.key,
        label: res.label,
        icon: getIcon(resourceIcons, res.icon),
        delta: resDelta,
        isProduction: false,
      });
    }

    const prodDelta = (curr[res.prodKey] ?? 0) - (prev[res.prodKey] ?? 0);
    if (prodDelta !== 0) {
      deltas.push({
        key: res.prodKey,
        label: res.label,
        icon: getIcon(resourceIcons, res.icon),
        delta: prodDelta,
        isProduction: true,
      });
    }
  }

  return deltas;
}
