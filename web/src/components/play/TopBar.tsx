import type { ReactNode } from 'react';
import { getCardPlaceholderImage } from '@/lib/card';
import type { GameSnapshotVM } from '@/lib/replay/viewModel';
import { oceanImg, oxygenImg, temperatureImg } from '@/components/replay/replayShared';

const TEMPERATURE_STEPS = Array.from({ length: 20 }, (_, i) => -30 + i * 2);
const OXYGEN_STEPS = Array.from({ length: 15 }, (_, i) => i);
const OCEANS = 9;

/** A global parameter as a row of cells, filled up to the current value. */
function Track({ icon, label, steps, value, display, color }: {
  icon: string;
  label: string;
  steps: number[];
  value: number;
  display: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2" title={`${label}: ${display}`}>
      <img src={icon} alt="" className="h-6 w-6 object-contain" />
      <div className="flex gap-[2px]" aria-hidden="true">
        {steps.map(step => (
          <span
            key={step}
            className="h-3.5 w-2 rounded-[2px]"
            style={{ background: step <= value ? color : 'rgba(148,163,184,0.16)', boxShadow: step === value ? `0 0 8px ${color}` : undefined }}
          />
        ))}
      </div>
      <b className="w-12 text-sm font-bold text-white">{display}</b>
    </div>
  );
}

interface TopBarProps {
  snapshot: Pick<GameSnapshotVM, 'generation' | 'globals' | 'piles'>;
  children?: ReactNode;
}

/** Generation, the three global parameters and the piles, across the top of the play page. */
export function TopBar({ snapshot, children }: TopBarProps) {
  const { temperature, oxygen, oceans } = snapshot.globals ?? { temperature: null, oxygen: null, oceans: null };
  return (
    <header className="flex h-12 flex-shrink-0 items-center gap-6 border-b border-white/10 bg-black/40 px-4 backdrop-blur">
      <div className="flex items-baseline gap-1.5">
        <span className="play-heading">Gen</span>
        <b className="text-xl font-bold text-white glow-white">{snapshot.generation}</b>
      </div>
      {temperature != null && (
        <Track icon={temperatureImg} label="Temperature" steps={TEMPERATURE_STEPS} value={temperature} display={`${temperature}°C`} color="#f97316" />
      )}
      {oxygen != null && (
        <Track icon={oxygenImg} label="Oxygen" steps={OXYGEN_STEPS} value={oxygen} display={`${oxygen}%`} color="#34d399" />
      )}
      {oceans != null && (
        <div className="flex items-center gap-2" title={`Oceans: ${oceans} of ${OCEANS}`}>
          <img src={oceanImg} alt="" className="h-6 w-6 object-contain" />
          <div className="flex gap-1" aria-hidden="true">
            {Array.from({ length: OCEANS }, (_, i) => (
              <span key={i} className="h-3 w-3 rounded-full" style={{ background: i < oceans ? '#38bdf8' : 'rgba(148,163,184,0.16)' }} />
            ))}
          </div>
          <b className="text-sm font-bold text-white">{oceans}/{OCEANS}</b>
        </div>
      )}
      <div className="flex items-center gap-1.5 text-sm text-slate-300" title="Draw pile / discard pile">
        <img src={getCardPlaceholderImage()} alt="" className="h-6 w-auto rounded-[2px]" />
        <b className="text-white">{snapshot.piles.draw ?? 0}</b>
        <span className="text-slate-500">/ {snapshot.piles.discard ?? 0}</span>
      </div>
      <div className="ml-auto flex items-center gap-4 text-sm text-slate-400">{children}</div>
    </header>
  );
}
