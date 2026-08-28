import { CATEGORIES } from '../config/seeds.categories';
import { calculateBudget } from './budget';
import { calculateForecast } from './forecast';
import { ratingFor } from './rating';
import type { CalculationResult, CategoryId, Inspection } from '../types';

export function calculateInspection(inspection: Inspection, config = inspection.configSnapshot): CalculationResult {
  const budget = calculateBudget(inspection, config);
  const forecast = calculateForecast(inspection, config, budget.calculatedFacts, budget.safeRestoreCost, budget.fullUncertaintyPremium);
  const rating = ratingFor(config, budget.safeRestoreCost, budget.restoreBudget, budget.remainingBudget, budget.statedRestoreCost, forecast, budget.criticalBodyRisks, budget.unknownCostCount, budget.estimatedFactsCount, inspection.pricing.askingPrice, inspection.vehicle);
  return { ...budget, forecast, rating };
}

export function categoryName(category: CategoryId): string {
  return CATEGORIES.find((item) => item.id === category)?.label ?? category;
}
