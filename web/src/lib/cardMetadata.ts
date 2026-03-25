import tmCards from '@/data/tmCards.json';

export interface CardMeta {
  number: number | null;
  name: string;
  type: string;  // automated, active, event, prelude, global_event
  cost: number | null;
  tags: string[];
  has_requirements: boolean;
  expansion: string;
  vp?: string;
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
