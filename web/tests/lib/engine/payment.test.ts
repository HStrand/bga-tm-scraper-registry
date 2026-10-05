import { describe, it, expect } from 'vitest';
import {
  defaultPayment, hasPaymentChoice, heatRange, hexPlacementCost, paymentProblem, paymentValue, type PaymentRules,
} from '@/lib/engine/payment';
import type { EnginePlayer } from '@/lib/engine/types';

function player(resources: Partial<EnginePlayer['resources']>, cardResources: Record<string, number> = {}): EnginePlayer {
  const zero = { megaCredits: 0, steel: 0, titanium: 0, plants: 0, energy: 0, heat: 0 };
  return {
    playerId: 0, corporationId: 'CORP01', terraformRating: 20,
    resources: { ...zero, ...resources }, production: zero,
    hand: [], playedCards: [], playedEvents: [], cardResources, usedCardActions: [], passed: false, actionsThisTurn: 0,
  };
}

const rules = (overrides: Partial<PaymentRules>): PaymentRules =>
  ({ cost: 0, steelValue: 0, titaniumValue: 0, canUseHeat: false, cardResourceValues: {}, ...overrides });

describe('defaultPayment', () => {
  it('pays in MC when nothing else may be used', () => {
    expect(defaultPayment(rules({ cost: 12 }), player({ megaCredits: 20, steel: 5, titanium: 5 })))
      .toEqual({ megaCredits: 12, steel: 0, titanium: 0, heat: 0, cardResources: null });
  });

  it('spends titanium before MC without overpaying', () => {
    // 15 = 3 titanium x 3 (capped at 2 owned) + 9 MC
    expect(defaultPayment(rules({ cost: 15, titaniumValue: 3 }), player({ megaCredits: 20, titanium: 2 })))
      .toMatchObject({ megaCredits: 9, titanium: 2 });
    // 10 = 3 titanium x 3 + 1 MC, not 4 titanium
    expect(defaultPayment(rules({ cost: 10, titaniumValue: 3 }), player({ megaCredits: 20, titanium: 5 })))
      .toMatchObject({ megaCredits: 1, titanium: 3 });
  });

  it('overpays with metal when MC cannot cover the remainder', () => {
    // 7 with steel worth 2: three steel leave 1 MC, which the player does not have.
    expect(defaultPayment(rules({ cost: 7, steelValue: 2 }), player({ megaCredits: 0, steel: 6 })))
      .toMatchObject({ megaCredits: 0, steel: 4 });
  });

  it('uses heat only for what MC cannot cover', () => {
    expect(defaultPayment(rules({ cost: 23, canUseHeat: true }), player({ megaCredits: 13, heat: 14 })))
      .toMatchObject({ megaCredits: 13, heat: 10 });
    expect(defaultPayment(rules({ cost: 10, canUseHeat: true }), player({ megaCredits: 13, heat: 14 })))
      .toMatchObject({ megaCredits: 10, heat: 0 });
  });

  it('spends resources from cards that may pay for it', () => {
    const payment = defaultPayment(rules({ cost: 9, cardResourceValues: { P39: 2 } }), player({ megaCredits: 5 }, { P39: 3 }));

    expect(payment).toMatchObject({ megaCredits: 3, cardResources: { P39: 3 } });
  });
});

describe('paymentProblem', () => {
  const titaniumCard = rules({ cost: 15, titaniumValue: 3 });

  it('accepts a payment that covers the cost', () => {
    const p = player({ megaCredits: 9, titanium: 2 });
    expect(paymentProblem({ megaCredits: 9, steel: 0, titanium: 2, heat: 0 }, titaniumCard, p)).toBeNull();
    expect(paymentValue({ megaCredits: 9, steel: 0, titanium: 2, heat: 0 }, titaniumCard)).toBe(15);
  });

  it('says how much is missing', () => {
    expect(paymentProblem({ megaCredits: 5, steel: 0, titanium: 2, heat: 0 }, titaniumCard, player({ megaCredits: 9, titanium: 2 })))
      .toBe('4 M€ short.');
  });

  it('refuses to spend more than the player has', () => {
    expect(paymentProblem({ megaCredits: 0, steel: 0, titanium: 5, heat: 0 }, titaniumCard, player({ titanium: 2 })))
      .toBe('Only 2 titanium available.');
  });
});

describe('hasPaymentChoice', () => {
  it('is false when only MC can be spent', () => {
    expect(hasPaymentChoice(rules({ cost: 10, titaniumValue: 3 }), player({ megaCredits: 10, steel: 4 }))).toBe(false);
  });

  it('is true when the player holds a usable resource', () => {
    expect(hasPaymentChoice(rules({ cost: 10, titaniumValue: 3 }), player({ megaCredits: 10, titanium: 1 }))).toBe(true);
    expect(hasPaymentChoice(rules({ cost: 10, canUseHeat: true }), player({ megaCredits: 10, heat: 1 }))).toBe(true);
  });
});

describe('heatRange', () => {
  it('needs at least what M€ cannot cover and allows at most the cost', () => {
    expect(heatRange(14, player({ megaCredits: 10, heat: 20 }))).toEqual({ min: 4, max: 14 });
  });

  it('allows no more heat than the player holds', () => {
    expect(heatRange(14, player({ megaCredits: 30, heat: 5 }))).toEqual({ min: 0, max: 5 });
  });
});

describe('hexPlacementCost', () => {
  it('charges 6 M€ for the Hellas South Pole and nothing anywhere else', () => {
    expect(hexPlacementCost('Hellas', { col: 5, row: 9 })).toBe(6);
    expect(hexPlacementCost('Hellas', { col: 4, row: 9 })).toBe(0);
    expect(hexPlacementCost('Tharsis', { col: 5, row: 9 })).toBe(0);
  });

  it('charges 4 M€ for the centre hex of Vastitas Borealis', () => {
    expect(hexPlacementCost('Vastitas Borealis', { col: 5, row: 5 })).toBe(4);
    expect(hexPlacementCost('Vastitas Borealis', { col: 5, row: 9 })).toBe(0);
    expect(hexPlacementCost('Hellas', { col: 5, row: 5 })).toBe(0);
  });
});
