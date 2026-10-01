import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { PlayFromHere, nearestForkPoint } from '@/components/play/PlayFromHere';
import { EngineError, type EngineApi } from '@/lib/engine/client';
import { forkPointsFixture, importFixture, recordedEngine } from '../../lib/engine/engineFixtures';

const playerNames = { '98490496': 'cdman234', '86296239': 'StrandedKnight' };

// In the fixture game, generation 4's action phase starts after move index 105 (BGA move 106).
const generation4 = forkPointsFixture.forkPoints.find(f => f.generation === 4 && f.kind === 'GenerationStart')!;

// As for a log from before the scraper recorded what each player was dealt: nothing in generation 1.
const fromGeneration2 = { ...forkPointsFixture, forkPoints: forkPointsFixture.forkPoints.filter(f => f.generation > 1) };

function Landed() {
  const location = useLocation();
  return <p>Arrived at {location.pathname} with {(location.state as { issues: unknown[] }).issues.length} issues</p>;
}

function renderButton(moveIndex: number, api: Partial<EngineApi> = {}) {
  const engine = { ...recordedEngine(), ...api } as EngineApi;
  render(
    <MemoryRouter initialEntries={['/replay/824655675']}>
      <Routes>
        <Route path="/replay/:tableId" element={<PlayFromHere tableId="824655675" moveIndex={moveIndex} playerNames={playerNames} api={engine} />} />
        <Route path="/play/:gameId" element={<Landed />} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe('nearestForkPoint', () => {
  it('picks the last fork point at or before the move', () => {
    expect(nearestForkPoint(forkPointsFixture.forkPoints, generation4.moveIndex)).toBe(generation4);
    expect(nearestForkPoint(forkPointsFixture.forkPoints, generation4.moveIndex - 1)!.generation).toBe(3);
  });

  it('goes back to the opening deal while the preludes are being played', () => {
    // In the fixture game the last prelude is move index 8.
    expect(nearestForkPoint(forkPointsFixture.forkPoints, 0)!.kind).toBe('GameStart');
    expect(nearestForkPoint(forkPointsFixture.forkPoints, 7)!.kind).toBe('GameStart');
    expect(nearestForkPoint(forkPointsFixture.forkPoints, 8)).toMatchObject({ kind: 'GenerationStart', generation: 1 });
  });

  it('finds none before the first fork point', () => {
    expect(nearestForkPoint(fromGeneration2.forkPoints, 10)).toBeUndefined();
  });
});

describe('PlayFromHere', () => {
  it('says where the game resumes and starts it there', async () => {
    const importBga = vi.fn(async () => importFixture);
    const user = renderButton(generation4.moveIndex, { importBga });

    await user.click(screen.getByRole('button', { name: 'Play from here' }));

    expect(await screen.findByText('the start of generation 4')).toBeInTheDocument();
    expect(screen.queryByText(/before the position shown/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Play' }));

    expect(importBga).toHaveBeenCalledWith('824655675', generation4.moveIndex);
    expect(await screen.findByText('Arrived at /play/game-1 with 0 issues')).toBeInTheDocument();
  });

  it('explains when the game can only be picked up earlier than the position shown', async () => {
    // Three moves into generation 5's draft: the nearest position is the last action of generation 4.
    const generation5 = forkPointsFixture.forkPoints.find(f => f.generation === 5)!;
    const lastOfGeneration4 = forkPointsFixture.forkPoints.filter(f => f.generation === 4).at(-1)!;
    const shown = generation5.moveIndex - 3;
    const user = renderButton(shown);

    await user.click(screen.getByRole('button', { name: 'Play from here' }));

    expect(await screen.findByText(/next action in generation 4/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`That is ${shown - lastOfGeneration4.moveIndex} moves? before the position shown`))).toBeInTheDocument();
  });

  it('picks generation 1 up in the middle, once the preludes are played', async () => {
    const importBga = vi.fn(async () => importFixture);
    // cdman234 has played Nuclear Zone (move indices 9-11) and is about to play his second card.
    const user = renderButton(12, { importBga });

    await user.click(screen.getByRole('button', { name: 'Play from here' }));

    expect(await screen.findByText("cdman234's next action in generation 1")).toBeInTheDocument();
    expect(screen.getByText(/That is 1 move before the position shown/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play from the opening deal' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Play' }));

    expect(importBga).toHaveBeenCalledWith('824655675', 11);
  });

  it('names the start of generation 1 as the point after the preludes', async () => {
    const user = renderButton(8);

    await user.click(screen.getByRole('button', { name: 'Play from here' }));

    expect(await screen.findByText('the start of generation 1, once the preludes are played')).toBeInTheDocument();
  });

  it('starts over from the opening deal while the preludes are being played', async () => {
    const importBga = vi.fn(async () => importFixture);
    const user = renderButton(5, { importBga });

    await user.click(screen.getByRole('button', { name: 'Play from here' }));

    expect(await screen.findByText('the opening deal')).toBeInTheDocument();
    expect(screen.getByText(/That is 5 moves before the position shown: until the preludes are played, the game can only be picked up from the deal/)).toBeInTheDocument();
    // The one button already starts from the deal.
    expect(screen.queryByRole('button', { name: 'Play from the opening deal' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Play' }));

    expect(importBga).toHaveBeenCalledWith('824655675', 0);
  });

  it('offers the opening deal from later positions as well', async () => {
    const importBga = vi.fn(async () => importFixture);
    const user = renderButton(generation4.moveIndex, { importBga });

    await user.click(screen.getByRole('button', { name: 'Play from here' }));
    await user.click(await screen.findByRole('button', { name: 'Play from the opening deal' }));

    expect(importBga).toHaveBeenCalledWith('824655675', 0);
  });

  it('offers the earliest position when generation 1 cannot be picked up at all', async () => {
    // A log from before the scraper recorded what each player was dealt.
    const user = renderButton(10, { forkPoints: async () => fromGeneration2 });

    await user.click(screen.getByRole('button', { name: 'Play from here' }));

    expect(await screen.findByText(/can be picked up from generation 2 onwards/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play from the earliest position' })).toBeInTheDocument();
  });

  it('says why a game cannot be played on', async () => {
    const forkPoints = async () => ({
      eligible: false,
      forkPoints: [],
      issues: [{ severity: 'Blocking' as const, code: 'UNSUPPORTED_MAP', message: "Map 'Vastitas Borealis' is not supported by the engine." }],
    });
    const user = renderButton(200, { forkPoints });

    await user.click(screen.getByRole('button', { name: 'Play from here' }));

    expect(await screen.findByText("Map 'Vastitas Borealis' is not supported by the engine.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play from the earliest position' })).not.toBeInTheDocument();
  });

  it('says so when the engine cannot be reached', async () => {
    const forkPoints = async () => { throw new EngineError('The game engine could not be reached.', null); };
    const user = renderButton(200, { forkPoints });

    await user.click(screen.getByRole('button', { name: 'Play from here' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The game engine could not be reached.');
  });
});
