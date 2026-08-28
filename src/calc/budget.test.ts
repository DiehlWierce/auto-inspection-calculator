import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, cloneConfig } from '../config';
import { calculateInspection } from './index';
import { resolvePriceRange } from './repairTypes';
import type { Fact, Inspection } from '../types';

function workFact(overrides: Partial<Fact> = {}): Fact {
  return {
    id: 'w1', sequence: 1, kind: 'WORK', category: 'suspension', subcategory: 'Передняя',
    description: 'Стойки и опоры', urgency: 'NOW', status: 'CONFIRMED', comment: '', bodyRisks: [],
    createdAt: '', updatedAt: '', ...overrides,
  };
}

/** Та же вилка, что подставит расчёт: работа подбирается по описанию факта и модели. */
function expectedRange(overrides: Partial<Fact> = {}) {
  return resolvePriceRange(workFact(overrides), DEFAULT_CONFIG, 'corolla-e120')!;
}

function inspection(facts: Fact[], config = cloneConfig(DEFAULT_CONFIG)): Inspection {
  return {
    id: 'i', createdAt: '2026-08-28T00:00:00.000Z', updatedAt: '2026-08-28T00:00:00.000Z',
    status: 'IN_PROGRESS', vehicle: { modelId: 'corolla-e120', year: 2006, mileage: 240000 },
    pricing: { askingPrice: 390000, expectedDiscount: 0 }, facts, eventOverrides: {}, configSnapshot: config,
  };
}

describe('cost source branches', () => {
  it('uses the stated cost with the uncertainty coefficient', () => {
    const result = calculateInspection(inspection([workFact({ statedCost: 20000 })]));
    const fact = result.calculatedFacts[0];
    expect(fact.costSource).toBe('STATED');
    expect(fact.estimatedCost).toBe(20000);
    expect(fact.safeCost).toBe(23000);
    expect(result.unknownCostCount).toBe(0);
    expect(result.estimatedFactsCount).toBe(0);
  });

  it('substitutes the price book range when the cost is empty', () => {
    const result = calculateInspection(inspection([workFact()]));
    const fact = result.calculatedFacts[0];
    const range = expectedRange();
    expect(range.id).toBe('suspension-front-struts');
    expect(fact.costSource).toBe('PRICEBOOK');
    expect(fact.estimatedCost).toBe(range.typical);
    expect(fact.safeCost).toBe(range.max);
    expect(fact.priceRange).toEqual({ min: range.min, typical: range.typical, max: range.max });
  });

  it('marks the fact unknown when the price book has no range at all', () => {
    const config = cloneConfig(DEFAULT_CONFIG);
    config.priceBook = [];
    const result = calculateInspection(inspection([workFact()], config), config);
    expect(result.calculatedFacts[0].costSource).toBe('UNKNOWN');
    expect(result.calculatedFacts[0].safeCost).toBe(0);
    expect(result.unknownCostCount).toBe(1);
  });

  it('hard-blocks only on UNKNOWN, while PRICEBOOK keeps the rating provisional', () => {
    const priced = calculateInspection(inspection([workFact()]));
    expect(priced.rating.hardBlocks).not.toContain('Есть работы без оценимой стоимости.');
    expect(priced.estimatedFactsCount).toBe(1);
    expect(priced.rating.status).toBe('PROVISIONAL');

    const config = cloneConfig(DEFAULT_CONFIG);
    config.priceBook = [];
    const unknown = calculateInspection(inspection([workFact()], config), config);
    expect(unknown.rating.hardBlocks).toContain('Есть работы без оценимой стоимости.');
    expect(unknown.rating.status).toBe('BLOCKED');
  });

  it('aggregates the budget from estimatedCost and safeCost', () => {
    const range = expectedRange();
    const result = calculateInspection(inspection([
      workFact({ id: 'a', statedCost: 20000 }),
      workFact({ id: 'b', sequence: 2, urgency: 'SOON' }),
    ]));
    expect(result.statedRestoreCost).toBe(20000 + range.typical);
    expect(result.immediateSafeRestoreCost).toBe(23000);
    expect(result.fullSafeRestoreCost).toBe(23000 + range.max);
    expect(result.deferredSafeRestoreCost).toBe(range.max);
    expect(result.fullUncertaintyPremium).toBe(23000 + range.max - 20000 - range.typical);
  });

  it('carries a price-book deferred fact into the forecast', () => {
    const range = expectedRange({ urgency: 'SOON' });
    const result = calculateInspection(inspection([workFact({ urgency: 'SOON' })]));
    expect(result.forecast.months[2].deferredFacts).toBe(range.max);
    expect(result.forecast.years[0].deferredFacts).toBe(range.max);
  });
});
