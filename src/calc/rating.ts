import { clamp, roundCurrency } from '../utils';
import type { AppConfig, BodyRisk, ForecastResult, RatingResult, VehicleInfo } from '../types';

export const VEHICLE_INFO_PENALTIES = {
  accident: 4,
  unknownAccident: 1,
  duplicateWithOriginal: 1,
  duplicateWithoutOriginal: 3,
  fewerThanTwoKeys: 1,
} as const;

export function vehicleInfoScore(vehicle: VehicleInfo): number {
  let penalty = 0;
  if (vehicle.accidentStatus === 'YES') penalty += VEHICLE_INFO_PENALTIES.accident;
  if (vehicle.accidentStatus === 'UNKNOWN' || vehicle.accidentStatus === undefined) penalty += VEHICLE_INFO_PENALTIES.unknownAccident;
  if (vehicle.documentsStatus === 'DUPLICATE_WITH_ORIGINAL') penalty += VEHICLE_INFO_PENALTIES.duplicateWithOriginal;
  if (vehicle.documentsStatus === 'DUPLICATE_WITHOUT_ORIGINAL') penalty += VEHICLE_INFO_PENALTIES.duplicateWithoutOriginal;
  if (vehicle.keyCount !== undefined && vehicle.keyCount < 2) penalty += VEHICLE_INFO_PENALTIES.fewerThanTwoKeys;
  return clamp(100 - penalty, 0, 100);
}

export function ratingFor(
  config: AppConfig,
  safeRestoreCost: number,
  restoreBudget: number,
  remainingBudget: number,
  statedRestoreCost: number,
  forecast: ForecastResult,
  criticalBodyRisks: BodyRisk[],
  unknownCostCount: number,
  estimatedFactsCount: number,
  askingPrice: number,
  vehicle: VehicleInfo,
): RatingResult {
  const hardBlocks: string[] = [];
  const warnings: string[] = [];
  if (askingPrice > config.maxAskingPrice) hardBlocks.push(`Цена объявления выше ${config.maxAskingPrice.toLocaleString('ru-RU')} ₽.`);
  if (remainingBudget < 0) hardBlocks.push('Безопасная смета превышает доступный бюджет доведения.');
  if (unknownCostCount > 0) hardBlocks.push('Есть работы без оценимой стоимости.');
  if (criticalBodyRisks.length > 0) hardBlocks.push('Есть критический кузовной или геометрический риск.');
  if (!forecast.complete) hardBlocks.push('Пятилетний прогноз не полностью настроен.');
  if (forecast.years.some((year) => year.expectedTotal > config.scenario.annualLimit)) {
    hardBlocks.push(`Ожидаемые расходы одного из годов выше лимита ${config.scenario.annualLimit.toLocaleString('ru-RU')} ₽.`);
  }
  if (remainingBudget >= 0 && restoreBudget > 0 && remainingBudget / restoreBudget < config.greenReserveRatio) {
    warnings.push('Запас доведения ниже зелёной зоны.');
  }
  if (forecast.probabilityAnyLimitViolation > 0) warnings.push(`Есть модельная вероятность превышения годового лимита: ${(forecast.probabilityAnyLimitViolation * 100).toFixed(1)}%.`);
  if (forecast.probabilityCloseMajorRepairs > 0) warnings.push(`Есть модельная вероятность двух крупных ремонтов ближе чем через ${config.minMonthsBetweenMajorRepairs} месяца.`);

  const ratio = restoreBudget > 0 ? remainingBudget / restoreBudget : 0;
  const budgetScore = clamp(ratio / config.greenReserveRatio * 100, 0, 100);
  const avgAnnual = forecast.totalCost / config.scenario.years;
  const ownershipScore = clamp((1 - avgAnnual / config.scenario.annualLimit) * 100, 0, 100);
  const annualRiskScore = (1 - forecast.probabilityAnyLimitViolation) * 100;
  const frequencyScore = clamp((1 - forecast.expectedMajorRepairsPerYear / config.majorRepairsPerYearLimit) * 100, 0, 100);
  const maxScore = (1 - forecast.probabilityCriticalRepair) * 100;
  const engineScore = (1 - forecast.probabilityEngineEvent) * 100;
  const transmissionScore = (1 - forecast.probabilityTransmissionEvent) * 100;
  const predictabilityScore = clamp((1 - forecast.uncertaintyLoad / (config.scenario.years * config.scenario.annualLimit)) * 100, 0, 100);
  const expectedServiceAnnual = forecast.years.reduce((sum, year) => sum + year.expectedRepairs + year.service + year.fluids + year.consumables + year.tires, 0) / config.scenario.years;
  const serviceScore = clamp((1 - expectedServiceAnnual / config.scenario.annualLimit) * 100, 0, 100);
  const vehicleInfoRatingScore = vehicleInfoScore(vehicle);
  const rawComponents = [
    ['budget', 'Соответствие бюджету доведения', config.ratingWeights.budget, budgetScore],
    ['ownership', 'Ожидаемая стоимость владения', config.ratingWeights.ownership, ownershipScore],
    ['annual-risk', 'Риск превышения годового лимита', config.ratingWeights.annualRisk, annualRiskScore],
    ['frequency', 'Частота крупных ремонтов', config.ratingWeights.frequency, frequencyScore],
    ['max-repair', 'Риск крупного единичного ремонта', config.ratingWeights.maxRepair, maxScore],
    ['engine', 'Риск двигателя', config.ratingWeights.engine, engineScore],
    ['transmission', 'Риск АКПП', config.ratingWeights.transmission, transmissionScore],
    ['predictability', 'Предсказуемость расходов', config.ratingWeights.predictability, predictabilityScore],
    ['service', 'Стоимость ремонта и обслуживания', config.ratingWeights.service, serviceScore],
    ['vehicle-info', 'История и комплектность автомобиля', config.ratingWeights.vehicleInfo ?? 0, vehicleInfoRatingScore],
  ] as const;
  const components = rawComponents.map(([id, label, weight, score]) => ({ id, label, weight, score: roundCurrency(score * 10) / 10 }));
  const weightTotal = components.reduce((sum, component) => sum + component.weight, 0) || 1;
  const score = components.reduce((sum, component) => sum + component.score * component.weight / weightTotal, 0);
  return {
    score: roundCurrency(score * 10) / 10,
    components,
    hardBlocks,
    warnings,
    status: hardBlocks.length > 0 ? 'BLOCKED' : forecast.complete && forecast.questionFactsCount === 0 && estimatedFactsCount === 0 ? 'VALID' : 'PROVISIONAL',
  };
}
