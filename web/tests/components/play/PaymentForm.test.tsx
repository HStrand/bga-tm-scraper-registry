import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaymentForm } from '@/components/play/PaymentForm';
import type { PaymentRules } from '@/lib/engine/payment';
import type { EnginePlayer } from '@/lib/engine/types';

const player: EnginePlayer = {
  playerId: 0, corporationId: 'CORP01', terraformRating: 20,
  resources: { megaCredits: 33, steel: 6, titanium: 2, plants: 0, energy: 0, heat: 0 },
  production: { megaCredits: 0, steel: 0, titanium: 0, plants: 0, energy: 0, heat: 0 },
  hand: [], playedCards: [], playedEvents: [], cardResources: {}, usedCardActions: [], passed: false, actionsThisTurn: 0,
};

// Space Elevator: 25 M€, building and space tags, so both metals count.
const spaceElevator: PaymentRules = { cost: 25, steelValue: 3, titaniumValue: 4, canUseHeat: false, cardResourceValues: {} };

function renderForm(rules = spaceElevator, who = player) {
  const onConfirm = vi.fn();
  render(<PaymentForm title="Play Space Elevator" rules={rules} player={who} names={{}} busy={false} onConfirm={onConfirm} onCancel={vi.fn()} />);
  return { onConfirm, user: userEvent.setup() };
}

describe('PaymentForm', () => {
  it('starts from the suggested payment: metal first, M€ for the rest', async () => {
    const { onConfirm, user } = renderForm();

    expect(screen.getByLabelText('Titanium')).toHaveValue(2);
    expect(screen.getByLabelText('Steel')).toHaveValue(5);
    expect(screen.getByText('Pays 25 M€')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Pay' }));
    expect(onConfirm).toHaveBeenCalledWith({ megaCredits: 2, steel: 5, titanium: 2, heat: 0, cardResources: null });
  });

  it('changes an amount with the minus and plus buttons, and M€ makes up the difference', async () => {
    const { onConfirm, user } = renderForm();

    await user.click(screen.getByRole('button', { name: 'Less steel' }));
    await user.click(screen.getByRole('button', { name: 'Less steel' }));
    await user.click(screen.getByRole('button', { name: 'Less titanium' }));

    expect(screen.getByLabelText('Steel')).toHaveValue(3);
    await user.click(screen.getByRole('button', { name: 'Pay' }));
    expect(onConfirm).toHaveBeenCalledWith({ megaCredits: 12, steel: 3, titanium: 1, heat: 0, cardResources: null });
  });

  it('does not go past what the player holds', async () => {
    const { user } = renderForm();

    expect(screen.getByRole('button', { name: 'More titanium' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'More steel' }));
    expect(screen.getByLabelText('Steel')).toHaveValue(6);
    expect(screen.getByRole('button', { name: 'More steel' })).toBeDisabled();
  });

  it('says when the payment is more than the cost', async () => {
    const { user } = renderForm();

    await user.click(screen.getByRole('button', { name: 'More steel' }));

    // 2 titanium (8) + 6 steel (18) = 26 for a cost of 25.
    expect(screen.getByText(/1 more than needed/)).toBeInTheDocument();
  });

  it('offers paying in M€ alone when the player can', async () => {
    const { onConfirm, user } = renderForm();

    await user.click(screen.getByRole('button', { name: /M€ only/ }));

    expect(screen.getByLabelText('Titanium')).toHaveValue(0);
    expect(screen.getByLabelText('Steel')).toHaveValue(0);
    await user.click(screen.getByRole('button', { name: 'Pay' }));
    expect(onConfirm).toHaveBeenCalledWith({ megaCredits: 25, steel: 0, titanium: 0, heat: 0, cardResources: null });

    await user.click(screen.getByRole('button', { name: /Suggested/ }));
    expect(screen.getByLabelText('Steel')).toHaveValue(5);
  });

  it('refuses a payment the player cannot make', async () => {
    const poor = { ...player, resources: { ...player.resources, megaCredits: 5 } };
    const { user } = renderForm(spaceElevator, poor);

    await user.click(screen.getByRole('button', { name: 'Less steel' }));
    await user.click(screen.getByRole('button', { name: 'Less steel' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Only 5 M€ available.');
    expect(screen.getByRole('button', { name: 'Pay' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /M€ only/ })).not.toBeInTheDocument();
  });

  it('lets an amount be typed', async () => {
    const { onConfirm, user } = renderForm();

    const steel = screen.getByLabelText('Steel');
    await user.clear(steel);
    await user.type(steel, '1');
    await user.click(screen.getByRole('button', { name: 'Pay' }));

    expect(onConfirm).toHaveBeenCalledWith({ megaCredits: 14, steel: 1, titanium: 2, heat: 0, cardResources: null });
  });
});
