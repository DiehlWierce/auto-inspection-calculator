import { describe, expect, it } from 'vitest';
import { calculateInspection } from '../calc';
import { normalizeConfig } from './normalize';
import type { AppConfig, Inspection } from '../types';

const LEGACY_CONFIG = {
  id: 'current', version: 'seed-2026-08-27', fund: 500000, maxAskingPrice: 465000, targetPurchasePrice: 400000,
  greenReserveRatio: 0.2, yellowReserveRatio: 0.1, majorRepairThreshold: 25000, criticalRepairThreshold: 120000,
  majorRepairsPerYearLimit: 4, minMonthsBetweenMajorRepairs: 3, simulationScenarios: 20000, simulationSeed: 20260827,
  ratingWeights: { budget: 20, ownership: 20, annualRisk: 10, frequency: 10, maxRepair: 10, engine: 10, transmission: 10, predictability: 5, service: 5, vehicleInfo: 5 },
  scenario: { years: 5, annualKm: 12000, fuelPrice: 71, insuranceByYear: [40000, 40000, 40000, 40000, 40000], serviceByYear: [28000, 28000, 28000, 28000, 28000], fluidsByYear: [8000, 8000, 8000, 8000, 8000], consumablesByYear: [10000, 10000, 10000, 10000, 10000], tiresByYear: [14000, 14000, 14000, 14000, 14000], washingByYear: [12000, 12000, 12000, 12000, 12000], finesByYear: [3000, 3000, 3000, 3000, 3000], annualLimit: 300000 },
  models: [{ id: 'corolla-e120', isBuiltIn: true, make: 'Toyota', model: 'Corolla', generation: 'E120', engine: '1.6', transmission: 'AT', engineVariants: [{ id: '3zz-fe', label: '3ZZ-FE', code: '3ZZ-FE', timingDrive: 'CHAIN' }], consumptionLPer100Km: 8.5, taxAnnual: 2400, repairEventIds: ['corolla-engine'] }],
  coefficients: [{ id: 'suspension', category: 'suspension', label: 'Подвеска', coefficient: 1.15 }],
  repairEvents: [{ id: 'corolla-engine', modelIds: ['corolla-e120'], category: 'engine', name: 'Серьёзный ремонт двигателя', probability5y: 0.15, repairCost: 90000, coefficient: 1.25, maxCost: 150000, monthStart: 24, monthEnd: 60 }],
  templates: [],
} as unknown as AppConfig;

const LEGACY_INSPECTION = {
  id: 'legacy-1', createdAt: '2026-08-27T10:00:00.000Z', updatedAt: '2026-08-27T10:00:00.000Z', status: 'FINISHED_CANDIDATE',
  vehicle: { modelId: 'corolla-e120', year: 2006, mileage: 250000 },
  pricing: { askingPrice: 380000, expectedDiscount: 10000 },
  facts: [{ id: 'f1', sequence: 1, kind: 'WORK', category: 'suspension', subcategory: 'Передняя', description: 'Стойки', statedCost: 18000, urgency: 'NOW', status: 'CONFIRMED', comment: '', bodyRisks: [], createdAt: '', updatedAt: '' }],
  eventOverrides: {}, configSnapshot: LEGACY_CONFIG,
} as unknown as Inspection;

describe('importing a backup written before the price book and the wear model', () => {
  it('fills the missing config blocks in', () => {
    const config = normalizeConfig(LEGACY_CONFIG);
    expect(config.priceBook.length).toBeGreaterThan(0);
    expect(config.wear.maxMultiplier).toBeGreaterThan(1);
    expect(config.repairEvents.every((event) => event.recurrenceMonths !== undefined && event.ageSensitive !== undefined)).toBe(true);
  });

  it('keeps the stored event catalogue untouched apart from the new fields', () => {
    const config = normalizeConfig(LEGACY_CONFIG);
    expect(config.repairEvents).toHaveLength(1);
    expect(config.repairEvents[0].id).toBe('corolla-engine');
    expect(config.repairEvents[0].recurrenceMonths).toBe(0);
  });

  it('calculates an old inspection without crashing', () => {
    const inspection = { ...LEGACY_INSPECTION, configSnapshot: normalizeConfig(LEGACY_INSPECTION.configSnapshot) };
    const result = calculateInspection(inspection);
    expect(result.calculatedFacts[0].costSource).toBe('STATED');
    expect(result.calculatedFacts[0].safeCost).toBe(20700);
    expect(result.forecast.months).toHaveLength(60);
    expect(result.forecast.probabilityAnyMajorRepair).not.toBeNull();
    expect(result.rating.score).not.toBeNull();
  });
});
