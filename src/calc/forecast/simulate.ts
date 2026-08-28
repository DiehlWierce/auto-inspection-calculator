import { clamp, roundCurrency } from '../../utils';
import { hashSeed, mulberry32 } from '../rng';
import type { AppConfig, RepairEvent } from '../../types';

export function simulateRisks(
  events: Array<RepairEvent & { enabled: boolean }>,
  config: AppConfig,
  modelId: string,
  baseline: number[],
): {
  limitByYear: number[];
  majorByYear: number[];
  majorPresenceByYear: number[];
  anyLimit: number;
  anyMajor: number;
  anyMajorRepair: number;
  closeMajor: number;
  critical: number;
} {
  const years = config.scenario.years;
  const scenarios = Math.max(1, Math.round(config.simulationScenarios));
  const random = mulberry32(hashSeed(`${config.simulationSeed}:${modelId}:${JSON.stringify(events)}`));
  const limitByYear = Array.from({ length: years }, () => 0);
  const majorByYear = Array.from({ length: years }, () => 0);
  const majorPresenceByYear = Array.from({ length: years }, () => 0);
  let anyLimit = 0;
  let anyMajor = 0;
  let anyMajorRepair = 0;
  let closeMajor = 0;
  let critical = 0;

  for (let scenario = 0; scenario < scenarios; scenario += 1) {
    const totals = [...baseline];
    const majorCounts = Array.from({ length: years }, () => 0);
    const majorMonths: number[] = [];
    let scenarioCritical = false;

    for (const event of events) {
      if (!event.enabled || random() >= event.probability5y) continue;
      const start = clamp(Math.round(event.monthStart), 1, years * 12);
      const end = clamp(Math.max(start, Math.round(event.monthEnd)), start, years * 12);
      const month = start + Math.floor(random() * (end - start + 1));
      const year = Math.floor((month - 1) / 12);
      const riskCost = event.maxCost > 0 ? event.maxCost : roundCurrency(event.repairCost * event.coefficient);
      totals[year] += riskCost;
      if (riskCost > config.criticalRepairThreshold) scenarioCritical = true;
      if (riskCost >= config.majorRepairThreshold) {
        majorCounts[year] += 1;
        majorMonths.push(month);
      }
    }

    let scenarioLimit = false;
    let scenarioMajor = false;
    for (let year = 0; year < years; year += 1) {
      if (totals[year] > config.scenario.annualLimit) {
        limitByYear[year] += 1;
        scenarioLimit = true;
      }
      if (majorCounts[year] > config.majorRepairsPerYearLimit) {
        majorByYear[year] += 1;
        scenarioMajor = true;
      }
      if (majorCounts[year] > 0) majorPresenceByYear[year] += 1;
    }
    majorMonths.sort((left, right) => left - right);
    const close = majorMonths.some((month, index) => index > 0 && month - majorMonths[index - 1] < config.minMonthsBetweenMajorRepairs);
    if (close) closeMajor += 1;
    if (scenarioLimit) anyLimit += 1;
    if (scenarioMajor) anyMajor += 1;
    if (majorMonths.length > 0) anyMajorRepair += 1;
    if (scenarioCritical) critical += 1;
  }

  return {
    limitByYear: limitByYear.map((value) => value / scenarios),
    majorByYear: majorByYear.map((value) => value / scenarios),
    majorPresenceByYear: majorPresenceByYear.map((value) => value / scenarios),
    anyLimit: anyLimit / scenarios,
    anyMajor: anyMajor / scenarios,
    anyMajorRepair: anyMajorRepair / scenarios,
    closeMajor: closeMajor / scenarios,
    critical: critical / scenarios,
  };
}
