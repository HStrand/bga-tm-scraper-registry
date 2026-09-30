import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { GamePlayPage } from '@/pages/GamePlayPage';
import { recordedEngine } from '../lib/engine/engineFixtures';

// The recorded session starts at generation 4 of an Elysium game with StrandedKnight to move, and goes:
// StrandedKnight plays Protected Habitats and funds Benefactor; cdman234 plays Convoy From Europa paying
// 9 M€ and 2 titanium, takes its effects in order, and places the ocean on hex 5,1.

async function renderGame(state?: unknown) {
  const api = recordedEngine();
  const view = render(
    <MemoryRouter initialEntries={[{ pathname: '/play/game-1', state }]}>
      <Routes><Route path="/play/:gameId" element={<GamePlayPage api={api} />} /></Routes>
    </MemoryRouter>,
  );
  await screen.findByText(/Playing on from table 824655675/);
  const panel = view.container.querySelector('[aria-live="polite"]') as HTMLElement;
  return { api, panel, user: userEvent.setup(), ...view };
}

describe('GamePlayPage', () => {
  beforeAll(() => {
    // jsdom has no layout, so the move list cannot scroll to the current move.
    Element.prototype.scrollIntoView = () => {};
  });

  it('shows the imported position and who is to move', async () => {
    const { panel } = await renderGame();

    expect(screen.getByText('Gen 4')).toBeInTheDocument();
    expect(screen.getByText('-26°C')).toBeInTheDocument();
    expect(screen.getByText('153')).toBeInTheDocument();
    expect(within(panel).getByText('StrandedKnight')).toBeInTheDocument();
    expect(within(panel).getByText(/to move/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the replay' })).toHaveAttribute('href', '/replay/824655675?move=106');
  });

  it('offers the cards the player can play, with their cost, and the rest of the action menu', async () => {
    const { panel } = await renderGame();

    const habitats = within(panel).getByRole('button', { name: /Protected Habitats/ });
    expect(habitats).toHaveTextContent('5');
    expect(within(panel).getByRole('button', { name: 'Aquifer (18)' })).toBeEnabled();
    expect(within(panel).getByRole('button', { name: 'Fund Benefactor (8)' })).toBeEnabled();
    expect(within(panel).getByRole('button', { name: 'Pass for this generation' })).toBeEnabled();
    // Nothing has been done this turn, so it cannot simply be ended.
    expect(within(panel).queryByRole('button', { name: 'End turn' })).not.toBeInTheDocument();
  });

  it('plays a turn for each player through to a tile placement', async () => {
    const { api, panel, user } = await renderGame();

    await user.click(within(panel).getByRole('button', { name: /Protected Habitats/ }));
    expect(await within(panel).findByText(/second action/)).toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: 'Fund Benefactor (8)' }));
    expect(await within(panel).findByText('cdman234')).toBeInTheDocument();

    // Convoy From Europa may be paid for with titanium, so the payment is asked for; the default spends both titanium.
    await user.click(within(panel).getByRole('button', { name: /Convoy From Europa/ }));
    expect(within(panel).getByLabelText(/Titanium/)).toHaveValue(2);
    expect(within(panel).getByText('9')).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Pay' }));

    expect(await within(panel).findByText('Choose which effect to resolve first')).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Resolve in the order listed' }));

    expect(await within(panel).findByText('Place an ocean tile')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Place on Hex 5,1' }));

    expect(await screen.findByText('1/9')).toBeInTheDocument();
    expect(api.position()).toBe(5);
    expect(screen.getByText(/plays Convoy From Europa for 9 M€, 2 titanium/)).toBeInTheDocument();
    expect(screen.getByText(/places a tile at hex 5,1/)).toBeInTheDocument();
  });

  it('highlights only the hexes a tile may go on', async () => {
    const { panel, user } = await renderGame();

    expect(screen.queryAllByRole('button', { name: /^Place on / })).toHaveLength(0);

    await user.click(within(panel).getByRole('button', { name: 'Aquifer (18)' }));

    // Elysium has twelve ocean hexes and none is taken yet.
    expect(screen.getAllByRole('button', { name: /^Place on / })).toHaveLength(12);
    expect(within(panel).getByText('Aquifer: choose a hex')).toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryAllByRole('button', { name: /^Place on / })).toHaveLength(0);
  });

  it('says so when the engine refuses a move, and stays on the position', async () => {
    const { api, panel, user } = await renderGame();

    // The recorded session does not continue with a pass, so the stand-in engine refuses it.
    await user.click(within(panel).getByRole('button', { name: 'Pass for this generation' }));

    expect(await within(panel).findByRole('alert')).toBeInTheDocument();
    expect(api.position()).toBe(0);
    expect(within(panel).getByRole('button', { name: /Protected Habitats/ })).toBeInTheDocument();
  });

  it('looks back at an earlier position without offering moves there', async () => {
    const { panel, user } = await renderGame();
    await user.click(within(panel).getByRole('button', { name: /Protected Habitats/ }));
    await within(panel).findByText(/second action/);

    await user.click(screen.getByRole('button', { name: 'Starting position' }));

    expect(await within(panel).findByText(/Looking back at move 0 of 1/)).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Fund Benefactor (8)' })).not.toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: 'Back to the current position' }));
    expect(await within(panel).findByRole('button', { name: 'Fund Benefactor (8)' })).toBeInTheDocument();
  });

  it('shows what the importer warned about', async () => {
    await renderGame({ issues: [{ severity: 'Warning', code: 'SCORE_MISMATCH', message: "cdman234's Capital is worth 2 on BGA but 0 in the engine." }] });

    expect(screen.getByText(/Capital is worth 2 on BGA but 0 in the engine/)).toBeInTheDocument();
  });
});
