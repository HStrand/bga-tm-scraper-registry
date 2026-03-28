import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Trophy, Award, Flag, Trees, Building2, Layers } from 'lucide-react';
import type { PlayerVictoryPoints } from '@/types/gamelog';
import { getCubeImage, resourceIcons, getIcon } from './replayShared';

import trImg from '/assets/tr.png';

const mcImg = getIcon(resourceIcons, 'mc') ?? '';

export interface PlayerSummary {
  playerId: string;
  playerName: string;
  color: string;
  corporation: string;
  vp: PlayerVictoryPoints | undefined;
  finalVp: number | null;
  mcRemaining?: number | null;
}

interface EndGameSummaryProps {
  players: PlayerSummary[];
  winner: string;
  onClose: () => void;
}

const VP_CATEGORIES: { key: keyof NonNullable<PlayerVictoryPoints['total_details']>; label: string; icon: typeof Trophy }[] = [
  { key: 'tr', label: 'TR', icon: Trophy },
  { key: 'milestones', label: 'Miles.', icon: Flag },
  { key: 'awards', label: 'Awards', icon: Award },
  { key: 'greeneries', label: 'Green.', icon: Trees },
  { key: 'cities', label: 'Cities', icon: Building2 },
  { key: 'cards', label: 'Cards', icon: Layers },
];

export function EndGameSummary({ players, winner, onClose }: EndGameSummaryProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Sort players by total VP descending
  const sorted = [...players].sort((a, b) => {
    const aVp = a.vp?.total ?? a.finalVp ?? 0;
    const bVp = b.vp?.total ?? b.finalVp ?? 0;
    return bVp - aVp;
  });

  // Detect VP tie for tiebreaker display
  const topVp = sorted[0]?.vp?.total ?? sorted[0]?.finalVp ?? 0;
  const hasTie = sorted.filter(p => (p.vp?.total ?? p.finalVp ?? 0) === topVp).length > 1;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="glass-panel rounded-2xl p-5 w-[740px] max-w-[90vw] shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="text-center flex-1">
            <h2 className="text-2xl font-bold text-amber-400 glow-amber">Game Over</h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Winner: <span className="font-bold text-white">{winner}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors" title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Scoreboard */}
        <div className="space-y-0">
          {/* Header row */}
          <div className="flex items-center px-2 py-1.5 text-xs uppercase tracking-wider text-slate-500">
            <div className="w-7 text-center">#</div>
            <div className="flex-1">Player</div>
            {VP_CATEGORIES.map(cat => {
              const Icon = cat.icon;
              return (
                <div key={cat.key} className="w-16 text-center flex flex-col items-center gap-0.5">
                  <span>{cat.label}</span>
                  {cat.key === 'tr' ? (
                    <img src={trImg} alt="TR" className="w-5 h-5" />
                  ) : (
                    <Icon size={14} />
                  )}
                </div>
              );
            })}
            <div className="w-16 text-center font-bold">Total</div>
          </div>

          {/* Player rows */}
          {sorted.map((p, idx) => {
            const cube = getCubeImage(p.color);
            const total = p.vp?.total ?? p.finalVp ?? 0;
            const isWinner = p.playerName === winner || (idx === 0 && !winner);
            const details = p.vp?.total_details;
            const showTiebreaker = hasTie && total === topVp && p.mcRemaining != null;

            return (
              <div
                key={p.playerId}
                className={`flex items-center px-2 py-2 rounded-lg ${
                  isWinner
                    ? 'bg-amber-500/10 border border-amber-500/20'
                    : 'border border-transparent'
                }`}
              >
                <div className="w-7 text-center text-base font-bold text-slate-500">
                  {idx + 1}
                </div>
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  {cube ? (
                    <img src={cube} alt="" className="w-5 h-5 flex-shrink-0" />
                  ) : (
                    <span className="inline-block w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                  )}
                  <div className="min-w-0">
                    <span className={`text-base font-bold truncate block ${isWinner ? 'text-amber-300' : 'text-white'}`}>
                      {p.playerName}
                    </span>
                    <span className="text-xs text-slate-500 truncate block">{p.corporation}</span>
                  </div>
                </div>
                {VP_CATEGORIES.map(cat => {
                  const val = details?.[cat.key];
                  return (
                    <div
                      key={cat.key}
                      className={`w-16 text-center text-base ${
                        val != null && val > 0 ? 'text-slate-200 font-medium' : 'text-slate-600'
                      }`}
                    >
                      {val ?? '–'}
                    </div>
                  );
                })}
                <div className={`w-16 text-center ${isWinner ? 'text-amber-400 glow-amber' : 'text-white glow-white'}`}>
                  <span className="text-xl font-bold">{total}</span>
                  {showTiebreaker && (
                    <div className="flex items-center justify-center gap-1 mt-0.5">
                      <span className="text-xs text-slate-400 font-medium">{p.mcRemaining}</span>
                      {mcImg && <img src={mcImg} alt="M€" className="w-4 h-4" />}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
