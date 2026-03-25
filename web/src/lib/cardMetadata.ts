import tmCards from '@/data/tmCards.json';

export interface CardMeta {
  number: number | null;
  name: string;
  type: string;  // automated, active, event, prelude, global_event
  subtype?: string; // for active cards: 'action' or 'effect'
  cost: number | null;
  tags: string[];
  has_requirements: boolean;
  expansion: string;
  vp?: string;
}

/** Get the display category for a card (for tableau sections) */
export function getCardCategory(cardName: string): 'automated' | 'action' | 'effect' | 'event' | 'prelude' | 'unknown' {
  const meta = getCardMeta(cardName);
  if (!meta) return 'unknown';
  if (meta.type === 'automated') return 'automated';
  if (meta.type === 'event') return 'event';
  if (meta.type === 'prelude') return 'prelude';
  if (meta.type === 'active') return meta.subtype === 'effect' ? 'effect' : 'action';
  return 'unknown';
}

export function isPrelude(cardName: string): boolean {
  return getCardMeta(cardName)?.type === 'prelude';
}

const cardsByName = new Map<string, CardMeta>();
for (const card of tmCards as CardMeta[]) {
  cardsByName.set(card.name.toLowerCase(), card);
}

export function getCardMeta(cardName: string): CardMeta | undefined {
  return cardsByName.get(cardName.toLowerCase());
}

export function isAutomated(cardName: string): boolean {
  return getCardMeta(cardName)?.type === 'automated';
}

export function hasRequirements(cardName: string): boolean {
  return getCardMeta(cardName)?.has_requirements ?? false;
}

/** Count automated (green) cards in a list */
export function countAutomatedCards(cards: string[]): number {
  return cards.filter(c => isAutomated(c)).length;
}

/** Count cards with requirements in a list */
export function countCardsWithRequirements(cards: string[]): number {
  return cards.filter(c => hasRequirements(c)).length;
}
