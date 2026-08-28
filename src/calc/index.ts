import { CATEGORIES } from '../config/seeds.categories';
import { calculateBudget } from './budget';
import { calculateForecast, forecastHash } from './forecast';
import { cachedRisk } from './forecast/simulate';
import { ratingFor } from './rating';
import type { AppConfig, CalculationResult, CategoryId, Inspection } from '../types';

const cache = new WeakMap<Inspection, Map<string, CalculationResult>>();

function cacheKey(inspection: Inspection, config: AppConfig, withRisk: boolean): string {
  const risk = withRisk || cachedRisk(forecastHash(inspection, config)) !== null;
  return `${inspection.updatedAt}|${config.version}|${risk ? 'r' : 'a'}`;
}

export function calculateInspection(inspection: Inspection, config = inspection.configSnapshot, options: { withRisk?: boolean } = {}): CalculationResult {
  const withRisk = options.withRisk ?? true;
  const key = cacheKey(inspection, config, withRisk);
  const entries = cache.get(inspection);
  const cached = entries?.get(key);
  if (cached) return cached;
  const budget = calculateBudget(inspection, config);
  const forecast = calculateForecast(inspection, config, budget.calculatedFacts, budget.safeRestoreCost, budget.fullUncertaintyPremium, { withRisk });
  const rating = ratingFor(config, budget.safeRestoreCost, budget.restoreBudget, budget.remainingBudget, budget.statedRestoreCost, forecast, budget.criticalBodyRisks, budget.unknownCostCount, budget.estimatedFactsCount, inspection.pricing.askingPrice, inspection.vehicle);
  const result: CalculationResult = { ...budget, forecast, rating };
  if (entries) entries.set(key, result);
  else cache.set(inspection, new Map([[key, result]]));
  return result;
}

export function categoryName(category: CategoryId): string {
  return CATEGORIES.find((item) => item.id === category)?.label ?? category;
}
