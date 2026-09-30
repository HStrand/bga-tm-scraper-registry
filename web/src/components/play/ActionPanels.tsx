import type { ReactNode } from 'react';
import type { ActionPhaseOptions } from '@/lib/engine/types';
import { PROJECT_LABELS, type PlayActions } from './actions';

/** Shown dimmed when nobody is in the action phase, so the panel keeps its shape. */
const PROJECT_PRICES = [
  { project: 'SellPatents', cost: 0 }, { project: 'PowerPlant', cost: 11 }, { project: 'Asteroid', cost: 14 },
  { project: 'Aquifer', cost: 18 }, { project: 'Greenery', cost: 23 }, { project: 'City', cost: 25 },
] as const;

function Panel({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="play-panel p-2.5" aria-label={title}>
      <h2 className="play-heading mb-1.5">{title} {note && <span className="normal-case tracking-normal text-slate-500">{note}</span>}</h2>
      {children}
    </section>
  );
}

interface ActionPanelsProps {
  /** The acting player's options in the action phase; null when there are none to offer. */
  actions: ActionPhaseOptions | null;
  act: PlayActions | null;
  busy: boolean;
  /** Card id -> name. */
  names: Record<string, string>;
  /** Action cards the acting player has already used this generation. */
  usedActions: string[];
}

/** Standard projects and card actions: always in the same place, dimmed when unavailable. */
export function ActionPanels({ actions, act, names, usedActions, busy }: ActionPanelsProps) {
  const projects = actions?.standardProjects ?? PROJECT_PRICES.map(p => ({ ...p, available: false }));

  return (
    <>
      <Panel title="Standard projects">
        <div className="grid grid-cols-3 gap-1.5">
          {projects.map(option => (
            <button
              key={option.project}
              type="button"
              className="play-tile px-2 py-1 text-left"
              disabled={busy || !act || !option.available}
              onClick={() => act?.standardProject(option as ActionPhaseOptions['standardProjects'][number])}
            >
              <span className="block text-[13px] font-semibold text-slate-100">{PROJECT_LABELS[option.project]}</span>
              <span className="block text-xs font-bold text-amber-400">{option.cost > 0 ? `${option.cost} M€` : '+1 M€ each'}</span>
            </button>
          ))}
        </div>
      </Panel>

      {((actions?.usableCardActions.length ?? 0) > 0 || usedActions.length > 0) && (
        <Panel title="Card actions">
          <div className="space-y-1">
            {actions?.usableCardActions.map(action => (
              <button
                key={action.cardId}
                type="button"
                className="play-tile flex w-full items-center justify-between px-2 py-1 text-left text-[13px] font-semibold text-slate-100"
                disabled={busy || !act}
                onClick={() => act?.cardAction(action)}
              >
                <span className="truncate">⚡ {names[action.cardId] ?? action.cardId}</span>
                {action.mcCost > 0 && <span className="text-xs font-bold text-amber-400">{action.mcCost} M€</span>}
              </button>
            ))}
            {usedActions.map(card => (
              <div key={card} className="play-tile flex items-center justify-between px-2 py-1 text-[13px] text-slate-500">
                <span className="truncate">⚡ {card}</span><span className="text-[10px] font-bold uppercase">used</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}
