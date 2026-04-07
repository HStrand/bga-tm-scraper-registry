/**
 * Card cost discount tables.
 *
 * This file declares which played cards and corporations grant discounts on
 * other cards' costs, and how those discounts are calculated. The data here is
 * consumed by `computeCardDiscount()` in this same file.
 *
 * Tag values must match the lowercase strings used in `tmCards.json`:
 *   building, space, science, power, earth, jovian, plant, microbe, animal,
 *   city, venus, wild
 *
 * Note: "event" is not a tmCards.json tag — events are detected by card type.
 * Use { kind: 'eventType' } for event-based discounts.
 *
 * Cards are looked up by lowercased name.
 */

import { getCardMeta } from '@/lib/cardMetadata';

export type DiscountTag =
  | 'building'
  | 'space'
  | 'science'
  | 'power'
  | 'earth'
  | 'jovian'
  | 'plant'
  | 'microbe'
  | 'animal'
  | 'city'
  | 'venus'
  | 'wild';

export type DiscountRule =
  /** Reduces the cost of every card by `amount`. Sources stack additively. */
  | { kind: 'global'; amount: number }
  /** Reduces the cost of cards with the given tag by `amount`. */
  | { kind: 'tag'; tag: DiscountTag; amount: number }
  /** Reduces the cost of event-type cards by `amount`. */
  | { kind: 'eventType'; amount: number };

/**
 * Discounts granted by *played* cards.
 * Keyed by lowercased card name.
 */
export const CARD_DISCOUNTS: Record<string, DiscountRule[]> = {
  'research outpost':       [{ kind: 'global', amount: 1 }],
  'earth catapult':         [{ kind: 'global', amount: 2 }],
  'quantum extractor':      [{ kind: 'tag', tag: 'space', amount: 2 }],
  'mass converter':         [{ kind: 'tag', tag: 'space', amount: 2 }],
  'earth office':           [{ kind: 'tag', tag: 'earth', amount: 3 }],
  'anti-gravity technology':[{ kind: 'global', amount: 2 }],
  'shuttles':               [{ kind: 'tag', tag: 'space', amount: 2 }],
  'space station':          [{ kind: 'tag', tag: 'space', amount: 2 }],
  'venus waystation':       [{ kind: 'tag', tag: 'venus', amount: 2 }],
  'sky docks':              [{ kind: 'global', amount: 1 }],
  'warp drive':             [{ kind: 'tag', tag: 'space', amount: 4 }],
};

/**
 * Discounts granted by corporations.
 * Keyed by lowercased corporation name.
 *
 * Note: rebates (e.g. Credicor's "gain 4 M€ after playing a card costing 20+")
 * are NOT discounts — they don't change the displayed price — and should be
 * left out of this table.
 */
export const CORP_DISCOUNTS: Record<string, DiscountRule[]> = {
  'thorgate':          [{ kind: 'tag', tag: 'power',    amount: 3 }],
  'teractor':          [{ kind: 'tag', tag: 'earth',    amount: 3 }],
  'valley trust':      [{ kind: 'tag', tag: 'science',  amount: 2 }],
  'cheung shing mars': [{ kind: 'tag', tag: 'building', amount: 2 }],
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

function applyRule(rule: DiscountRule, tags: string[], isEvent: boolean): number {
  switch (rule.kind) {
    case 'global':
      return rule.amount;
    case 'tag':
      return tags.includes(rule.tag) ? rule.amount : 0;
    case 'eventType':
      return isEvent ? rule.amount : 0;
  }
}

/**
 * Compute the total discount (in M€) that should apply to a card given the
 * player's currently played cards and corporation. The result is always
 * non-negative — the caller is responsible for clamping `baseCost - discount`
 * at zero if it ever needs to display the effective cost.
 */
export function computeCardDiscount(
  cardName: string,
  playedCards: readonly string[],
  corporation: string | undefined,
): number {
  const meta = getCardMeta(cardName);
  if (!meta) return 0;
  const baseCost = meta.cost ?? 0;
  if (baseCost <= 0) return 0;
  const tags = meta.tags ?? [];
  const isEvent = meta.type === 'event';

  let total = 0;

  for (const played of playedCards) {
    const rules = CARD_DISCOUNTS[played.toLowerCase()];
    if (!rules) continue;
    for (const r of rules) total += applyRule(r, tags, isEvent);
  }

  if (corporation) {
    const rules = CORP_DISCOUNTS[corporation.toLowerCase()];
    if (rules) {
      for (const r of rules) total += applyRule(r, tags, isEvent);
    }
  }

  return Math.max(0, total);
}

/**
 * Convenience: returns `{ base, effective, discount }` for a card. `base` and
 * `effective` are clamped at 0. Returns `null` if the card has no metadata or
 * no base cost.
 */
export function computeCardCost(
  cardName: string,
  playedCards: readonly string[],
  corporation: string | undefined,
): { base: number; effective: number; discount: number } | null {
  const meta = getCardMeta(cardName);
  if (!meta || meta.cost == null || meta.cost <= 0) return null;
  const base = meta.cost;
  const discount = computeCardDiscount(cardName, playedCards, corporation);
  const effective = Math.max(0, base - discount);
  return { base, effective, discount };
}
