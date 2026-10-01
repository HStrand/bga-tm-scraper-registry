import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { NewGamePage } from '@/pages/NewGamePage';
import { EngineError, type EngineApi } from '@/lib/engine/client';
import { parseStartLink, startLinkPath } from '@/lib/engine/startLink';
import { importFixture, recordedEngine } from '../lib/engine/engineFixtures';

function Landed() {
  const location = useLocation();
  return <p>Arrived at {location.pathname} with {(location.state as { issues: unknown[] }).issues.length} issues</p>;
}

function open(link: string, api: Partial<EngineApi>) {
  render(
    <MemoryRouter initialEntries={[link]}>
      <Routes>
        <Route path="/play/new" element={<NewGamePage api={{ ...recordedEngine(), ...api } as EngineApi} />} />
        <Route path="/play/:gameId" element={<Landed />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('NewGamePage', () => {
  it('deals a game from the position and seed in the link, and moves on to it', async () => {
    const importBga = vi.fn(async () => importFixture);

    open(startLinkPath({ tableId: '923733148', moveIndex: 0, seed: 1975472173 }), { importBga });

    expect(screen.getByText(/Dealing a fresh game/)).toBeInTheDocument();
    expect(await screen.findByText('Arrived at /play/game-1 with 0 issues')).toBeInTheDocument();
    expect(importBga).toHaveBeenCalledTimes(1);
    expect(importBga).toHaveBeenCalledWith('923733148', 0, 1975472173);
  });

  it('says why the game could not be started, and offers the replay', async () => {
    const importBga = async () => { throw new EngineError('That is enough new games for today; try again tomorrow.', 429); };

    open('/play/new?table=923733148&move=0&seed=7', { importBga });

    expect(await screen.findByRole('alert')).toHaveTextContent('That is enough new games for today');
    expect(screen.getByRole('link', { name: 'Open the replay instead' })).toHaveAttribute('href', '/replay/923733148');
  });

  it('refuses a link that does not name a starting position', () => {
    const importBga = vi.fn(async () => importFixture);

    open('/play/new?table=923733148', { importBga });

    expect(screen.getByRole('alert')).toHaveTextContent('This link does not name a starting position.');
    expect(importBga).not.toHaveBeenCalled();
  });
});

describe('start links', () => {
  it('round-trip a starting position, negative seeds included', () => {
    const start = { tableId: '923733148', moveIndex: 12, seed: -42 };
    const path = startLinkPath(start);

    expect(path).toBe('/play/new?table=923733148&move=12&seed=-42');
    expect(parseStartLink(path.slice(path.indexOf('?')))).toEqual(start);
  });

  it('reject incomplete or malformed links', () => {
    expect(parseStartLink('?table=1&move=0')).toBeNull();
    expect(parseStartLink('?table=1&move=x&seed=3')).toBeNull();
    expect(parseStartLink('?move=0&seed=3')).toBeNull();
    expect(parseStartLink('?table=1&move=-1&seed=3')).toBeNull();
  });
});
