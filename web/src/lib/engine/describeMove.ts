import type { EngineMove, HexCoord, Payment } from './types';

const at = ({ col, row }: HexCoord) => `hex ${col},${row}`;

function paid(payment: Payment | null | undefined): string {
  if (!payment) return '';
  const parts = [
    payment.megaCredits > 0 ? `${payment.megaCredits} M€` : null,
    payment.steel > 0 ? `${payment.steel} steel` : null,
    payment.titanium > 0 ? `${payment.titanium} titanium` : null,
    payment.heat > 0 ? `${payment.heat} heat` : null,
  ].filter(Boolean);
  return parts.length > 0 ? ` for ${parts.join(', ')}` : '';
}

/** What a move did, as a short phrase to follow the player's name: "plays Comet for 12 M€, 3 titanium". */
export function describeMove(move: EngineMove, cardNames: Record<string, string>): string {
  const card = (id: string) => cardNames[id] ?? id;
  const cards = (ids: string[]) => ids.map(card).join(', ');

  switch (move.type) {
    case 'Setup': {
      const preludes = move.preludeIds.length > 0 ? ` with ${cards(move.preludeIds)}` : '';
      return `starts as ${card(move.corporationId)}${preludes}, buying ${move.cardIdsToBuy.length} card${move.cardIdsToBuy.length === 1 ? '' : 's'}`;
    }
    case 'DraftCard': return `drafts ${card(move.cardId)}`;
    case 'BuyCards': return move.cardIds.length > 0 ? `keeps ${cards(move.cardIds)}` : 'keeps no cards';
    case 'PlayCard': return `plays ${card(move.cardId)}${paid(move.payment)}`;
    case 'SellPatents': return `sells ${cards(move.cardIds)}`;
    case 'PowerPlant': return 'uses the standard project Power Plant';
    case 'Asteroid': return 'uses the standard project Asteroid';
    case 'Aquifer': return `uses the standard project Aquifer at ${at(move.location)}`;
    case 'Greenery': return `uses the standard project Greenery at ${at(move.location)}`;
    case 'City': return `uses the standard project City at ${at(move.location)}`;
    case 'UseCardAction': return `uses the action of ${card(move.cardId)}${paid(move.payment)}`;
    case 'ClaimMilestone': return `claims the milestone ${move.milestoneName}`;
    case 'FundAward': return `funds the award ${move.awardName}`;
    case 'ConvertPlants': return `converts plants into a greenery at ${at(move.location)}`;
    case 'ConvertHeat': return 'converts heat into temperature';
    case 'Pass': return 'passes';
    case 'EndTurn': return 'ends the turn';
    case 'PerformFirstAction': return 'performs the corporation first action';
    case 'PlayPrelude': return `plays the prelude ${card(move.preludeId)}`;
    case 'PlaceTile': return `places a tile at ${at(move.location)}`;
    case 'ChooseTargetPlayer': return 'chooses a player';
    case 'SelectCard': return `chooses ${card(move.cardId)}`;
    case 'ChooseOption': return 'chooses an option';
    case 'DiscardCards': return `discards ${cards(move.cardIds)}`;
    case 'ChooseEffectOrder': return 'chooses the order of effects';
  }
}
