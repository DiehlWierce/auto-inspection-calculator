import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, cloneConfig } from '../../config';
import { calculateInspection } from '../index';
import { forecastHash } from './index';
import { cachedRisk } from './simulate';
import type { Inspection } from '../../types';

function inspection(overrides: Partial<Inspection> = {}): Inspection {
  return {
    id: 'sim-test', createdAt: '2026-08-28T00:00:00.000Z', updatedAt: '2026-08-28T00:00:00.000Z',
    status: 'IN_PROGRESS', vehicle: { modelId: 'corolla-e120', year: 2006, mileage: 240000 },
    pricing: { askingPrice: 390000, expectedDiscount: 0 }, facts: [], eventOverrides: {},
    configSnapshot: cloneConfig(DEFAULT_CONFIG), ...overrides,
  };
}

describe('risk simulation', () => {
  it('reproduces the same probabilities for the same inputs', () => {
    const first = calculateInspection(inspection());
    const second = calculateInspection(inspection());
    expect(second.forecast.probabilityCloseMajorRepairs).toBe(first.forecast.probabilityCloseMajorRepairs);
    expect(second.forecast.probabilityAnyLimitViolation).toBe(first.forecast.probabilityAnyLimitViolation);
    expect(second.forecast.probabilityCriticalRepair).toBe(first.forecast.probabilityCriticalRepair);
    expect(second.rating.score).toBe(first.rating.score);
  });

  it('hashes equal inputs to the same key and different inputs apart', () => {
    const config = cloneConfig(DEFAULT_CONFIG);
    const base = forecastHash(inspection(), config);
    expect(forecastHash(inspection(), config)).toBe(base);
    expect(forecastHash(inspection({ vehicle: { modelId: 'corolla-e120', year: 2012, mileage: 240000 } }), config)).not.toBe(base);
    expect(forecastHash(inspection({ eventOverrides: { 'brakes-full': { enabled: false } } }), config)).not.toBe(base);
  });

  it('serves a repeated request from the memo cache', () => {
    const subject = inspection({ id: 'cache-test' });
    const config = subject.configSnapshot;
    calculateInspection(subject, config);
    const cached = cachedRisk(forecastHash(subject, config));
    expect(cached).not.toBeNull();
    expect(calculateInspection(inspection({ id: 'cache-test-2' }), cloneConfig(DEFAULT_CONFIG)).forecast.probabilityAnyMajorRepair).toBe(cached!.probabilityAnyMajorRepair);
  });

  it('fills every risk field once the simulation has run', () => {
    const result = calculateInspection(inspection());
    expect(result.forecast.riskPending).toBe(false);
    expect(result.forecast.probabilityAnyMajorRepair).not.toBeNull();
    expect(result.forecast.years.every((year) => year.probabilityLimitViolation !== null)).toBe(true);
  });

  it('reports no risk at all when every event is disabled', () => {
    const config = cloneConfig(DEFAULT_CONFIG);
    config.repairEvents = [];
    const result = calculateInspection(inspection({ configSnapshot: config }), config);
    expect(result.forecast.probabilityAnyMajorRepair).toBe(0);
    expect(result.forecast.probabilityCriticalRepair).toBe(0);
    expect(result.forecast.probabilityCloseMajorRepairs).toBe(0);
  });

  it('keeps the simulated major-repair chance in step with the analytic mean', () => {
    const config = cloneConfig(DEFAULT_CONFIG);
    config.repairEvents = config.repairEvents.filter((event) => event.id === 'corolla-engine');
    const result = calculateInspection(inspection({ configSnapshot: config }), config);
    expect(result.forecast.probabilityAnyMajorRepair).toBeGreaterThan(0.1);
    expect(result.forecast.probabilityAnyMajorRepair).toBeLessThan(0.3);
  });
});
