import { roundCurrency } from '../utils';
import { coefficientFor } from './repairTypes';
import type { AppConfig, BodyRisk, CalculatedFact, Inspection } from '../types';

export interface BudgetResult {
  calculationPrice: number;
  priceSource: 'ACTUAL' | 'ASKING_MINUS_DISCOUNT';
  restoreBudget: number;
  statedRestoreCost: number;
  immediateSafeRestoreCost: number;
  nearTermSafeRestoreCost: number;
  fullSafeRestoreCost: number;
  deferredSafeRestoreCost: number;
  safeRestoreCost: number;
  uncertaintyPremium: number;
  fullUncertaintyPremium: number;
  remainingBudget: number;
  reserveRatio: number | null;
  fullRemainingBudget: number;
  fullReserveRatio: number | null;
  zone: 'GREEN' | 'YELLOW' | 'RED' | 'FILTER_FAIL';
  calculatedFacts: CalculatedFact[];
  criticalBodyRisks: BodyRisk[];
  unknownCostCount: number;
  questionFactsCount: number;
  confirmedFactsCount: number;
  questionShare: number;
}

export function priceFor(inspection: Inspection): { price: number; source: 'ACTUAL' | 'ASKING_MINUS_DISCOUNT' } {
  if (inspection.pricing.actualPurchasePrice !== undefined && inspection.pricing.actualPurchasePrice > 0) {
    return { price: inspection.pricing.actualPurchasePrice, source: 'ACTUAL' };
  }
  return {
    price: Math.max(0, inspection.pricing.askingPrice - inspection.pricing.expectedDiscount),
    source: 'ASKING_MINUS_DISCOUNT',
  };
}

export function calculateBudget(inspection: Inspection, config: AppConfig): BudgetResult {
  const { price: calculationPrice, source: priceSource } = priceFor(inspection);
  const restoreBudget = config.fund - calculationPrice;
  const calculatedFacts: CalculatedFact[] = inspection.facts.map((fact) => {
    const coefficient = coefficientFor(fact, config);
    return {
      ...fact,
      coefficient,
      safeCost: fact.kind === 'WORK' && fact.statedCost !== undefined ? roundCurrency(fact.statedCost * coefficient) : 0,
    };
  });
  const workFacts = calculatedFacts.filter((fact) => fact.kind === 'WORK');
  const statedRestoreCost = workFacts.reduce((sum, fact) => sum + (fact.statedCost ?? 0), 0);
  const immediateSafeRestoreCost = workFacts.filter((fact) => fact.urgency === 'NOW').reduce((sum, fact) => sum + fact.safeCost, 0);
  const nearTermSafeRestoreCost = workFacts.filter((fact) => fact.urgency === 'NOW' || fact.urgency === 'SOON').reduce((sum, fact) => sum + fact.safeCost, 0);
  const fullSafeRestoreCost = workFacts.reduce((sum, fact) => sum + fact.safeCost, 0);
  const deferredSafeRestoreCost = fullSafeRestoreCost - immediateSafeRestoreCost;
  const safeRestoreCost = immediateSafeRestoreCost;
  const uncertaintyPremium = safeRestoreCost - workFacts.filter((fact) => fact.urgency === 'NOW').reduce((sum, fact) => sum + (fact.statedCost ?? 0), 0);
  const fullUncertaintyPremium = fullSafeRestoreCost - statedRestoreCost;
  const remainingBudget = restoreBudget - safeRestoreCost;
  const fullRemainingBudget = restoreBudget - fullSafeRestoreCost;
  const reserveRatio = restoreBudget > 0 ? remainingBudget / restoreBudget : null;
  const fullReserveRatio = restoreBudget > 0 ? fullRemainingBudget / restoreBudget : null;
  const zone = inspection.pricing.askingPrice > config.maxAskingPrice
    ? 'FILTER_FAIL'
    : reserveRatio !== null && reserveRatio >= config.greenReserveRatio
      ? 'GREEN'
      : reserveRatio !== null && reserveRatio >= config.yellowReserveRatio
        ? 'YELLOW'
        : 'RED';
  const criticalBodyRisks = Array.from(new Set(inspection.facts.flatMap((fact) => fact.bodyRisks)));
  const unknownCostCount = inspection.facts.filter((fact) => fact.kind === 'WORK' && (!fact.statedCost || fact.statedCost <= 0)).length;
  const questionFactsCount = inspection.facts.filter((fact) => fact.status === 'QUESTION').length;
  const confirmedFactsCount = inspection.facts.filter((fact) => fact.status === 'CONFIRMED').length;
  const questionShare = inspection.facts.length > 0 ? questionFactsCount / inspection.facts.length : 0;

  return {
    calculationPrice,
    priceSource,
    restoreBudget,
    statedRestoreCost,
    immediateSafeRestoreCost,
    nearTermSafeRestoreCost,
    fullSafeRestoreCost,
    deferredSafeRestoreCost,
    safeRestoreCost,
    uncertaintyPremium,
    fullUncertaintyPremium,
    remainingBudget,
    reserveRatio,
    fullRemainingBudget,
    fullReserveRatio,
    zone,
    calculatedFacts,
    criticalBodyRisks,
    unknownCostCount,
    questionFactsCount,
    confirmedFactsCount,
    questionShare,
  };
}
