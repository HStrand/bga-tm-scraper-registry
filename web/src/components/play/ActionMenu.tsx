import { useState } from 'react';
import { actionPaymentRules, defaultPayment, hasPaymentChoice } from '@/lib/engine/payment';
import type { HexPrompt } from '@/lib/engine/prompts';
import type {
  ActionPhaseOptions, EnginePlayer, MoveBody, StandardProject, StandardProjectOption, UsableCardAction,
} from '@/lib/engine/types';
import { CardPicker, PlayButton, Section } from './controls';
import { HeatSplitForm, PaymentForm } from './PaymentForm';
import { PlayCardChoice } from './PromptView';

const PROJECT_LABELS: Record<StandardProject, string> = {
  SellPatents: 'Sell patents',
  PowerPlant: 'Power plant',
  Asteroid: 'Asteroid',
  Aquifer: 'Aquifer',
  Greenery: 'Greenery',
  City: 'City',
};

/** Claiming a milestone costs the same on every map; the engine does not send it. */
const MILESTONE_COST = 8;

interface ActionMenuProps {
  actions: ActionPhaseOptions;
  player: EnginePlayer;
  names: Record<string, string>;
  /** Whether the player may pay costs in M€ with heat (Helion) and so is asked how much. */
  canPayWithHeat: boolean;
  busy: boolean;
  onMove: (move: MoveBody) => void;
  /** Ask for a hex on the board; the move is sent when one is clicked. */
  onChooseHex: (prompt: HexPrompt) => void;
}

/** Everything a player may do with an action: the action phase's menu. */
export function ActionMenu({ actions, player, names, canPayWithHeat, busy, onMove, onChooseHex }: ActionMenuProps) {
  const [selling, setSelling] = useState<ReadonlySet<string> | null>(null);
  const [payingFor, setPayingFor] = useState<UsableCardAction | null>(null);
  const [splitting, setSplitting] = useState<{ title: string; cost: number; proceed: (heat?: number) => void } | null>(null);

  /** Carry on with something that costs M€ and has no other payment, asking Helion for the heat split first. */
  const payFixedCost = (title: string, cost: number, proceed: (heat?: number) => void) => {
    if (canPayWithHeat && cost > 0 && player.resources.heat > 0) setSplitting({ title, cost, proceed });
    else proceed();
  };

  if (splitting) {
    return (
      <HeatSplitForm
        title={splitting.title}
        cost={splitting.cost}
        player={player}
        busy={busy}
        onConfirm={heat => {
          setSplitting(null);
          splitting.proceed(heat);
        }}
        onCancel={() => setSplitting(null)}
      />
    );
  }

  if (selling) {
    const toggle = (cardId: string) => setSelling(current => {
      const next = new Set(current);
      if (!next.delete(cardId)) next.add(cardId);
      return next;
    });
    return (
      <div className="space-y-2">
        <p className="text-base font-semibold text-white">Sell patents for 1 M€ each</p>
        <CardPicker cardIds={player.hand} names={names} selected={selling} disabled={busy} onPick={toggle} />
        <div className="flex gap-2">
          <PlayButton
            variant="primary"
            disabled={busy || selling.size === 0}
            onClick={() => onMove({ type: 'SellPatents', cardIds: player.hand.filter(id => selling.has(id)) })}
          >
            Sell {selling.size}
          </PlayButton>
          <PlayButton disabled={busy} onClick={() => setSelling(null)}>Cancel</PlayButton>
        </div>
      </div>
    );
  }

  if (payingFor) {
    return (
      <PaymentForm
        title={`Use ${names[payingFor.cardId] ?? payingFor.cardId}`}
        rules={actionPaymentRules(payingFor)}
        player={player}
        names={names}
        busy={busy}
        onConfirm={payment => onMove({ type: 'UseCardAction', cardId: payingFor.cardId, payment })}
        onCancel={() => setPayingFor(null)}
      />
    );
  }

  const useProject = (option: StandardProjectOption) => {
    const locations = option.validLocations ?? [];
    switch (option.project) {
      case 'SellPatents':
        return setSelling(new Set());
      case 'PowerPlant':
      case 'Asteroid': {
        const type = option.project;
        return payFixedCost(PROJECT_LABELS[type], option.cost, heat => onMove({ type, heat }));
      }
      case 'Aquifer':
      case 'Greenery':
      case 'City': {
        const type = option.project;
        // The hex can add to the cost, so any heat split is asked for once it is chosen.
        return onChooseHex({
          kind: 'hex',
          title: `${PROJECT_LABELS[type]}: choose a hex`,
          locations,
          move: location => ({ type, location }),
          fixedCost: option.cost,
        });
      }
    }
  };

  const useCardAction = (action: UsableCardAction) => {
    const rules = actionPaymentRules(action);
    // Steel or titanium can stand in for MC on a few actions; the engine only needs a payment for those.
    if (!action.allowSteel && !action.allowTitanium) {
      payFixedCost(`Use ${names[action.cardId] ?? action.cardId}`, action.mcCost,
        heat => onMove({ type: 'UseCardAction', cardId: action.cardId, heat }));
    }
    else if (hasPaymentChoice(rules, player)) setPayingFor(action);
    else onMove({ type: 'UseCardAction', cardId: action.cardId, payment: defaultPayment(rules, player) });
  };

  return (
    <div className="space-y-4">
      <Section title="Play a card">
        <PlayCardChoice cards={actions.playableCards} player={player} names={names} busy={busy} onMove={onMove} />
      </Section>

      <Section title="Standard projects">
        <div className="flex flex-wrap gap-2">
          {actions.standardProjects.map(option => (
            <PlayButton
              key={option.project}
              disabled={busy || !option.available || (option.project === 'SellPatents' && player.hand.length === 0)}
              onClick={() => useProject(option)}
            >
              {PROJECT_LABELS[option.project]}{option.cost > 0 ? ` (${option.cost})` : ''}
            </PlayButton>
          ))}
        </div>
      </Section>

      {actions.usableCardActions.length > 0 && (
        <Section title="Card actions">
          <div className="flex flex-wrap gap-2">
            {actions.usableCardActions.map(action => (
              <PlayButton key={action.cardId} disabled={busy} onClick={() => useCardAction(action)}>
                {names[action.cardId] ?? action.cardId}
              </PlayButton>
            ))}
          </div>
        </Section>
      )}

      {(actions.claimableMilestones.length > 0 || actions.fundableAwards.length > 0) && (
        <Section title="Milestones and awards">
          <div className="flex flex-wrap gap-2">
            {actions.claimableMilestones.map(m => (
              <PlayButton
                key={m.name}
                disabled={busy}
                onClick={() => payFixedCost(`Claim ${m.name}`, MILESTONE_COST, heat => onMove({ type: 'ClaimMilestone', milestoneName: m.name, heat }))}
              >
                Claim {m.name}
              </PlayButton>
            ))}
            {actions.fundableAwards.map(a => (
              <PlayButton
                key={a.name}
                disabled={busy}
                onClick={() => payFixedCost(`Fund ${a.name}`, a.cost, heat => onMove({ type: 'FundAward', awardName: a.name, heat }))}
              >
                Fund {a.name} ({a.cost})
              </PlayButton>
            ))}
          </div>
        </Section>
      )}

      <Section title="Convert">
        <div className="flex flex-wrap gap-2">
          <PlayButton disabled={busy || !actions.canConvertHeat} onClick={() => onMove({ type: 'ConvertHeat' })}>
            8 heat → temperature
          </PlayButton>
          <PlayButton
            disabled={busy || !actions.canConvertPlants}
            onClick={() => onChooseHex({
              kind: 'hex',
              title: 'Convert plants: choose a hex for the greenery',
              locations: actions.validGreeneryLocations,
              move: location => ({ type: 'ConvertPlants', location }),
            })}
          >
            {actions.plantConversionCost} plants → greenery
          </PlayButton>
        </div>
      </Section>

      <div className="flex flex-wrap gap-2 pt-1 border-t border-white/10">
        {actions.canPerformFirstAction && (
          <PlayButton variant="primary" disabled={busy} onClick={() => onMove({ type: 'PerformFirstAction' })}>
            Corporation first action
          </PlayButton>
        )}
        {actions.canEndTurn && (
          <PlayButton variant="primary" disabled={busy} onClick={() => onMove({ type: 'EndTurn' })}>End turn</PlayButton>
        )}
        {actions.canPass && (
          <PlayButton variant="primary" disabled={busy} onClick={() => onMove({ type: 'Pass' })}>Pass for this generation</PlayButton>
        )}
      </div>
    </div>
  );
}
