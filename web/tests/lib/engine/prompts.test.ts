import { describe, it, expect } from 'vitest';
import { currentPrompt, type Prompt } from '@/lib/engine/prompts';
import type { AvailableMoves, EnginePlayer, EngineMove, MoveBody, PendingAction } from '@/lib/engine/types';
import { gameStartSession, session, sameMove } from './engineFixtures';

const player: EnginePlayer = {
  playerId: 0, corporationId: 'CORP01', terraformRating: 20,
  resources: { megaCredits: 10, steel: 0, titanium: 0, plants: 0, energy: 0, heat: 0 },
  production: { megaCredits: 0, steel: 0, titanium: 0, plants: 0, energy: 0, heat: 0 },
  hand: ['001', '002', '003'], playedCards: [], playedEvents: [], cardResources: {}, usedCardActions: [],
  passed: false, actionsThisTurn: 0,
};

const waitingOn = (pendingAction: PendingAction): AvailableMoves =>
  ({ gameOver: false, waitingForOtherPlayer: false, pendingPlayableCards: [], pendingAction });

const promptFor = (pending: PendingAction) => currentPrompt(waitingOn(pending), player)!;

describe('currentPrompt for pending actions', () => {
  it('asks for a hex to place a tile', () => {
    const prompt = promptFor({ type: 'PlaceTile', tileType: 'Ocean', validLocations: [{ col: 4, row: 1 }] });

    expect(prompt).toMatchObject({ kind: 'hex', title: 'Place an ocean tile', locations: [{ col: 4, row: 1 }] });
    expect(prompt.kind === 'hex' && prompt.move({ col: 4, row: 1 })).toEqual({ type: 'PlaceTile', location: { col: 4, row: 1 } });
    expect(promptFor({ type: 'PlaceTile', tileType: 'NuclearZone', validLocations: [] }).title).toBe('Place a nuclear zone tile');
  });

  it('asks for a player, and lets an optional removal be declined', () => {
    const prompt = promptFor({ type: 'RemoveResource', resource: 'Plants', amount: 3, validTargetPlayerIds: [1], isOptional: true });

    expect(prompt).toMatchObject({ kind: 'player', title: 'Remove up to 3 plants from a player', playerIds: [1] });
    expect(prompt.kind === 'player' && prompt.move(1)).toEqual({ type: 'ChooseTargetPlayer', targetPlayerId: 1 });
    expect(prompt.skip?.move).toEqual({ type: 'Pass' });

    const forced = promptFor({ type: 'ReduceProduction', resource: 'Heat', amount: 2, validTargetPlayerIds: [0, 1] });
    expect(forced).toMatchObject({ kind: 'player', title: "Reduce a player's heat production by 2" });
    expect(forced.skip).toBeUndefined();
  });

  it.each<PendingAction>([
    { type: 'AddCardResource', resourceType: 'Animal', amount: 1, validCardIds: ['024'] },
    { type: 'RemoveCardResource', resourceType: 'Microbe', amount: 2, validCardIds: ['024'] },
    { type: 'CopyProduction', validCardIds: ['024'] },
    { type: 'ChooseCardToPlay', description: 'Choose a Prelude to play:', cardIds: ['024'] },
  ])('asks for one card to resolve $type', pending => {
    const prompt = promptFor(pending);

    expect(prompt).toMatchObject({ kind: 'card', cardIds: ['024'] });
    expect(prompt.kind === 'card' && prompt.move('024')).toEqual({ type: 'SelectCard', cardId: '024' });
  });

  it('requires every free drawn card to be kept, but makes bought ones optional', () => {
    const free = promptFor({ type: 'DrawKeep', drawnCardIds: ['010', '011', '012'], keepCount: 1, costPerCard: 0 });
    expect(free).toMatchObject({ kind: 'cards', title: 'Keep 1 of the 3 drawn cards', min: 1, max: 1, costPerCard: 0 });

    const bought = promptFor({ type: 'DrawKeep', drawnCardIds: ['018'], keepCount: 1, costPerCard: 3 });
    expect(bought).toMatchObject({ kind: 'cards', title: 'Buy up to 1 of the drawn cards', min: 0, max: 1, costPerCard: 3 });
    expect(bought.kind === 'cards' && bought.move(['018'])).toEqual({ type: 'BuyCards', cardIds: ['018'] });
  });

  it('asks which cards to discard from the hand', () => {
    const prompt = promptFor({ type: 'DiscardCards', count: 2 });

    expect(prompt).toMatchObject({ kind: 'cards', title: 'Discard 2 cards', cardIds: player.hand, min: 2, max: 2 });
    expect(prompt.kind === 'cards' && prompt.move(['001', '003'])).toEqual({ type: 'DiscardCards', cardIds: ['001', '003'] });
  });

  it('offers the Mars University swap as a single optional discard', () => {
    const prompt = promptFor({ type: 'MarsUniversity' });

    expect(prompt).toMatchObject({ kind: 'card', cardIds: player.hand });
    expect(prompt.kind === 'card' && prompt.move('002')).toEqual({ type: 'DiscardCards', cardIds: ['002'] });
    expect(prompt.skip?.move).toEqual({ type: 'Pass' });
  });

  it('offers only the options the engine allows', () => {
    const prompt = promptFor({
      type: 'ChooseOption', description: 'Choose one:', options: ['Gain 3 plants', 'Add 2 animals', 'Add 3 microbes'],
      validOptionIndices: [0, 2],
    });

    expect(prompt.kind === 'option' && prompt.options).toEqual([
      { label: 'Gain 3 plants', move: { type: 'ChooseOption', optionIndex: 0 } },
      { label: 'Add 3 microbes', move: { type: 'ChooseOption', optionIndex: 2 } },
    ]);
  });

  it('lists the effects still to resolve by their engine index, plus the default order', () => {
    const prompt = promptFor({
      type: 'ChooseEffectOrder', sourceCardId: '161', effectSource: 'onPlay',
      remainingEffectIndices: [1, 2], effectDescriptions: ['Place an ocean tile', 'Draw 1 card'],
    });

    expect(prompt.kind === 'option' && prompt.options).toEqual([
      { label: 'Place an ocean tile', move: { type: 'ChooseEffectOrder', effectIndex: 1 } },
      { label: 'Draw 1 card', move: { type: 'ChooseEffectOrder', effectIndex: 2 } },
      { label: 'Resolve in the order listed', move: { type: 'ChooseEffectOrder', effectIndex: -1 } },
    ]);
  });

  it('offers the cards playable in answer to a play-a-card effect', () => {
    const card = {
      cardId: '001', effectiveCost: 0, canUseSteel: true, canUseTitanium: false, canUseHeat: false,
      steelValue: 2, titaniumValue: 3, cardResourcePayments: {},
    };
    const prompt = currentPrompt({
      ...waitingOn({ type: 'PlayCardFromHand', description: 'Play a card from hand, ignoring requirements', ignoreGlobalRequirements: true, costDiscount: 25 }),
      pendingPlayableCards: [card],
    }, player)!;

    expect(prompt).toMatchObject({ kind: 'playCard', cards: [card] });
    expect(prompt.skip?.move).toEqual({ type: 'Pass' });
  });
});

describe('currentPrompt outside pending actions', () => {
  const base = { gameOver: false, waitingForOtherPlayer: false, pendingPlayableCards: [] };

  it('asks for the whole opening at once', () => {
    const setup = {
      availableCorporations: ['CORP19', 'CORP07'], availablePreludes: ['P15', 'P23', 'P26', 'P28'], availableCards: ['106', '115'],
      preludesToKeep: 2, costPerCard: 3, startingMegaCredits: { CORP19: 38, CORP07: 23 },
    };

    expect(currentPrompt({ ...base, setup }, player)).toEqual({
      kind: 'setup', title: 'Choose a corporation, preludes and opening cards', options: setup,
    });
    expect(currentPrompt({ ...base, setup: { ...setup, availablePreludes: [], preludesToKeep: 0 } }, player)!.title)
      .toBe('Choose a corporation and opening cards');
  });

  it('asks which kept prelude to play next', () => {
    const prompt = currentPrompt({ ...base, prelude: { remainingPreludes: ['P27', 'P34'] } }, player)!;

    expect(prompt).toMatchObject({ kind: 'card', title: 'Play a prelude', cardIds: ['P27', 'P34'], confirmLabel: 'Play' });
    expect(prompt.kind === 'card' && prompt.move('P34')).toEqual({ type: 'PlayPrelude', preludeId: 'P34' });
    expect(prompt.skip).toBeUndefined();
  });

  it('asks for a draft pick', () => {
    const prompt = currentPrompt({ ...base, draft: { draftHand: ['189', '155'], passingToPlayerId: 1 } }, player)!;

    expect(prompt).toMatchObject({ kind: 'card', title: 'Draft a card', cardIds: ['189', '155'] });
    expect(prompt.kind === 'card' && prompt.move('155')).toEqual({ type: 'DraftCard', cardId: '155' });
  });

  it('asks which research cards to buy, none being allowed', () => {
    const prompt = currentPrompt({ ...base, buyCards: { availableCards: ['184', '126'], costPerCard: 3 } }, player)!;

    expect(prompt).toMatchObject({ kind: 'cards', min: 0, max: 2, costPerCard: 3 });
    expect(prompt.kind === 'cards' && prompt.move([])).toEqual({ type: 'BuyCards', cardIds: [] });
  });

  it('asks for the final greenery, or to stop', () => {
    const prompt = currentPrompt({
      ...base, finalGreenery: { canConvert: true, canPass: true, validGreeneryLocations: [{ col: 3, row: 3 }] },
    }, player)!;

    expect(prompt).toMatchObject({ kind: 'hex', locations: [{ col: 3, row: 3 }] });
    expect(prompt.kind === 'hex' && prompt.move({ col: 3, row: 3 })).toEqual({ type: 'ConvertPlants', location: { col: 3, row: 3 } });
    expect(prompt.skip?.move).toEqual({ type: 'Pass' });
  });

  it('has no single prompt in the action phase, where the player picks among actions', () => {
    const opening = session[0].table;
    const seat = Object.keys(opening.legalMoves)[0];

    expect(opening.legalMoves[seat].actions).toBeTruthy();
    expect(currentPrompt(opening.legalMoves[seat], opening.state.players[Number(seat)])).toBeNull();
  });
});

/** Every move body a prompt can produce from the choices it offers. */
function offeredByPrompt(prompt: Prompt, wanted: EngineMove): MoveBody[] {
  const skip = prompt.skip ? [prompt.skip.move] : [];
  switch (prompt.kind) {
    case 'hex': return [...prompt.locations.map(prompt.move), ...skip];
    case 'player': return [...prompt.playerIds.map(prompt.move), ...skip];
    case 'card': return [...prompt.cardIds.map(prompt.move), ...skip];
    case 'option': return [...prompt.options.map(o => o.move), ...skip];
    // Any subset within the limits can be chosen; check the one that was.
    case 'cards': {
      const chosen = 'cardIds' in wanted ? wanted.cardIds : [];
      const allowed = chosen.length >= prompt.min && chosen.length <= prompt.max && chosen.every(id => prompt.cardIds.includes(id));
      return [...(allowed ? [prompt.move(chosen)] : []), ...skip];
    }
    case 'playCard': return skip;
    // Any corporation, the right number of preludes and any affordable cards can be chosen; check what was.
    case 'setup': {
      if (wanted.type !== 'Setup') return [];
      const { options } = prompt;
      const allowed = options.availableCorporations.includes(wanted.corporationId)
        && wanted.preludeIds.length === options.preludesToKeep
        && wanted.preludeIds.every(id => options.availablePreludes.includes(id))
        && wanted.cardIdsToBuy.every(id => options.availableCards.includes(id))
        && wanted.cardIdsToBuy.length * options.costPerCard <= options.startingMegaCredits[wanted.corporationId];
      const { playerId: _, heat: __, ...body } = wanted;
      return allowed ? [body] : [];
    }
  }
}

describe('currentPrompt against a recorded engine session', () => {
  it.each([
    // Drafts, research purchases, tile placements and draw-and-buy actions.
    { name: 'from generation 4', session, atLeast: 20 },
    // Both openings, four preludes, a tile one of them places, and the next generation's draft.
    { name: 'from the opening deal', session: gameStartSession, atLeast: 10 },
  ])('offers every move the engine went on to accept outside the action menu, $name', ({ session, atLeast }) => {
    const unoffered: string[] = [];
    let prompted = 0;

    for (let i = 1; i < session.length; i++) {
      const move = session[i].move!;
      const before = session[i - 1].table;
      const moves = before.legalMoves[String(move.playerId)];
      const prompt = moves && currentPrompt(moves, before.state.players[move.playerId]);
      if (!prompt) continue;

      prompted++;
      const offered = offeredByPrompt(prompt, move).some(body => sameMove({ ...body, playerId: move.playerId }, move));
      if (!offered) unoffered.push(`#${i} ${JSON.stringify(move)} (prompt: ${prompt.kind} "${prompt.title}")`);
    }

    expect(unoffered).toEqual([]);
    expect(prompted).toBeGreaterThan(atLeast);
  });
});
