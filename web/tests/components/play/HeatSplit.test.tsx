import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ActionMenu } from '@/components/play/ActionMenu';
import { PromptView } from '@/components/play/PromptView';
import { currentPrompt } from '@/lib/engine/prompts';
import type { ActionPhaseOptions, EngineMove, EnginePlayer, TableResponse } from '@/lib/engine/types';
import { GamePlayPage } from '@/pages/GamePlayPage';
import { recordedEngine, session } from '../../lib/engine/engineFixtures';

// Helion may pay any cost in M€ with heat. Moves without a payment of their own then carry how much heat to use.

const helion: EnginePlayer = {
  playerId: 0, corporationId: 'CORP03', terraformRating: 20,
  resources: { megaCredits: 10, steel: 0, titanium: 0, plants: 0, energy: 0, heat: 12 },
  production: { megaCredits: 0, steel: 0, titanium: 0, plants: 0, energy: 0, heat: 0 },
  hand: [], playedCards: [], playedEvents: [], cardResources: {}, usedCardActions: [], passed: false, actionsThisTurn: 0,
};

const actions: ActionPhaseOptions = {
  canPass: true, canEndTurn: false, canConvertHeat: true, canConvertPlants: false, plantConversionCost: 8,
  validGreeneryLocations: [], canPerformFirstAction: false, playableCards: [],
  standardProjects: [
    { project: 'PowerPlant', available: true, cost: 11 },
    { project: 'Asteroid', available: true, cost: 14 },
  ],
  claimableMilestones: [{ name: 'Terraformer' }],
  fundableAwards: [{ name: 'Banker', cost: 8 }],
  usableCardActions: [{ cardId: '199', allowSteel: false, allowTitanium: false, canUseHeat: false, mcCost: 2, steelValue: 0, titaniumValue: 0 }],
};

function renderMenu(canPayWithHeat: boolean) {
  const onMove = vi.fn();
  render(
    <ActionMenu
      actions={actions} player={helion} names={{ '199': 'Restricted Area' }} canPayWithHeat={canPayWithHeat}
      busy={false} onMove={onMove} onChooseHex={vi.fn()}
    />,
  );
  return { onMove, user: userEvent.setup() };
}

describe('ActionMenu for a player who may pay with heat', () => {
  it('asks how much heat to spend, starting from what M€ cannot cover', async () => {
    const { onMove, user } = renderMenu(true);

    await user.click(screen.getByRole('button', { name: 'Asteroid (14)' }));

    // 14 M€ with 10 M€ held: at least 4 heat.
    const heat = screen.getByLabelText(/Heat/);
    expect(heat).toHaveValue(4);
    expect(screen.getByText('+ 10 M€')).toBeInTheDocument();
    expect(onMove).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Pay' }));
    expect(onMove).toHaveBeenCalledWith({ type: 'Asteroid', heat: 4 });
  });

  it('lets the player spend more heat than they have to, up to the cost', async () => {
    const { onMove, user } = renderMenu(true);
    await user.click(screen.getByRole('button', { name: 'Power plant (11)' }));

    const heat = screen.getByLabelText(/Heat/);
    await user.clear(heat);
    await user.type(heat, '99');

    // Capped at the cost of 11, which is also within the 12 heat held; the field shows it once it is left.
    await user.tab();
    expect(heat).toHaveValue(11);
    await user.click(screen.getByRole('button', { name: 'Pay' }));
    expect(onMove).toHaveBeenCalledWith({ type: 'PowerPlant', heat: 11 });
  });

  it.each([
    ['Claim Terraformer', { type: 'ClaimMilestone', milestoneName: 'Terraformer', heat: 0 }],
    ['Fund Banker (8)', { type: 'FundAward', awardName: 'Banker', heat: 0 }],
    ['Restricted Area', { type: 'UseCardAction', cardId: '199', heat: 0 }],
  ])('asks for milestones, awards and M€ card actions too: %s', async (button, expected) => {
    const { onMove, user } = renderMenu(true);

    await user.click(screen.getByRole('button', { name: button }));
    // 10 M€ covers all of these, so no heat is needed unless the player wants to spend it.
    expect(screen.getByLabelText(/Heat/)).toHaveValue(0);
    await user.click(screen.getByRole('button', { name: 'Pay' }));

    expect(onMove).toHaveBeenCalledWith(expected);
  });

  it('can be backed out of', async () => {
    const { onMove, user } = renderMenu(true);

    await user.click(screen.getByRole('button', { name: 'Asteroid (14)' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Asteroid (14)' })).toBeInTheDocument();
    expect(onMove).not.toHaveBeenCalled();
  });
});

describe('ActionMenu for everyone else', () => {
  it('sends the move straight away, leaving heat out of it', async () => {
    const { onMove, user } = renderMenu(false);

    await user.click(screen.getByRole('button', { name: 'Asteroid (14)' }));

    expect(screen.queryByLabelText(/Heat/)).not.toBeInTheDocument();
    expect(onMove.mock.calls[0][0].type).toBe('Asteroid');
    expect(onMove.mock.calls[0][0].heat).toBeUndefined();
  });
});

describe('Buying cards', () => {
  const research = currentPrompt({
    gameOver: false, waitingForOtherPlayer: false, pendingPlayableCards: [],
    buyCards: { availableCards: ['001', '002', '003', '004'], costPerCard: 3 },
  }, helion)!;
  const names = { '001': 'Colonizer Training Camp', '002': 'Asteroid Mining Consortium', '003': 'Deep Well Heating', '004': 'Cloud Seeding' };

  it('lets Helion put heat towards the cards', async () => {
    const onMove = vi.fn();
    const user = userEvent.setup();
    render(<PromptView prompt={research} player={helion} spendable={22} names={names} playerNames={{}} busy={false} onMove={onMove} />);

    for (const name of Object.values(names)) await user.click(screen.getByRole('button', { name }));

    // 12 M€ for four cards with 10 M€ held: at least 2 heat.
    const heat = screen.getByLabelText(/Heat/);
    expect(heat).toHaveValue(2);
    await user.clear(heat);
    await user.type(heat, '7');
    await user.click(screen.getByRole('button', { name: 'Buy 4 for 12 M€' }));

    expect(onMove).toHaveBeenCalledWith({ type: 'BuyCards', cardIds: ['001', '002', '003', '004'], heat: 7 });
  });

  it('does not mention heat to a player who cannot pay with it', async () => {
    const onMove = vi.fn();
    const user = userEvent.setup();
    render(<PromptView prompt={research} player={helion} spendable={10} names={names} playerNames={{}} busy={false} onMove={onMove} />);

    await user.click(screen.getByRole('button', { name: 'Cloud Seeding' }));

    expect(screen.queryByLabelText(/Heat/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Buy 1 for 3 M€' }));
    expect(onMove).toHaveBeenCalledWith({ type: 'BuyCards', cardIds: ['004'] });
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
    const { container } = render(
      <MemoryRouter initialEntries={['/play/game-1']}>
        <Routes><Route path="/play/:gameId" element={<GamePlayPage api={api} />} /></Routes>
      </MemoryRouter>,
    );
    await screen.findByText(/Playing on from table 824655675/);
    const panel = container.querySelector('[aria-live="polite"]') as HTMLElement;

    await user.click(within(panel).getByRole('button', { name: 'Aquifer (18)' }));
    await user.click(screen.getByRole('button', { name: 'Place on Hex 5,1' }));

    // 18 M€ is covered by the 34 held, so no heat is needed; the player chooses to spend 9.
    const heat = within(panel).getByLabelText(/Heat/);
    expect(heat).toHaveValue(0);
    expect(sent).toHaveLength(0);
    await user.clear(heat);
    await user.type(heat, '9');
    await user.click(within(panel).getByRole('button', { name: 'Pay' }));

    expect(sent).toEqual([{ type: 'Aquifer', location: { col: 5, row: 1 }, heat: 9, playerId: 1 }]);
  });
});
