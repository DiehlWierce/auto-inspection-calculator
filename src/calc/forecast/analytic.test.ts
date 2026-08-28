import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, cloneConfig } from '../../config';
import { calculateInspection } from '../index';
import { triangularMoments, wearMultiplier } from './model';
import type { AppConfig, Inspection, RepairEvent } from '../../types';

function inspection(overrides: Partial<Inspection> = {}, config = cloneConfig(DEFAULT_CONFIG)): Inspection {
  return {
    id: 'forecast-test', createdAt: '2026-08-28T00:00:00.000Z', updatedAt: '2026-08-28T00:00:00.000Z',
    status: 'IN_PROGRESS', vehicle: { modelId: 'corolla-e120', year: 2006, mileage: 240000 },
    pricing: { askingPrice: 390000, expectedDiscount: 0 }, facts: [], eventOverrides: {},
    configSnapshot: config, ...overrides,
  };
}

function onlyEvent(event: RepairEvent): { config: AppConfig; inspection: Inspection } {
  const config = cloneConfig(DEFAULT_CONFIG);
  config.repairEvents = [];
  return { config, inspection: inspection({ configSnapshot: config, customEvents: [event] }, config) };
}

const baseEvent: RepairEvent = {
  id: 'e1', modelIds: ['corolla-e120'], category: 'suspension', name: 'Событие',
  probability5y: 0.5, repairCost: 10000, coefficient: 1.2, maxCost: 15000,
  monthStart: 1, monthEnd: 60, mode: 'RISK',
};

describe('triangular cost moments', () => {
  it('matches the closed-form mean and variance', () => {
    const { mean, variance, min, mode, max } = triangularMoments(10000, 1.2, 15000);
    expect(min).toBe(10000);
    expect(mode).toBe(12000);
    expect(max).toBe(15000);
    expect(mean).toBeCloseTo((10000 + 12000 + 15000) / 3, 6);
    expect(variance).toBeCloseTo((10000 ** 2 + 15000 ** 2 + 12000 ** 2 - 10000 * 15000 - 10000 * 12000 - 15000 * 12000) / 18, 4);
  });

  it('degenerates safely when min equals max', () => {
    const { mean, variance, moment3 } = triangularMoments(5000, 1, 5000);
    expect(mean).toBe(5000);
    expect(variance).toBe(0);
    expect(moment3).toBe(5000 ** 3);
  });
});

describe('wear multiplier', () => {
  it('stays at one below the reference age and mileage', () => {
    expect(wearMultiplier(5, 100000, DEFAULT_CONFIG.wear)).toBe(1);
  });

  it('grows with age and mileage and is capped', () => {
    const { wear } = DEFAULT_CONFIG;
    expect(wearMultiplier(20, 240000, wear)).toBeGreaterThan(wearMultiplier(12, 160000, wear));
    expect(wearMultiplier(100, 5000000, wear)).toBe(wear.maxMultiplier);
  });
});

describe('analytic forecast', () => {
  it('is deterministic without a seed', () => {
    const first = calculateInspection(inspection(), undefined, { withRisk: false });
    const second = calculateInspection(inspection(), undefined, { withRisk: false });
    expect(second.forecast.years.map((year) => year.expectedTotal)).toEqual(first.forecast.years.map((year) => year.expectedTotal));
    expect(second.forecast.months.map((month) => month.p80Total)).toEqual(first.forecast.months.map((month) => month.p80Total));
  });

  it('keeps a recurrent event spending in every one of the five years', () => {
    const { config, inspection: subject } = onlyEvent({ ...baseEvent, probability5y: 0.5, recurrenceMonths: 12 });
    const result = calculateInspection(subject, config, { withRisk: false });
    for (const year of result.forecast.years) expect(year.expectedRepairs).toBeGreaterThan(0);
    expect(result.forecast.expectedRecurringSpend5y).toBeGreaterThan(0);
    expect(result.forecast.expectedOneShotSpend5y).toBe(0);
  });

  it('lets a one-shot event decay after its first occurrence', () => {
    const { config, inspection: subject } = onlyEvent({ ...baseEvent, probability5y: 0.9, recurrenceMonths: 0 });
    const result = calculateInspection(subject, config, { withRisk: false });
    const months = result.forecast.months.map((month) => month.expectedRepairs);
    expect(months[59]).toBeLessThan(months[0]);
    expect(result.forecast.expectedOneShotSpend5y).toBeGreaterThan(0);
    expect(result.forecast.expectedRecurringSpend5y).toBe(0);
  });

  it('orders the percentiles p90 >= p80 >= p50 >= 0', () => {
    const result = calculateInspection(inspection(), undefined, { withRisk: false });
    for (const month of result.forecast.months) {
      expect(month.p50Total).toBeGreaterThanOrEqual(0);
      expect(month.p80Total).toBeGreaterThanOrEqual(month.p50Total);
      expect(month.p90Total).toBeGreaterThanOrEqual(month.p80Total);
    }
    for (const year of result.forecast.years) {
      expect(year.p80Total).toBeGreaterThanOrEqual(year.expectedTotal - 1);
      expect(year.p90Total).toBeGreaterThanOrEqual(year.p80Total);
    }
  });

  it('spends more on an older car with a higher mileage', () => {
    const fresh = calculateInspection(inspection({ vehicle: { modelId: 'corolla-e120', year: 2018, mileage: 90000 } }), undefined, { withRisk: false });
    const worn = calculateInspection(inspection({ vehicle: { modelId: 'corolla-e120', year: 2002, mileage: 320000 } }), undefined, { withRisk: false });
    expect(worn.forecast.years[4].expectedRepairs).toBeGreaterThan(fresh.forecast.years[4].expectedRepairs);
    expect(worn.forecast.totalCost).toBeGreaterThan(fresh.forecast.totalCost);
  });

  it('places a scheduled repair exactly in its month', () => {
    const { config, inspection: subject } = onlyEvent({ ...baseEvent, mode: 'SCHEDULED', scheduledMonth: 5, monthStart: 5, monthEnd: 5, probability5y: 1 });
    const result = calculateInspection(subject, config, { withRisk: false });
    expect(result.forecast.months[4].scheduledEvents).toBe(12000);
    expect(result.forecast.months[3].scheduledEvents).toBe(0);
    expect(result.forecast.months[4].expectedRepairs).toBe(0);
    expect(result.forecast.years[0].expectedRepairs).toBe(12000);
  });

  it('matches the sum of monthly means against the five-year event spend', () => {
    const result = calculateInspection(inspection(), undefined, { withRisk: false });
    const monthlyRepairs = result.forecast.months.reduce((sum, month) => sum + month.expectedRepairs, 0);
    expect(monthlyRepairs).toBeCloseTo(result.forecast.expectedRecurringSpend5y + result.forecast.expectedOneShotSpend5y, 6);
    const monthlyTotal = result.forecast.months.reduce((sum, month) => sum + month.expectedTotal, 0);
    expect(monthlyTotal).toBeCloseTo(result.forecast.totalCost, 4);
  });

  it('keeps the analytic layer free of the simulation', () => {
    const result = calculateInspection(inspection(), undefined, { withRisk: false });
    expect(result.forecast.riskPending).toBe(true);
    expect(result.forecast.probabilityAnyMajorRepair).toBeNull();
    expect(result.forecast.probabilityEngineEvent).toBeGreaterThan(0);
    expect(result.rating.status).toBe('PROVISIONAL');
    expect(result.rating.components.find((component) => component.id === 'annual-risk')?.score).toBeNull();
  });
});
