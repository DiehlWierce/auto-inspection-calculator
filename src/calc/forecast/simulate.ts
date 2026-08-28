import { mulberry32 } from '../rng';
import { sampleTriangular } from './model';
import type { ForecastModel } from './model';
import type { AppConfig } from '../../types';

export interface RiskForecast {
  probabilityAnyMajorRepair: number;
  probabilityAnyLimitViolation: number;
  probabilityAnyMajorRepairLimitViolation: number;
  probabilityCloseMajorRepairs: number;
  probabilityCriticalRepair: number;
  limitByYear: number[];
  majorByYear: number[];
  majorPresenceByYear: number[];
}

const CACHE_LIMIT = 50;
const cache = new Map<number, RiskForecast>();

export function cachedRisk(hash: number): RiskForecast | null {
  return cache.get(hash) ?? null;
}

export function simulateRisks(model: ForecastModel, config: AppConfig, baseline: number[], hash: number): RiskForecast {
  const existing = cache.get(hash);
  if (existing) return existing;

  const years = config.scenario.years;
  const scenarios = Math.max(1, Math.round(config.simulationScenarios));
  const random = mulberry32((hash ^ config.simulationSeed) >>> 0);
  const limitByYear = Array.from({ length: years }, () => 0);
  const majorByYear = Array.from({ length: years }, () => 0);
  const majorPresenceByYear = Array.from({ length: years }, () => 0);
  let anyLimit = 0;
  let anyMajor = 0;
  let anyMajorRepair = 0;
  let closeMajor = 0;
  let critical = 0;

  const totals = new Array<number>(years);
  const majorCounts = new Array<number>(years);
  const majorMonths: number[] = [];

  for (let scenario = 0; scenario < scenarios; scenario += 1) {
    for (let year = 0; year < years; year += 1) {
      totals[year] = baseline[year];
      majorCounts[year] = 0;
    }
    majorMonths.length = 0;
    let scenarioCritical = false;

    for (const prepared of model.events) {
      if (prepared.mode === 'SCHEDULED') continue;
      let survived = true;
      for (let index = prepared.monthStart - 1; index < prepared.monthEnd && index < model.totalMonths; index += 1) {
        if (!survived) break;
        const wear = prepared.ageSensitive ? model.wearByMonth[index] : 1;
        const rate = Math.min(1, prepared.hazard * wear);
        if (rate <= 0 || random() >= rate) continue;
        if (prepared.recurrenceMonths === 0) survived = false;
        const cost = sampleTriangular(prepared.costMin, prepared.costMode, prepared.costMax, random);
        const month = index + 1;
        const year = Math.floor(index / 12);
        totals[year] += cost;
        if (cost > config.criticalRepairThreshold) scenarioCritical = true;
        if (cost >= config.majorRepairThreshold) {
          majorCounts[year] += 1;
          majorMonths.push(month);
        }
      }
    }

    let scenarioLimit = false;
    let scenarioMajorLimit = false;
    for (let year = 0; year < years; year += 1) {
      if (totals[year] > config.scenario.annualLimit) {
        limitByYear[year] += 1;
        scenarioLimit = true;
      }
      if (majorCounts[year] > config.majorRepairsPerYearLimit) {
        majorByYear[year] += 1;
        scenarioMajorLimit = true;
      }
      if (majorCounts[year] > 0) majorPresenceByYear[year] += 1;
    }
    majorMonths.sort((left, right) => left - right);
    if (majorMonths.some((month, index) => index > 0 && month - majorMonths[index - 1] < config.minMonthsBetweenMajorRepairs)) closeMajor += 1;
    if (scenarioLimit) anyLimit += 1;
    if (scenarioMajorLimit) anyMajor += 1;
    if (majorMonths.length > 0) anyMajorRepair += 1;
    if (scenarioCritical) critical += 1;
  }

  const result: RiskForecast = {
    probabilityAnyMajorRepair: anyMajorRepair / scenarios,
    probabilityAnyLimitViolation: anyLimit / scenarios,
    probabilityAnyMajorRepairLimitViolation: anyMajor / scenarios,
    probabilityCloseMajorRepairs: closeMajor / scenarios,
    probabilityCriticalRepair: critical / scenarios,
    limitByYear: limitByYear.map((value) => value / scenarios),
    majorByYear: majorByYear.map((value) => value / scenarios),
    majorPresenceByYear: majorPresenceByYear.map((value) => value / scenarios),
  };
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as number);
  cache.set(hash, result);
  return result;
}
