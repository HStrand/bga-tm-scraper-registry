import { useEffect, useState, useRef } from 'react';
import { getCardImage, getCardPlaceholderImage } from '@/lib/card';
import { getCubeImage, resourceIcons, getIcon, RESOURCES } from './replayShared';

const milestoneIcons = import.meta.glob('../../../assets/milestones/*.png', { eager: true }) as Record<string, { default: string }>;
const awardIcons = import.meta.glob('../../../assets/awards/*.png', { eager: true }) as Record<string, { default: string }>;

export interface TrackerDelta {
  key: string;
  label: string;
  icon: string | undefined;
  delta: number;
  isProduction: boolean;
}

export type PopupType = 'card' | 'milestone' | 'award';

interface CardPlayPopupProps {
  type: PopupType;
  name: string;
  playerName: string;
  playerColor: string;
  deltas: TrackerDelta[];
  onDone: () => void;
}

function getPopupImage(type: PopupType, name: string): string | undefined {
  if (type === 'card') return getCardImage(name) ?? getCardPlaceholderImage();
  if (type === 'milestone') return getIcon(milestoneIcons, name.toLowerCase());
  if (type === 'award') return getIcon(awardIcons, name.toLowerCase());
  return undefined;
}

const POPUP_CONFIG: Record<PopupType, { verb: string; accent: string }> = {
  card: { verb: 'plays', accent: 'text-amber-300' },
  milestone: { verb: 'claims milestone', accent: 'text-green-400' },
  award: { verb: 'funds award', accent: 'text-amber-400' },
};

export function CardPlayPopup({ type, name, playerName, playerColor, deltas, onDone }: CardPlayPopupProps) {
  const [phase, setPhase] = useState<'enter' | 'hold' | 'exit'>('enter');
  const img = getPopupImage(type, name);
  const cubeImg = getCubeImage(playerColor);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const config = POPUP_CONFIG[type];

  useEffect(() => {
    setPhase('enter');
    const t1 = setTimeout(() => setPhase('hold'), 500);
    const t2 = setTimeout(() => setPhase('exit'), 2800);
    const t3 = setTimeout(() => onDoneRef.current(), 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [name, type]);

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

  const isCard = type === 'card';

  return (
    <div
      className={`pointer-events-auto cursor-pointer ${animClass}`}
      onClick={handleClick}
    >
      <div className="glass-panel rounded-2xl p-4 flex flex-col items-center gap-3">
        {/* Image */}
        {img && (
          <img
            src={img}
            alt={name}
            className={isCard ? 'w-64 rounded-xl' : 'w-28 h-28 object-contain'}
            style={{
              boxShadow: isCard ? `0 0 12px ${playerColor}44, 0 4px 16px rgba(0,0,0,0.5)` : undefined,
            }}
          />
        )}

        {/* Player + verb + name */}
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
            {config.verb}
          </span>
          <span className={`text-sm font-bold ${config.accent}`}>
            {name}
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
