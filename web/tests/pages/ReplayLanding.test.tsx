import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom';
import { parseTableId } from '@/lib/tableId';

const get = vi.fn();
const post = vi.fn();
vi.mock('@/lib/api', () => ({ api: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) } }));

import { ReplayLandingPage } from '@/pages/ReplayLandingPage';
import { GameReplayPage } from '@/pages/GameReplayPage';

describe('parseTableId', () => {
  it.each([
    ['926358228', '926358228'],
    ['  926358228 ', '926358228'],
    ['#926358228', '926358228'],
    ['926 358 228', '926358228'],
    ['https://boardgamearena.com/table?table=926358228', '926358228'],
    ['boardgamearena.com/gamereview?table=926358228', '926358228'],
    ['https://boardgamearena.com/archive/replay/260930-1321/?table=926358228&player=86296239&comments=86296239', '926358228'],
  ])('finds the table id in %s', (input, expected) => {
    expect(parseTableId(input)).toBe(expected);
  });

  it.each(['', 'hello', '12345', 'https://boardgamearena.com/player?id=86296239', '1234567890123'])(
    'finds none in %j',
    input => {
      expect(parseTableId(input)).toBeNull();
    },
  );
});

function Opened() {
  return <p>opened {useParams().tableId}</p>;
}

function renderLanding() {
  return render(
    <MemoryRouter initialEntries={['/replay']}>
      <Routes>
        <Route path="/replay" element={<ReplayLandingPage />} />
        <Route path="/replay/:tableId" element={<Opened />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ReplayLandingPage', () => {
  it('opens the replay for a pasted BGA link', async () => {
    renderLanding();

    await userEvent.type(screen.getByLabelText('Table ID or game link'), 'https://boardgamearena.com/table?table=926358228{Enter}');

    expect(await screen.findByText('opened 926358228')).toBeInTheDocument();
  });

  it('says what is wrong when there is no table id in the text', async () => {
    renderLanding();

    await userEvent.type(screen.getByLabelText('Table ID or game link'), 'my last game');
    await userEvent.click(screen.getByRole('button', { name: /open replay/i }));

    expect(screen.getByRole('alert')).toHaveTextContent("doesn't contain a table ID");
    expect(screen.queryByText(/^opened/)).not.toBeInTheDocument();
  });
});

function renderReplay(tableId: string) {
  return render(
    <MemoryRouter initialEntries={[`/replay/${tableId}`]}>
      <Routes>
        <Route path="/replay/:tableId" element={<GameReplayPage />} />
        <Route path="/replay" element={<p>landing</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('a table with no stored replay', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/game-log/')) throw { response: { status: 404 } };
      return { data: {} };
    });
  });

  it('fetches the game with only the table id', async () => {
    post.mockResolvedValue({ data: {} });
    renderReplay('926358228');

    await userEvent.click(await screen.findByRole('button', { name: 'Fetch this game' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/scrape', { tableId: '926358228' }));
    expect(screen.queryByPlaceholderText(/player id/i)).not.toBeInTheDocument();
  });

  it('waits to be asked when the address was opened directly', async () => {
    renderReplay('926358228');

    await screen.findByRole('button', { name: 'Fetch this game' });

    expect(post).not.toHaveBeenCalled();
  });

  it('fetches without asking when the game was opened from the landing page', async () => {
    let finish: (value: unknown) => void = () => {};
    post.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(
      <MemoryRouter initialEntries={['/replay']}>
        <Routes>
          <Route path="/replay" element={<ReplayLandingPage />} />
          <Route path="/replay/:tableId" element={<GameReplayPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText('Table ID or game link'), '926358228{Enter}');

    expect(await screen.findByText('Fetching this game from Board Game Arena')).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/api/scrape', { tableId: '926358228' });
    finish({ data: {} });
    // Still not stored after the fetch: it is offered again, not fetched a second time.
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('explains a game BGA does not return', async () => {
    post.mockRejectedValue({ response: { status: 422, data: { detail: 'Failed to scrape table page' } } });
    renderReplay('926358228');

    await userEvent.click(await screen.findByRole('button', { name: 'Fetch this game' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Board Game Arena didn't return this game");
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('offers no fetch when the daily limit is reached', async () => {
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/game-log/')) throw { response: { status: 404 } };
      if (url === '/api/scrape-health') return { data: { dailyLimitReached: true } };
      return { data: {} };
    });
    renderReplay('926358228');

    expect(await screen.findByText(/today's limit/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fetch this game' })).not.toBeInTheDocument();
  });

  it('does not offer to fetch something that is not a table id', async () => {
    renderReplay('abc');

    expect(await screen.findByText("That isn't a table ID")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fetch this game' })).not.toBeInTheDocument();
  });
});
