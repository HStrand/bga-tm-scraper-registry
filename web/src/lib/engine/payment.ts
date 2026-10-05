import type { EnginePlayer, HexCoord, Payment, PlayableCard, UsableCardAction } from './types';

/** What may be spent on a cost besides MC. A value of 0 means the resource cannot be used. */
export interface PaymentRules {
  cost: number;
  steelValue: number;
  titaniumValue: number;
  canUseHeat: boolean;
  /** Card id -> MC value of each resource on that card. */
  cardResourceValues: Record<string, number>;
}

export function cardPaymentRules(card: PlayableCard): PaymentRules {
  return {
    cost: card.effectiveCost,
    steelValue: card.canUseSteel ? card.steelValue : 0,
    titaniumValue: card.canUseTitanium ? card.titaniumValue : 0,
    canUseHeat: card.canUseHeat,
    cardResourceValues: card.cardResourcePayments,
  };
}

export function actionPaymentRules(action: UsableCardAction): PaymentRules {
  return {
    cost: action.mcCost,
    steelValue: action.allowSteel ? action.steelValue : 0,
    titaniumValue: action.allowTitanium ? action.titaniumValue : 0,
    canUseHeat: action.canUseHeat,
    cardResourceValues: {},
  };
}

/** Whether the player has a choice in how to pay; if not, the default payment can be sent without asking. */
export function hasPaymentChoice(rules: PaymentRules, player: EnginePlayer): boolean {
  return (rules.steelValue > 0 && player.resources.steel > 0)
    || (rules.titaniumValue > 0 && player.resources.titanium > 0)
    || (rules.canUseHeat && player.resources.heat > 0)
    || Object.keys(rules.cardResourceValues).some(id => (player.cardResources[id] ?? 0) > 0);
}

/** MC value of everything in a payment. */
export function paymentValue(payment: Payment, rules: PaymentRules): number {
  const fromCards = Object.entries(payment.cardResources ?? {})
    .reduce((sum, [id, count]) => sum + count * (rules.cardResourceValues[id] ?? 0), 0);
  return payment.megaCredits + payment.heat
    + payment.steel * rules.steelValue + payment.titanium * rules.titaniumValue + fromCards;
}

/**
 * A payment that spends metal before MC: titanium, then steel, then card resources, then MC, with heat
 * covering any MC shortfall. Metal cannot be split, so when MC still runs short one more unit overpays.
 */
export function defaultPayment(rules: PaymentRules, player: EnginePlayer): Payment {
  const have = player.resources;
  let remaining = rules.cost;

  let titanium = rules.titaniumValue > 0 ? Math.min(have.titanium, Math.floor(remaining / rules.titaniumValue)) : 0;
  remaining -= titanium * rules.titaniumValue;

  let steel = rules.steelValue > 0 ? Math.min(have.steel, Math.floor(remaining / rules.steelValue)) : 0;
  remaining -= steel * rules.steelValue;

  const cardResources: Record<string, number> = {};
  for (const [id, value] of Object.entries(rules.cardResourceValues)) {
    const used = Math.min(player.cardResources[id] ?? 0, Math.floor(remaining / value));
    if (used > 0) {
      cardResources[id] = used;
      remaining -= used * value;
    }
  }

  const heat = rules.canUseHeat ? Math.min(have.heat, Math.max(0, remaining - have.megaCredits)) : 0;
  remaining -= heat;

  if (remaining > have.megaCredits && rules.titaniumValue > 0 && titanium < have.titanium) {
    titanium++;
    remaining -= rules.titaniumValue;
  }
  while (remaining > have.megaCredits && rules.steelValue > 0 && steel < have.steel) {
    steel++;
    remaining -= rules.steelValue;
  }

  return {
    megaCredits: Math.max(0, remaining),
    steel,
    titanium,
    heat,
    cardResources: Object.keys(cardResources).length > 0 ? cardResources : null,
  };
}

/** Why a payment cannot be made, or null when it is fine. */
export function paymentProblem(payment: Payment, rules: PaymentRules, player: EnginePlayer): string | null {
  const have = player.resources;
  if (payment.megaCredits > have.megaCredits) return `Only ${have.megaCredits} M€ available.`;
  if (payment.steel > have.steel) return `Only ${have.steel} steel available.`;
  if (payment.titanium > have.titanium) return `Only ${have.titanium} titanium available.`;
  if (payment.heat > have.heat) return `Only ${have.heat} heat available.`;
  for (const [id, count] of Object.entries(payment.cardResources ?? {})) {
    if (count > (player.cardResources[id] ?? 0)) return 'Not enough resources on that card.';
  }
  const short = rules.cost - paymentValue(payment, rules);
  return short > 0 ? `${short} M€ short.` : null;
}

/**
 * How much heat may go towards a cost in M€ that has no other payment: at least what M€ cannot cover, at most
 * the cost or the heat held.
 */
export function heatRange(cost: number, player: EnginePlayer): { min: number; max: number } {
  return {
    min: Math.max(0, cost - player.resources.megaCredits),
    max: Math.min(cost, player.resources.heat),
  };
}

/**
 * M€ a tile placement costs because of the hex it goes on: 6 M€ on the Hellas South Pole, for the ocean it
 * grants, and 4 M€ on the centre hex of Vastitas Borealis, for the temperature step it grants. The engine
 * charges it; this mirrors it so the payment can be asked for up front.
 */
export function hexPlacementCost(mapName: string, location: HexCoord): number {
  if (mapName === 'Hellas' && location.col === 5 && location.row === 9) return 6;
  if (mapName === 'Vastitas Borealis' && location.col === 5 && location.row === 5) return 4;
  return 0;
}