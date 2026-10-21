import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { NewGamePage } from '@/pages/NewGamePage';
import { EngineError, type EngineApi } from '@/lib/engine/client';
import { parseStartLink, startLinkPath } from '@/lib/engine/startLink';
import { importFixture, recordedEngine } from '../lib/engine/engineFixtures';

function open(link: string, api: Partial<EngineApi>) {
  return render(
    <MemoryRouter initialEntries={[link]}>
      <Routes>
        <Route path="/play" element={<NewGamePage api={{ ...recordedEngine(), ...api } as EngineApi} />} />
      </Routes>
    </MemoryRouter>,
  );
}

const elysiumStart = startLinkPath({ tableId: '824655675', moveIndex: 105, seed: 7 });

describe('NewGamePage', () => {
  beforeEach(() => {
    localStorage.clear();
    Element.prototype.scrollIntoView = () => {};
  });

  it('deals a game from the position and seed in the link, and shows it at the same address', async () => {
    const importBga = vi.fn(async () => importFixture);

    open(elysiumStart, { importBga });

    expect(screen.getByText(/Dealing a fresh game/)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Back to the replay' })).toBeInTheDocument();
    expect(importBga).toHaveBeenCalledTimes(1);
    expect(importBga).toHaveBeenCalledWith('824655675', 105, 7);
    expect(localStorage.getItem('tfm.play.824655675.105.7')).toBe('game-1');
  });

  it('resumes the game this browser already plays from the position instead of dealing another', async () => {
    localStorage.setItem('tfm.play.824655675.105.7', 'game-1');
    const importBga = vi.fn(async () => importFixture);

    open(elysiumStart, { importBga });

    expect(await screen.findByRole('link', { name: 'Back to the replay' })).toBeInTheDocument();
    expect(importBga).not.toHaveBeenCalled();
  });

  it('deals again on request, forgetting the game it had', async () => {
    localStorage.setItem('tfm.play.824655675.105.7', 'game-1');
    const importBga = vi.fn(async () => ({ ...importFixture, gameId: 'game-2' }));
    open(elysiumStart, { importBga });
    await screen.findByRole('link', { name: 'Back to the replay' });

    await userEvent.setup().click(screen.getByRole('button', { name: 'Deal again' }));

    expect(await screen.findByRole('link', { name: 'Back to the replay' })).toBeInTheDocument();
    expect(importBga).toHaveBeenCalledWith('824655675', 105, 7);
    expect(localStorage.getItem('tfm.play.824655675.105.7')).toBe('game-2');
  });

  it('says why the game could not be started, and offers the replay', async () => {
    const importBga = async () => { throw new EngineError('That is enough new games for today; try again tomorrow.', 429); };

    open('/play?table=923733148&move=0&seed=7', { importBga });

    expect(await screen.findByRole('alert')).toHaveTextContent('That is enough new games for today');
    expect(screen.getByRole('link', { name: 'Open the replay instead' })).toHaveAttribute('href', '/replay/923733148');
  });

  it('refuses a link that does not name a starting position', () => {
    const importBga = vi.fn(async () => importFixture);

    open('/play?table=923733148', { importBga });

    expect(screen.getByRole('alert')).toHaveTextContent('This link does not name a starting position.');
    expect(importBga).not.toHaveBeenCalled();
  });
});

describe('start links', () => {
  it('round-trip a starting position, negative seeds included', () => {
    const start = { tableId: '923733148', moveIndex: 12, seed: -42 };
    const path = startLinkPath(start);

    expect(path).toBe('/play?table=923733148&move=12&seed=-42');
    expect(parseStartLink(path.slice(path.indexOf('?')))).toEqual(start);
  });

  it('reject incomplete or malformed links', () => {
    expect(parseStartLink('?table=1&move=0')).toBeNull();
    expect(parseStartLink('?table=1&move=x&seed=3')).toBeNull();
    expect(parseStartLink('?move=0&seed=3')).toBeNull();
    expect(parseStartLink('?table=1&move=-1&seed=3')).toBeNull();
  });
});
