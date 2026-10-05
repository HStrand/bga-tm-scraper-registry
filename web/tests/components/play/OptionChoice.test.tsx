import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardResourceBurst, diffCardResources } from '@/components/play/CardResourceBurst';
import { Decision } from '@/components/play/Decision';
import { ArtIconImage } from '@/components/play/OptionChoice';
import { optionArt } from '@/lib/engine/optionArt';
import { currentPrompt, type Prompt } from '@/lib/engine/prompts';
import type { EnginePlayer } from '@/lib/engine/types';

const player: EnginePlayer = {
  playerId: 0, corporationId: 'CORP01', terraformRating: 20,
  resources: { megaCredits: 10, steel: 0, titanium: 0, plants: 0, energy: 0, heat: 0 },
  production: { megaCredits: 0, steel: 0, titanium: 0, plants: 0, energy: 0, heat: 0 },
  hand: [], playedCards: ['034'], playedEvents: [], cardResources: { '034': 3 }, usedCardActions: [], passed: false, actionsThisTurn: 0,
};

describe('optionArt', () => {
  it.each([
    ['Add 1 microbe', { spend: [], gain: [{ icon: 'microbe', amount: 1 }], where: undefined }],
    ['Add 1 science resource', { spend: [], gain: [{ icon: 'science', amount: 1 }], where: undefined }],
    ['Add 2 animals to another card', { spend: [], gain: [{ icon: 'animal', amount: 2 }], where: 'another card' }],
    ['Remove 2 microbes to raise temperature', { spend: [{ icon: 'microbe', amount: 2 }], gain: [{ icon: 'temperature', amount: 1 }] }],
    ['Remove 2 microbes to raise oxygen', { spend: [{ icon: 'microbe', amount: 2 }], gain: [{ icon: 'oxygen', amount: 1 }] }],
    ['Remove 3 microbes to gain 1 TR', { spend: [{ icon: 'microbe', amount: 3 }], gain: [{ icon: 'tr', amount: 1 }] }],
    ['Remove 1 science resource to draw a card', { spend: [{ icon: 'science', amount: 1 }], gain: [{ icon: 'card', amount: 1 }] }],
    ['Remove up to 5 plants from any player', { spend: [{ icon: 'plant', amount: 5, upTo: true }], gain: [], where: 'any player' }],
    ['Spend 1 steel for 7 MC', { spend: [{ icon: 'steel', amount: 1 }], gain: [{ icon: 'mc', amount: 7 }] }],
    ['Gain 3 plants', { spend: [], gain: [{ icon: 'plant', amount: 3 }] }],
    ['Increase energy production 2 steps', { spend: [], gain: [{ icon: 'energy', amount: 2, production: true }] }],
  ])('reads %s', (label, expected) => {
    expect(optionArt(label)).toEqual(expected);
  });

  it('leaves texts it does not recognise alone', () => {
    expect(optionArt('Resolve in the order listed')).toBeNull();
    expect(optionArt('Add 1 gizmo')).toBeNull();
  });
});

describe('A choice that comes from a card', () => {
  const prompt = currentPrompt({
    gameOver: false, waitingForOtherPlayer: false, pendingPlayableCards: [],
    pendingAction: {
      type: 'ChooseOption', description: 'Choose one:', sourceCardId: '034',
      options: ['Add 1 microbe', 'Remove 2 microbes to raise temperature'],
    },
  }, player) as Exclude<Prompt, { kind: 'hex' }>;

  it('shows the card with what is on it, and sends the option that is clicked', async () => {
    const onMove = vi.fn();
    const user = userEvent.setup();
    render(<Decision prompt={prompt} player={player} spendable={10} names={{ '034': 'GHG Producing Bacteria' }} playerNames={{}} busy={false} onMove={onMove} />);

    expect(screen.getByAltText('GHG Producing Bacteria')).toBeInTheDocument();
    expect(screen.getByTitle('3 on GHG Producing Bacteria')).toBeInTheDocument();

    // The buttons keep the engine's wording as their name; the icons are decoration.
    await user.click(screen.getByRole('button', { name: 'Remove 2 microbes to raise temperature' }));
    expect(onMove).toHaveBeenCalledWith({ type: 'ChooseOption', optionIndex: 1 });
  });
});

describe('ArtIconImage', () => {
  it.each(['tr', 'temperature', 'oxygen', 'card', 'microbe', 'science', 'mc'] as const)('has a picture for %s', icon => {
    const { container } = render(<ArtIconImage icon={icon} />);

    expect(container.querySelector('img')?.getAttribute('src')).toBeTruthy();
  });
});

describe('diffCardResources', () => {
  it('lists the cards whose count changed, for every player', () => {
    const other: EnginePlayer = { ...player, playerId: 1, cardResources: { '024': 2 } };
    const after = [
      { ...player, cardResources: { '034': 1, '185': 1 } },
      { ...other, cardResources: {} },
    ];

    expect(diffCardResources([player, other], after)).toEqual([
      { cardId: '034', playerId: 0, from: 3, to: 1 },
      { cardId: '185', playerId: 0, from: 0, to: 1 },
      { cardId: '024', playerId: 1, from: 2, to: 0 },
    ]);
    expect(diffCardResources([player, other], [player, other])).toEqual([]);
  });
});

describe('CardResourceBurst', () => {
  afterEach(() => vi.useRealTimers());

  it('shows the count as it was, then as it is, then goes away', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<CardResourceBurst changes={[{ cardId: '034', playerId: 0, from: 3, to: 1 }]} names={{ '034': 'GHG Producing Bacteria' }} onDone={onDone} />);

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryByText('−2')).not.toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(600); });
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('−2')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(2500); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
