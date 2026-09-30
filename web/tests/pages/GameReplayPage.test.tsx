import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TEST_LOGS, testdataAvailable, loadTestLog } from '../lib/replay/testLogs';

let gameLog: unknown = null;

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(async (url: string) => {
      if (url.startsWith('/api/game-log/')) return { data: gameLog };
      if (url.startsWith('/api/comments/')) return { data: [] };
      return { data: {} };
    }),
    post: vi.fn(async () => ({ data: {} })),
  },
}));

import { GameReplayPage } from '@/pages/GameReplayPage';

async function renderReplayAt(move: number) {
  const view = render(
    <MemoryRouter initialEntries={[`/replay/824655675?move=${move}`]}>
      <Routes><Route path="/replay/:tableId" element={<GameReplayPage />} /></Routes>
    </MemoryRouter>,
  );
  await screen.findByText(/Table 824655675/);
  return view;
}

describe.skipIf(!testdataAvailable)('GameReplayPage', () => {
  beforeAll(() => {
    gameLog = loadTestLog(TEST_LOGS[1].file);
    // jsdom has no layout, so the move log cannot scroll to the current move.
    Element.prototype.scrollIntoView = () => {};
  });

  it('shows the position after the move given in the URL', async () => {
    await renderReplayAt(200);

    expect(screen.getByText('Gen 6')).toBeInTheDocument();
    expect(screen.getByText('-20°C')).toBeInTheDocument();
    expect(screen.getByText('1%')).toBeInTheDocument();
    expect(screen.getByText('2/9')).toBeInTheDocument();
    expect(screen.getByText('124')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
  });

  it('shows each player with their score, rating and resources', async () => {
    const { container } = await renderReplayAt(200);

    const panels = Array.from(container.querySelectorAll('.glass-panel.cursor-pointer')).map(card => card.parentElement!);
    expect(panels).toHaveLength(2);
    const mine = panels.find(p => within(p).queryAllByText('StrandedKnight').length > 0)!;

    expect(within(mine).getAllByText('Point Luna').length).toBeGreaterThan(0);
    // Victory points on the compact card, terraform rating on the badge next to the hand count.
    expect(within(mine).getAllByText('22').length).toBeGreaterThan(0);
    expect(within(mine).getByAltText('MC: 14 (prod: 19)')).toBeInTheDocument();
    expect(within(mine).getByAltText('Heat: 11 (prod: 3)')).toBeInTheDocument();
  });

  it('draws the tiles placed so far on the map', async () => {
    const { container } = await renderReplayAt(200);

    const board = container.querySelector('svg.absolute.top-0')!;
    const tileImages = Array.from(board.querySelectorAll('image')).map(i => i.getAttribute('href') ?? '');

    expect(tileImages.filter(href => href.includes('ocean')).length).toBe(2);
    expect(tileImages.filter(href => href.includes('city')).length).toBe(3);
  });
});
