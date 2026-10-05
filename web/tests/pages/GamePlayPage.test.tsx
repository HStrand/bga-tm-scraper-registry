import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { GamePlayPage } from '@/pages/GamePlayPage';
import { gameStartSession, recordedEngine, session } from '../lib/engine/engineFixtures';

// The recorded session starts at generation 4 of an Elysium game with StrandedKnight to move, and goes:
// StrandedKnight plays Protected Habitats and funds Benefactor; cdman234 plays Convoy From Europa paying
// 9 M€ and 2 titanium, takes its effects in order, and places the ocean on hex 5,1.

async function renderGame(state?: unknown, start = 0) {
  const api = recordedEngine(start);
  const view = render(
    <MemoryRouter initialEntries={[{ pathname: '/play/game-1', state }]}>
      <Routes><Route path="/play/:gameId" element={<GamePlayPage api={api} />} /></Routes>
    </MemoryRouter>,
  );
  await screen.findByRole('link', { name: 'Back to the replay' });
  // The box that says whose move it is and what the game is waiting for.
  const turn = view.container.querySelector('[aria-live="polite"]') as HTMLElement;
  return { api, turn, user: userEvent.setup(), ...view };
}

/** Holds a hand card up and plays it. */
async function playFromHand(user: ReturnType<typeof userEvent.setup>, card: RegExp) {
  await user.click(screen.getByRole('button', { name: card }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Play for/ }));
}

describe('GamePlayPage', () => {
  beforeAll(() => {
    // jsdom has no layout, so the move list cannot scroll to the current move.
    Element.prototype.scrollIntoView = () => {};
  });

  it('shows the imported position and who is to move', async () => {
    const { turn } = await renderGame();

    expect(screen.getByText(/Table 824655675, forked after move/)).toBeInTheDocument();
    expect(screen.getByText('-26°C')).toBeInTheDocument();
    expect(screen.getByText('153')).toBeInTheDocument();
    expect(within(turn).getByText('StrandedKnight to move')).toBeInTheDocument();
    expect(within(turn).getByText(/Action 1 of 2/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the replay' })).toHaveAttribute('href', '/replay/824655675?move=106');
  });

  it('shows the hand of the player to move, marking what can be played, and the other actions', async () => {
    await renderGame();

    const hand = screen.getByLabelText("StrandedKnight's hand");
    expect(within(hand).getByRole('button', { name: 'Protected Habitats, playable for 5 M€' })).toBeInTheDocument();
    expect(within(hand).getAllByRole('button', { name: /not playable now$/ }).length).toBeGreaterThan(0);

    expect(screen.getByRole('button', { name: /^Aquifer/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Fund Benefactor (8)' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Pass for this generation' })).toBeEnabled();
    // Nothing has been done this turn, so it cannot simply be ended.
    expect(screen.queryByRole('button', { name: 'End turn' })).not.toBeInTheDocument();
  });

  it('holds a card up to read without playing it', async () => {
    const { api, user } = await renderGame();

    await user.click(screen.getByRole('button', { name: /^Protected Habitats/ }));
    const dialog = screen.getByRole('dialog', { name: 'Protected Habitats' });
    expect(within(dialog).getByRole('button', { name: 'Play for 5 M€' })).toBeEnabled();

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.position()).toBe(0);
  });

  it('plays a turn for each player through to a tile placement', async () => {
    const { api, turn, user } = await renderGame();

    await playFromHand(user, /^Protected Habitats/);
    expect(await within(turn).findByText(/Action 2 of 2/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Fund Benefactor (8)' }));
    expect(await within(turn).findByText('cdman234 to move')).toBeInTheDocument();
    expect(screen.getByLabelText("cdman234's hand")).toBeInTheDocument();

    // Convoy From Europa may be paid for with titanium, so the payment is asked for; the default spends both titanium.
    await playFromHand(user, /^Convoy From Europa/);
    const payment = screen.getByRole('dialog', { name: 'Play Convoy From Europa' });
    expect(within(payment).getByLabelText(/Titanium/)).toHaveValue(2);
    // 9 M€ makes up the rest; it shows in the suggested payment and on the M€ line.
    expect(within(payment).getAllByText('9').length).toBeGreaterThan(0);
    await user.click(within(payment).getByRole('button', { name: 'Pay' }));

    const order = await screen.findByRole('dialog', { name: 'Choose which effect to resolve first' });
    await user.click(within(order).getByRole('button', { name: 'Resolve in the order listed' }));

    expect(await within(turn).findByText(/Place an ocean tile/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Place on Hex 5,1' }));

    // The ocean triggers a draw, which is shown before it silently joins the hand.
    const drawn = await screen.findByRole('dialog', { name: 'Cards drawn' });
    expect(within(drawn).getByRole('button', { name: 'Electro Catapult' })).toBeInTheDocument();
    expect(within(drawn).getByRole('button', { name: 'Windmills' })).toBeInTheDocument();
    await user.click(within(drawn).getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    expect(await screen.findByText('1/9')).toBeInTheDocument();
    expect(api.position()).toBe(5);
    expect(screen.getByText(/plays Convoy From Europa for 9 M€, 2 titanium/)).toBeInTheDocument();
    expect(screen.getByText(/places a tile at hex 5,1/)).toBeInTheDocument();
  });

  it('highlights only the hexes a tile may go on', async () => {
    const { turn, user } = await renderGame();

    expect(screen.queryAllByRole('button', { name: /^Place on / })).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /^Aquifer/ }));

    // Elysium has twelve ocean hexes and none is taken yet.
    expect(screen.getAllByRole('button', { name: /^Place on / })).toHaveLength(12);
    expect(within(turn).getByText(/Aquifer: choose a hex/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryAllByRole('button', { name: /^Place on / })).toHaveLength(0);
  });

  it('says so when the engine refuses a move, and stays on the position', async () => {
    const { api, turn, user } = await renderGame();

    // The recorded session does not continue with a pass, so the stand-in engine refuses it.
    await user.click(screen.getByRole('button', { name: 'Pass for this generation' }));

    expect(await within(turn).findByRole('alert')).toBeInTheDocument();
    expect(api.position()).toBe(0);
    expect(screen.getByRole('button', { name: /^Protected Habitats/ })).toBeInTheDocument();
  });

  it('looks back at an earlier position without offering moves there', async () => {
    const { turn, user } = await renderGame();
    await playFromHand(user, /^Protected Habitats/);
    await within(turn).findByText(/Action 2 of 2/);

    await user.click(screen.getByRole('button', { name: 'Starting position' }));

    expect(await within(turn).findByText(/Looking back at move 0 of 1/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fund Benefactor (8)' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/'s hand$/)).not.toBeInTheDocument();

    await user.click(within(turn).getByRole('button', { name: 'Back to the current position' }));
    expect(await screen.findByRole('button', { name: 'Fund Benefactor (8)' })).toBeEnabled();
  });

  it('drafts with a confirmed pick, and takes the last card of a round by itself', async () => {
    // Move 27 of the recording: the third draft round, two cards each; cdman234 picks first.
    const { api, user } = await renderGame(undefined, 27);

    const draft = screen.getByRole('dialog', { name: 'Draft a card' });
    expect(within(draft).getByText('cdman234')).toBeInTheDocument();
    expect(within(draft).getByRole('button', { name: /^Draft/ })).toBeDisabled();

    await user.click(within(draft).getByRole('button', { name: 'Olympus Conference' }));
    expect(api.position()).toBe(27);
    expect(within(draft).getByRole('button', { name: 'Olympus Conference' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(draft).getByRole('button', { name: 'Draft Olympus Conference' }));

    const second = await screen.findByRole('dialog', { name: 'Draft a card' });
    expect(await within(second).findByText('StrandedKnight')).toBeInTheDocument();
    await user.click(within(second).getByRole('button', { name: 'GHG Producing Bacteria' }));
    await user.click(within(second).getByRole('button', { name: 'Draft GHG Producing Bacteria' }));

    // Each player is left with one card, which is drafted for them; the research purchase follows.
    expect(await screen.findByRole('dialog', { name: 'Buy cards for 3 M€ each' })).toBeInTheDocument();
    expect(api.position()).toBe(31);
  });

  it('plays the opening from the deal: corporation, preludes and cards for each player, then the preludes', async () => {
    // The recording: cdman234 starts as Credicor, StrandedKnight as Point Luna, then cdman234 plays a prelude.
    const [dealt, first, second, prelude] = gameStartSession;
    const names = { ...dealt.table.cardNames, ...second.table.cardNames };
    const api = recordedEngine(0, gameStartSession);
    render(
      <MemoryRouter initialEntries={['/play/game-start']}>
        <Routes><Route path="/play/:gameId" element={<GamePlayPage api={api} />} /></Routes>
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    const title = 'Choose a corporation, preludes and opening cards';
    const opening = (move = first.move!) => move.type === 'Setup' ? move : null!;
    const pick = async (dialog: HTMLElement, cardIds: string[]) => {
      for (const id of cardIds) await user.click(within(dialog).getByRole('button', { name: names[id] }));
    };

    // cdman234 chooses first. Nothing can be confirmed until a corporation and two preludes are picked.
    const cdman = await screen.findByRole('dialog', { name: title });
    expect(screen.getByText(/Table 824655675, played again from the opening deal/)).toBeInTheDocument();
    expect(within(cdman).getByText('cdman234')).toBeInTheDocument();
    expect(within(cdman).getByRole('button', { name: 'Start' })).toBeDisabled();

    await pick(cdman, [opening().corporationId]);
    expect(within(cdman).getByText('Keep 2 preludes.')).toBeInTheDocument();
    await pick(cdman, [...opening().preludeIds, ...opening().cardIdsToBuy]);
    expect(within(cdman).getByText('54 M€')).toBeInTheDocument();
    await user.click(within(cdman).getByRole('button', { name: 'Start as Credicor' }));

    // StrandedKnight was dealt Phobolog too, whose 23 M€ do not stretch to eight cards.
    const stranded = await screen.findByRole('dialog', { name: title });
    expect(await within(stranded).findByText('StrandedKnight')).toBeInTheDocument();
    const mine = opening(second.move!);
    const twoMore = dealt.table.legalMoves['1'].setup!.availableCards.filter(id => !mine.cardIdsToBuy.includes(id)).slice(0, 2);
    await pick(stranded, ['CORP07', ...mine.preludeIds, ...mine.cardIdsToBuy, ...twoMore]);
    expect(within(stranded).getByText('8 cards cost 24 M€; Phobolog starts with 23.')).toBeInTheDocument();
    expect(within(stranded).getByRole('button', { name: 'Start as Phobolog' })).toBeDisabled();

    await pick(stranded, [mine.corporationId, ...twoMore]);
    await user.click(within(stranded).getByRole('button', { name: 'Start as Point Luna' }));

    // Point Luna draws a card for its own Earth tag. The cards the players bought are not shown as draws.
    const drawn = await screen.findByRole('dialog', { name: 'Cards drawn' });
    expect(within(drawn).getByRole('button', { name: 'Tundra Farming' })).toBeInTheDocument();
    expect(within(drawn).queryByRole('button', { name: names[mine.cardIdsToBuy[0]] })).not.toBeInTheDocument();
    await user.click(within(drawn).getByRole('button', { name: 'OK' }));

    expect(screen.getByText(/starts as Credicor with .*, buying 1 card$/)).toBeInTheDocument();
    expect(screen.getByLabelText("cdman234's board")).toHaveTextContent('Credicor');

    // The preludes are played one at a time, starting with the first player's.
    const preludes = screen.getByRole('dialog', { name: 'Play a prelude' });
    const playedId = prelude.move!.type === 'PlayPrelude' ? prelude.move!.preludeId : '';
    const played = names[playedId];
    expect(within(preludes).getAllByRole('button', { pressed: false })).toHaveLength(2);
    await pick(preludes, [playedId]);
    await user.click(within(preludes).getByRole('button', { name: `Play ${played}` }));

    expect(await screen.findByText(new RegExp(`plays the prelude ${played}`))).toBeInTheDocument();
    expect(api.position()).toBe(3);
  });

  it('shows the score breakdown when the game is over, and brings it back after it is closed', async () => {
    // The opening position of the recording, as it would stand had the game ended there.
    const { table } = session[0];
    const finished = { ...table, state: { ...table.state, phase: 'GameEnd' as const }, legalMoves: {} };
    const api = { ...recordedEngine(), table: async () => finished };
    const view = render(
      <MemoryRouter initialEntries={['/play/game-1']}>
        <Routes><Route path="/play/:gameId" element={<GamePlayPage api={api} />} /></Routes>
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    const [first, second] = [...table.players].sort((a, b) => b.points.total - a.points.total);
    const name = (seat: number) => table.meta!.seats.find(s => s.seat === seat)!.name;

    expect(await screen.findByText('Game Over')).toBeInTheDocument();
    expect(screen.getByText('Winner:')).toHaveTextContent(`Winner: ${name(first.playerId)}`);
    // One row per player, best first, with terraform rating, milestones, awards, greeneries, cities and cards.
    for (const heading of ['TR', 'Miles.', 'Awards', 'Green.', 'Cities', 'Cards', 'Total']) {
      expect(screen.getByText(heading)).toBeInTheDocument();
    }
    expect(screen.getAllByText(String(first.points.total)).length).toBeGreaterThan(0);

    await user.click(screen.getByTitle('Close'));
    expect(screen.queryByText('Game Over')).not.toBeInTheDocument();

    const turn = view.container.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(within(turn).getByText(`Game over — ${name(first.playerId)} wins`)).toBeInTheDocument();
    expect(within(turn).getByText(`${second.points.total} VP`)).toBeInTheDocument();

    await user.click(within(turn).getByRole('button', { name: 'Score breakdown' }));
    expect(screen.getByText('Game Over')).toBeInTheDocument();
  });

  it('copies a link that deals a fresh game from the starting position, not a link to this game', async () => {
    const { user } = await renderGame();
    const { source, shuffleSeed } = session[0].table.meta!;

    await user.click(screen.getByRole('button', { name: 'Share starting position' }));

    expect(await screen.findByRole('button', { name: 'Link copied' })).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(
      `${window.location.origin}/play/new?table=${source.tableId}&move=${source.moveIndex}&seed=${shuffleSeed}`);
  });

  it('shows what the importer warned about', async () => {
    await renderGame({ issues: [{ severity: 'Warning', code: 'SCORE_MISMATCH', message: "cdman234's Capital is worth 2 on BGA but 0 in the engine." }] });

    expect(screen.getByText(/Capital is worth 2 on BGA but 0 in the engine/)).toBeInTheDocument();
  });
});
