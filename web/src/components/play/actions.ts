import {
  actionPaymentRules, cardPaymentRules, defaultPayment, hasPaymentChoice, type PaymentRules,
} from '@/lib/engine/payment';
import type { HexPrompt } from '@/lib/engine/prompts';
import type {
  ActionPhaseOptions, EnginePlayer, MoveBody, Payment, PlayableCard, StandardProject, StandardProjectOption,
  UsableCardAction,
} from '@/lib/engine/types';

/** Something the player has started that needs one more answer before a move can be sent. */
export type Flow =
  /** A hand card held up to read, and to play if it can be. */
  | { kind: 'card'; cardId: string }
  /** How to pay for a card or an action that takes steel, titanium, heat or card resources. */
  | { kind: 'pay'; title: string; rules: PaymentRules; send: (payment: Payment) => MoveBody }
  /** How much heat Helion spends on a cost in M€. */
  | { kind: 'heat'; title: string; cost: number; send: (heat: number) => MoveBody }
  /** Which hex on the board. */
  | { kind: 'hex'; prompt: HexPrompt }
  /** Which patents to sell. */
  | { kind: 'sell' };

export const PROJECT_LABELS: Record<StandardProject, string> = {
  SellPatents: 'Sell patents',
  PowerPlant: 'Power plant',
  Asteroid: 'Asteroid',
  Aquifer: 'Aquifer',
  Greenery: 'Greenery',
  City: 'City',
};

/** Claiming a milestone costs the same on every map; the engine does not send it. */
export const MILESTONE_COST = 8;

interface ActionContext {
  player: EnginePlayer;
  names: Record<string, string>;
  /** Whether the player may pay costs in M€ with heat (Helion) and so is asked how much. */
  canPayWithHeat: boolean;
  submit: (move: MoveBody) => void;
  setFlow: (flow: Flow | null) => void;
}

/**
 * What each thing a player can do in the action phase leads to: a move sent straight away, or a flow that
 * asks for the payment or the hex first.
 */
export function playActions({ player, names, canPayWithHeat, submit, setFlow }: ActionContext) {
  /** A cost in M€ with no other payment: Helion is asked for the heat split, everyone else just pays. */
  const payFixedCost = (title: string, cost: number, send: (heat?: number) => MoveBody) => {
    if (canPayWithHeat && cost > 0) setFlow({ kind: 'heat', title, cost, send });
    else submit(send());
  };

  return {
    playCard(card: PlayableCard) {
      const rules = cardPaymentRules(card);
      const send = (payment: Payment): MoveBody => ({ type: 'PlayCard', cardId: card.cardId, payment });
      if (hasPaymentChoice(rules, player)) setFlow({ kind: 'pay', title: `Play ${names[card.cardId] ?? card.cardId}`, rules, send });
      else submit(send(defaultPayment(rules, player)));
    },

    standardProject(option: StandardProjectOption) {
      switch (option.project) {
        case 'SellPatents':
          return setFlow({ kind: 'sell' });
        case 'PowerPlant':
        case 'Asteroid': {
          const type = option.project;
          return payFixedCost(PROJECT_LABELS[type], option.cost, heat => ({ type, heat }));
        }
        case 'Aquifer':
        case 'Greenery':
        case 'City': {
          const type = option.project;
          // The hex can add to the cost, so any heat split is asked for once it is chosen.
          return setFlow({
            kind: 'hex',
            prompt: {
              kind: 'hex',
              title: `${PROJECT_LABELS[type]}: choose a hex`,
              locations: option.validLocations ?? [],
              move: location => ({ type, location }),
              fixedCost: option.cost,
            },
          });
        }
      }
    },

    cardAction(action: UsableCardAction) {
      const title = `Use ${names[action.cardId] ?? action.cardId}`;
      // Steel or titanium can stand in for M€ on a few actions; only those carry a payment.
      if (!action.allowSteel && !action.allowTitanium) {
        return payFixedCost(title, action.mcCost, heat => ({ type: 'UseCardAction', cardId: action.cardId, heat }));
      }
      const rules = actionPaymentRules(action);
      const send = (payment: Payment): MoveBody => ({ type: 'UseCardAction', cardId: action.cardId, payment });
      if (hasPaymentChoice(rules, player)) setFlow({ kind: 'pay', title, rules, send });
      else submit(send(defaultPayment(rules, player)));
    },

    claimMilestone(name: string) {
      payFixedCost(`Claim ${name}`, MILESTONE_COST, heat => ({ type: 'ClaimMilestone', milestoneName: name, heat }));
    },

    fundAward(name: string, cost: number) {
      payFixedCost(`Fund ${name}`, cost, heat => ({ type: 'FundAward', awardName: name, heat }));
    },

    convertHeat() {
      submit({ type: 'ConvertHeat' });
    },

    convertPlants(actions: ActionPhaseOptions) {
      setFlow({
        kind: 'hex',
        prompt: {
          kind: 'hex',
          title: 'Convert plants: choose a hex for the greenery',
          locations: actions.validGreeneryLocations,
          move: location => ({ type: 'ConvertPlants', location }),
        },
      });
    },
  };
}

export type PlayActions = ReturnType<typeof playActions>;
