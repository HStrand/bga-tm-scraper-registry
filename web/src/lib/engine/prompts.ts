// Turns what the engine is waiting for into one of a handful of prompt shapes, so the play page needs one
// piece of UI per shape rather than one per kind of decision.

import type { AvailableMoves, EnginePlayer, HexCoord, MoveBody, PendingAction, PlayableCard } from './types';

interface PromptBase {
  title: string;
  /** Set when the decision may be declined. */
  skip?: { label: string; move: MoveBody };
}

/** Pick a hex on the board. */
export interface HexPrompt extends PromptBase {
  kind: 'hex';
  locations: HexCoord[];
  move: (location: HexCoord) => MoveBody;
  /** M€ the move costs whatever hex is picked (a standard project's price). */
  fixedCost?: number;
  /** Set when the hex itself never costs anything, as when claiming land rather than placing a tile. */
  hexIsFree?: boolean;
}

/** Pick a player. */
export interface PlayerPrompt extends PromptBase {
  kind: 'player';
  playerIds: number[];
  move: (playerId: number) => MoveBody;
}

/** Pick one card. */
export interface CardPrompt extends PromptBase {
  kind: 'card';
  cardIds: string[];
  move: (cardId: string) => MoveBody;
}

/** Pick several cards, possibly paying for each. */
export interface CardsPrompt extends PromptBase {
  kind: 'cards';
  cardIds: string[];
  min: number;
  max: number;
  costPerCard: number;
  confirmLabel: string;
  move: (cardIds: string[]) => MoveBody;
}

/** Pick from a list of text options. */
export interface OptionPrompt extends PromptBase {
  kind: 'option';
  options: { label: string; move: MoveBody }[];
}

/** Play a card from hand, with payment, outside the normal action. */
export interface PlayCardPrompt extends PromptBase {
  kind: 'playCard';
  cards: PlayableCard[];
}

export type Prompt = HexPrompt | PlayerPrompt | CardPrompt | CardsPrompt | OptionPrompt | PlayCardPrompt;

/** "NuclearZone" -> "nuclear zone" */
const words = (pascal: string) => pascal.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

const pass: MoveBody = { type: 'Pass' };

function pendingPrompt(pending: PendingAction, moves: AvailableMoves, player: EnginePlayer): Prompt {
  switch (pending.type) {
    case 'PlaceTile':
      return {
        kind: 'hex',
        title: `Place ${/^[aeiou]/i.test(pending.tileType) ? 'an' : 'a'} ${words(pending.tileType)} tile`,
        locations: pending.validLocations,
        move: location => ({ type: 'PlaceTile', location }),
      };
    case 'ClaimLand':
      return {
        kind: 'hex',
        title: 'Claim a hex',
        locations: pending.validLocations,
        move: location => ({ type: 'PlaceTile', location }),
        hexIsFree: true,
      };
    case 'RemoveResource':
      return {
        kind: 'player',
        title: `Remove up to ${pending.amount} ${words(pending.resource)} from a player`,
        playerIds: pending.validTargetPlayerIds,
        move: targetPlayerId => ({ type: 'ChooseTargetPlayer', targetPlayerId }),
        skip: pending.isOptional ? { label: 'Remove nothing', move: pass } : undefined,
      };
    case 'ReduceProduction':
      return {
        kind: 'player',
        title: `Reduce a player's ${words(pending.resource)} production by ${pending.amount}`,
        playerIds: pending.validTargetPlayerIds,
        move: targetPlayerId => ({ type: 'ChooseTargetPlayer', targetPlayerId }),
      };
    case 'AddCardResource':
      return {
        kind: 'card',
        title: `Add ${pending.amount} ${words(pending.resourceType)} to a card`,
        cardIds: pending.validCardIds,
        move: cardId => ({ type: 'SelectCard', cardId }),
      };
    case 'RemoveCardResource':
      return {
        kind: 'card',
        title: `Remove ${pending.amount} ${words(pending.resourceType)} from a card`,
        cardIds: pending.validCardIds,
        move: cardId => ({ type: 'SelectCard', cardId }),
      };
    case 'CopyProduction':
      return {
        kind: 'card',
        title: 'Copy the production of a building card',
        cardIds: pending.validCardIds,
        move: cardId => ({ type: 'SelectCard', cardId }),
      };
    case 'ChooseCardToPlay':
      return {
        kind: 'card',
        title: pending.description,
        cardIds: pending.cardIds,
        move: cardId => ({ type: 'SelectCard', cardId }),
      };
    case 'DrawKeep': {
      // Free cards must all be taken; bought ones are optional.
      const bought = pending.costPerCard > 0;
      const keep = Math.min(pending.keepCount, pending.drawnCardIds.length);
      return {
        kind: 'cards',
        title: bought
          ? `Buy up to ${keep} of the drawn cards`
          : `Keep ${keep} of the ${pending.drawnCardIds.length} drawn cards`,
        cardIds: pending.drawnCardIds,
        min: bought ? 0 : keep,
        max: keep,
        costPerCard: pending.costPerCard,
        confirmLabel: bought ? 'Buy' : 'Keep',
        move: cardIds => ({ type: 'BuyCards', cardIds }),
      };
    }
    case 'BuyCards':
      return {
        kind: 'cards',
        title: 'Buy cards',
        cardIds: pending.availableCardIds,
        min: 0,
        max: pending.availableCardIds.length,
        costPerCard: 3,
        confirmLabel: 'Buy',
        move: cardIds => ({ type: 'BuyCards', cardIds }),
      };
    case 'DiscardCards':
      return {
        kind: 'cards',
        title: `Discard ${pending.count} card${pending.count === 1 ? '' : 's'}`,
        cardIds: player.hand,
        min: pending.count,
        max: pending.count,
        costPerCard: 0,
        confirmLabel: 'Discard',
        move: cardIds => ({ type: 'DiscardCards', cardIds }),
      };
    case 'MarsUniversity':
      return {
        kind: 'card',
        title: 'Mars University: discard a card to draw a card',
        cardIds: player.hand,
        move: cardId => ({ type: 'DiscardCards', cardIds: [cardId] }),
        skip: { label: 'Keep my hand', move: pass },
      };
    case 'PlayCardFromHand':
      return {
        kind: 'playCard',
        title: pending.description,
        cards: moves.pendingPlayableCards,
        skip: { label: 'Play nothing', move: pass },
      };
    case 'ChooseOption':
      return {
        kind: 'option',
        title: pending.description,
        options: pending.options
          .map((label, optionIndex) => ({ label, optionIndex }))
          .filter(o => !pending.validOptionIndices || pending.validOptionIndices.includes(o.optionIndex))
          .map(o => ({ label: o.label, move: { type: 'ChooseOption', optionIndex: o.optionIndex } })),
      };
    case 'ChooseEffectOrder':
      return {
        kind: 'option',
        title: 'Choose which effect to resolve first',
        options: [
          ...pending.remainingEffectIndices.map((effectIndex, i): { label: string; move: MoveBody } => ({
            label: pending.effectDescriptions[i] ?? `Effect ${effectIndex + 1}`,
            move: { type: 'ChooseEffectOrder', effectIndex },
          })),
          { label: 'Resolve in the order listed', move: { type: 'ChooseEffectOrder', effectIndex: -1 } },
        ],
      };
    case 'ChooseTriggerOrder':
      return {
        kind: 'option',
        title: 'Choose which triggered effect to resolve first',
        options: [
          ...pending.descriptions.map((label, effectIndex): { label: string; move: MoveBody } => ({
            label,
            move: { type: 'ChooseEffectOrder', effectIndex },
          })),
          { label: 'Resolve in the order listed', move: { type: 'ChooseEffectOrder', effectIndex: -1 } },
        ],
      };
  }
}

/**
 * The single decision a player must make now, if the game is waiting on one: a pending action, a draft pick,
 * a research purchase or the final greenery placement. Null in the action phase proper, where the player
 * chooses among many actions instead.
 */
export function currentPrompt(moves: AvailableMoves, player: EnginePlayer): Prompt | null {
  if (moves.pendingAction) return pendingPrompt(moves.pendingAction, moves, player);

  if (moves.draft) {
    return {
      kind: 'card',
      title: 'Draft a card',
      cardIds: moves.draft.draftHand,
      move: cardId => ({ type: 'DraftCard', cardId }),
    };
  }

  if (moves.buyCards) {
    const { availableCards, costPerCard } = moves.buyCards;
    return {
      kind: 'cards',
      title: `Buy cards for ${costPerCard} M€ each`,
      cardIds: availableCards,
      min: 0,
      max: availableCards.length,
      costPerCard,
      confirmLabel: 'Buy',
      move: cardIds => ({ type: 'BuyCards', cardIds }),
    };
  }

  if (moves.finalGreenery) {
    return {
      kind: 'hex',
      title: 'Convert plants into a final greenery',
      locations: moves.finalGreenery.canConvert ? moves.finalGreenery.validGreeneryLocations ?? [] : [],
      move: location => ({ type: 'ConvertPlants', location }),
      skip: moves.finalGreenery.canPass ? { label: 'Done placing greeneries', move: pass } : undefined,
    };
  }

  return null;
}
