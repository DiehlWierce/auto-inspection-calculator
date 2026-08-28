import type { AppConfig, ModelId } from '../types';
import { DEFAULT_INSPECTION_TEMPLATES } from '../inspectionTemplates';
import { COEFFICIENTS } from './seeds.coefficients';
import { MODELS } from './seeds.models';
import { REPAIR_EVENTS } from './seeds.events';
import { PRICE_BOOK } from './seeds.priceBook';

export { CATEGORIES } from './seeds.categories';

export const MODEL_LABELS: Record<ModelId, string> = {
  'corolla-e120': 'Toyota Corolla E120 1.6 AT',
  'cerato-ld': 'Kia Cerato LD 1.6 AT',
  'lacetti-hatch': 'Chevrolet Lacetti Hatch 1.6 AT',
};

const years = (value: number) => Array.from({ length: 5 }, () => value);

export const DEFAULT_CONFIG: AppConfig = {
  id: 'current',
  version: 'seed-2026-08-28',
  fund: 500000,
  maxAskingPrice: 465000,
  targetPurchasePrice: 400000,
  greenReserveRatio: 0.2,
  yellowReserveRatio: 0.1,
  majorRepairThreshold: 25000,
  criticalRepairThreshold: 120000,
  majorRepairsPerYearLimit: 4,
  minMonthsBetweenMajorRepairs: 3,
  simulationScenarios: 20000,
  simulationSeed: 20260827,
  ratingWeights: {
    budget: 20,
    ownership: 20,
    annualRisk: 10,
    frequency: 10,
    maxRepair: 10,
    engine: 10,
    transmission: 10,
    predictability: 5,
    service: 5,
    vehicleInfo: 5,
  },
  scenario: {
    years: 5,
    annualKm: 12000,
    fuelPrice: 71,
    insuranceByYear: [40000, 40000, 40000, 40000, 40000],
    serviceByYear: years(28000),
    fluidsByYear: years(8000),
    consumablesByYear: years(10000),
    tiresByYear: years(14000),
    washingByYear: years(12000),
    finesByYear: years(3000),
    annualLimit: 300000,
  },
  models: MODELS,
  coefficients: COEFFICIENTS,
  priceBook: PRICE_BOOK,
  repairEvents: REPAIR_EVENTS,
  templates: DEFAULT_INSPECTION_TEMPLATES,
};

export function cloneConfig(config: AppConfig): AppConfig {
  return JSON.parse(JSON.stringify(config)) as AppConfig;
}

export function modelLabel(modelId: ModelId): string {
  return MODEL_LABELS[modelId] ?? modelId;
}
