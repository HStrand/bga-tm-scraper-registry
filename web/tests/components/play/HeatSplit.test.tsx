import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { playActions, type Flow } from '@/components/play/actions';
import { Decision } from '@/components/play/Decision';
import { HeatSplitForm } from '@/components/play/PaymentForm';
import { currentPrompt, type Prompt } from '@/lib/engine/prompts';
import type { EngineMove, EnginePlayer, StandardProjectOption, TableResponse, UsableCardAction } from '@/lib/engine/types';
import { GamePlayPage } from '@/pages/GamePlayPage';
import { recordedEngine, session } from '../../lib/engine/engineFixtures';

// Helion may pay any cost in M€ with heat. Moves without a payment of their own then carry how much heat to use.

const helion: EnginePlayer = {
  playerId: 0, corporationId: 'CORP03', terraformRating: 20,
  resources: { megaCredits: 10, steel: 0, titanium: 0, plants: 0, energy: 0, heat: 12 },
  production: { megaCredits: 0, steel: 0, titanium: 0, plants: 0, energy: 0, heat: 0 },
  hand: [], playedCards: [], playedEvents: [], cardResources: {}, usedCardActions: [], passed: false, actionsThisTurn: 0,
};

const asteroid: StandardProjectOption = { project: 'Asteroid', available: true, cost: 14 };
const restrictedArea: UsableCardAction = {
  cardId: '199', allowSteel: false, allowTitanium: false, canUseHeat: false, mcCost: 2, steelValue: 0, titaniumValue: 0,
};

function actionsFor(canPayWithHeat: boolean) {
  const submit = vi.fn();
  const setFlow = vi.fn<(flow: Flow | null) => void>();
  const act = playActions({ player: helion, names: { '199': 'Restricted Area' }, canPayWithHeat, submit, setFlow });
  const heatFlow = () => {
    const flow = setFlow.mock.calls.at(-1)?.[0];
    if (flow?.kind !== 'heat') throw new Error(`Expected a heat split, got ${JSON.stringify(flow)}`);
    return flow;
  };
  return { act, submit, setFlow, heatFlow };
}

describe('Actions of a player who may pay with heat', () => {
  it('ask for the heat split before a standard project is sent', () => {
    const { act, submit, heatFlow } = actionsFor(true);

    act.standardProject(asteroid);

    expect(submit).not.toHaveBeenCalled();
    expect(heatFlow()).toMatchObject({ title: 'Asteroid', cost: 14 });
    expect(heatFlow().send(4)).toEqual({ type: 'Asteroid', heat: 4 });
  });

  it.each([
    ['a milestone', (act: ReturnType<typeof playActions>) => act.claimMilestone('Terraformer'), 8, { type: 'ClaimMilestone', milestoneName: 'Terraformer', heat: 3 }],
    ['an award', (act: ReturnType<typeof playActions>) => act.fundAward('Banker', 14), 14, { type: 'FundAward', awardName: 'Banker', heat: 3 }],
    ['an M€ card action', (act: ReturnType<typeof playActions>) => act.cardAction(restrictedArea), 2, { type: 'UseCardAction', cardId: '199', heat: 3 }],
  ])('ask for it on %s too', (_what, start, cost, expected) => {
    const { act, submit, heatFlow } = actionsFor(true);

    start(act);

    expect(submit).not.toHaveBeenCalled();
    expect(heatFlow().cost).toBe(cost);
    expect(heatFlow().send(3)).toEqual(expected);
  });

  it('leave the split until the hex is known for projects that place a tile', () => {
    const { act, submit, setFlow } = actionsFor(true);

    act.standardProject({ project: 'Aquifer', available: true, cost: 18, validLocations: [{ col: 5, row: 1 }] });

    expect(submit).not.toHaveBeenCalled();
    expect(setFlow).toHaveBeenCalledWith(expect.objectContaining({ kind: 'hex', prompt: expect.objectContaining({ fixedCost: 18 }) }));
  });
});

describe('Actions of everyone else', () => {
  it('are sent straight away, leaving heat out of it', () => {
    const { act, submit, setFlow } = actionsFor(false);

    act.standardProject(asteroid);

    expect(setFlow).not.toHaveBeenCalled();
    expect(submit.mock.calls[0][0].type).toBe('Asteroid');
    expect(submit.mock.calls[0][0].heat).toBeUndefined();
  });
});

describe('HeatSplitForm', () => {
  function renderForm(cost: number) {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<HeatSplitForm title="Asteroid" cost={cost} player={helion} busy={false} onConfirm={onConfirm} onCancel={onCancel} />);
    return { onConfirm, onCancel, user: userEvent.setup() };
  }

  it('starts from the heat that M€ cannot cover', async () => {
    const { onConfirm, user } = renderForm(14);

    // 14 M€ with 10 M€ held: at least 4 heat.
    expect(screen.getByLabelText(/Heat/)).toHaveValue(4);
    expect(screen.getByText('+ 10 M€')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Pay' }));
    expect(onConfirm).toHaveBeenCalledWith(4);
  });

  it('lets the player spend more heat than they have to, up to the cost', async () => {
    const { onConfirm, user } = renderForm(11);

    const heat = screen.getByLabelText(/Heat/);
    await user.clear(heat);
    await user.type(heat, '99');

    // Capped at the cost of 11, which is also within the 12 heat held; the field shows it once it is left.
    await user.tab();
    expect(heat).toHaveValue(11);
    await user.click(screen.getByRole('button', { name: 'Pay' }));
    expect(onConfirm).toHaveBeenCalledWith(11);
  });

  it('can be backed out of', async () => {
    const { onConfirm, onCancel, user } = renderForm(14);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('Buying cards', () => {
  const research = currentPrompt({
    gameOver: false, waitingForOtherPlayer: false, pendingPlayableCards: [],
    buyCards: { availableCards: ['001', '002', '003', '004'], costPerCard: 3 },
  }, helion) as Exclude<Prompt, { kind: 'hex' }>;
  const names = { '001': 'Colonizer Training Camp', '002': 'Asteroid Mining Consortium', '003': 'Deep Well Heating', '004': 'Cloud Seeding' };

  it('lets Helion put heat towards the cards', async () => {
    const onMove = vi.fn();
    const user = userEvent.setup();
    render(<Decision prompt={research} player={helion} spendable={22} names={names} playerNames={{}} busy={false} onMove={onMove} />);

    for (const name of Object.values(names)) await user.click(screen.getByRole('button', { name }));

    // 12 M€ for four cards with 10 M€ held: at least 2 heat.
    const heat = screen.getByRole('spinbutton', { name: /Heat/ });
    expect(heat).toHaveValue(2);
    await user.clear(heat);
    await user.type(heat, '7');
    await user.click(screen.getByRole('button', { name: 'Buy 4 for 12 M€' }));

    expect(onMove).toHaveBeenCalledWith({ type: 'BuyCards', cardIds: ['001', '002', '003', '004'], heat: 7 });
  });

  it('does not mention heat to a player who cannot pay with it', async () => {
    const onMove = vi.fn();
    const user = userEvent.setup();
    render(<Decision prompt={research} player={helion} spendable={10} names={names} playerNames={{}} busy={false} onMove={onMove} />);

    await user.click(screen.getByRole('button', { name: 'Cloud Seeding' }));

    expect(screen.queryByRole('spinbutton', { name: /Heat/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Buy 1 for 3 M€' }));
    expect(onMove).toHaveBeenCalledWith({ type: 'BuyCards', cardIds: ['004'] });
  });

  it('can be tucked away to look at the board and brought back', async () => {
    const user = userEvent.setup();
    render(<Decision prompt={research} player={helion} spendable={10} names={names} playerNames={{}} busy={false} onMove={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /^Hide/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Back to: Buy cards/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('GamePlayPage for a player who may pay with heat', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = () => {};
  });

  it('asks for the heat split once the hex of a standard project is chosen', async () => {
    // The recorded game has no Helion, so the player to move (34 M€, 9 heat) is made able to pay with heat.
    const opening = session[0].table;
    const table: TableResponse = {
      ...opening,
      players: opening.players.map(p => p.playerId === 1 ? { ...p, spendableMegaCredits: 43 } : p),
    };
    const sent: EngineMove[] = [];
    const api = {
      ...recordedEngine(),
      table: async () => table,
      submitMove: async (_gameId: string, move: EngineMove) => {
        sent.push(move);
        return table;
      },
    };
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/play/game-1']}>
        <Routes><Route path="/play/:gameId" element={<GamePlayPage api={api} />} /></Routes>
      </MemoryRouter>,
    );
    await screen.findByRole('link', { name: 'Back to the replay' });

    await user.click(screen.getByRole('button', { name: /^Aquifer/ }));
    await user.click(screen.getByRole('button', { name: 'Place on Hex 5,1' }));

    // 18 M€ is covered by the 34 held, so no heat is needed; the player chooses to spend 9.
    const dialog = screen.getByRole('dialog', { name: 'Aquifer' });
    const heat = within(dialog).getByLabelText(/Heat/);
    expect(heat).toHaveValue(0);
    expect(sent).toHaveLength(0);
    await user.clear(heat);
    await user.type(heat, '9');
    await user.click(within(dialog).getByRole('button', { name: 'Pay' }));

    expect(sent).toEqual([{ type: 'Aquifer', location: { col: 5, row: 1 }, heat: 9, playerId: 1 }]);
  });
});
