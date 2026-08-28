import { roundCurrency } from '../../utils';
import { cheapEventsHash } from '../rng';
import { P80_Z, calculateAnalytic, fiveYearPercentile } from './analytic';
import { buildForecastModel } from './model';
import { calculateReserve } from './reserve';
import { cachedRisk, simulateRisks } from './simulate';
import type { RiskForecast } from './simulate';
import type {
  AppConfig,
  CalculatedFact,
  Fact,
  ForecastResult,
  Inspection,
  MonthForecast,
  YearForecast,
} from '../../types';

function valueAt(values: number[], yearIndex: number): number {
  const value = values[yearIndex];
  return Number.isFinite(value) ? value : 0;
}

function scenarioIsComplete(config: AppConfig): boolean {
  const { scenario } = config;
  const arrays = [scenario.insuranceByYear, scenario.serviceByYear, scenario.fluidsByYear,
    scenario.consumablesByYear, scenario.tiresByYear, scenario.washingByYear, scenario.finesByYear];
  return scenario.years > 0
    && Number.isFinite(scenario.annualKm)
    && Number.isFinite(scenario.fuelPrice)
    && arrays.every((array) => array.length >= scenario.years && array.slice(0, scenario.years).every(Number.isFinite));
}

function deferredMonth(urgency: Fact['urgency']): number | null {
  if (urgency === 'SOON') return 3;
  if (urgency === 'PLANNED') return 9;
  if (urgency === 'OPTIONAL') return 18;
  return null;
}

export function forecastHash(inspection: Inspection, config: AppConfig): number {
  const model = buildForecastModel(inspection, config);
  return cheapEventsHash(model.eventRows.filter((event) => event.enabled), [
    inspection.vehicle.year,
    inspection.vehicle.mileage,
    config.scenario.years,
    config.scenario.annualKm,
    config.scenario.annualLimit,
    config.majorRepairThreshold,
    config.criticalRepairThreshold,
    config.majorRepairsPerYearLimit,
    config.minMonthsBetweenMajorRepairs,
    config.simulationScenarios,
    config.simulationSeed,
    config.wear.refAgeYears,
    config.wear.agePerYear,
    config.wear.refMileageKm,
    config.wear.mileagePer100k,
    config.wear.min,
    config.wear.maxMultiplier,
  ], [inspection.vehicle.modelId]);
}

export function calculateForecast(
  inspection: Inspection,
  config: AppConfig,
  calculatedFacts: CalculatedFact[],
  immediateSafeRestoreCost: number,
  fullUncertaintyPremium: number,
  options: { withRisk?: boolean } = {},
): ForecastResult {
  const profile = config.models.find((item) => item.id === inspection.vehicle.modelId) ?? config.models[0];
  const scenario = config.scenario;
  const years = scenario.years;
  const model = buildForecastModel(inspection, config);
  const totalMonths = model.totalMonths;
  const analytic = calculateAnalytic(model, years, config.majorRepairThreshold);

  const deferredByMonth = Array.from({ length: totalMonths }, () => 0);
  for (const fact of calculatedFacts) {
    if (fact.kind !== 'WORK' || fact.urgency === 'NOW') continue;
    const month = deferredMonth(fact.urgency);
    if (month === null) continue;
    deferredByMonth[Math.min(totalMonths - 1, month - 1)] += fact.safeCost;
  }
  const deferredByYear = Array.from({ length: years }, (_, yearIndex) => deferredByMonth.slice(yearIndex * 12, yearIndex * 12 + 12).reduce((sum, value) => sum + value, 0));

  const scheduledByMonth = Array.from({ length: totalMonths }, () => 0);
  for (const prepared of model.events) {
    if (prepared.mode !== 'SCHEDULED') continue;
    scheduledByMonth[Math.min(totalMonths - 1, prepared.scheduledMonth - 1)] += prepared.costMode;
  }
  const scheduledByYear = Array.from({ length: years }, (_, yearIndex) => scheduledByMonth.slice(yearIndex * 12, yearIndex * 12 + 12).reduce((sum, value) => sum + value, 0));

  const repairOutflow = Array.from({ length: totalMonths }, (_, index) => analytic.meanMonth[index] + scheduledByMonth[index] + deferredByMonth[index]);
  const { plannedReserve, reserveBalance } = calculateReserve(repairOutflow);

  const baseline = Array.from({ length: years }, (_, yearIndex) => {
    const fuel = scenario.annualKm * profile.consumptionLPer100Km / 100 * scenario.fuelPrice;
    return fuel + valueAt(scenario.insuranceByYear, yearIndex) + profile.taxAnnual
      + valueAt(scenario.serviceByYear, yearIndex)
      + valueAt(scenario.fluidsByYear, yearIndex)
      + valueAt(scenario.consumablesByYear, yearIndex)
      + valueAt(scenario.tiresByYear, yearIndex)
      + valueAt(scenario.washingByYear, yearIndex)
      + valueAt(scenario.finesByYear, yearIndex)
      + deferredByYear[yearIndex];
  });

  const hash = forecastHash(inspection, config);
  const risk: RiskForecast | null = options.withRisk
    ? simulateRisks(model, config, baseline.map((value, index) => value + scheduledByYear[index]), hash)
    : cachedRisk(hash);

  const months: MonthForecast[] = Array.from({ length: totalMonths }, (_, monthIndex) => {
    const yearIndex = Math.floor(monthIndex / 12);
    const fuel = scenario.annualKm * profile.consumptionLPer100Km / 100 * scenario.fuelPrice / 12;
    const insurance = valueAt(scenario.insuranceByYear, yearIndex) / 12;
    const tax = profile.taxAnnual / 12;
    const service = valueAt(scenario.serviceByYear, yearIndex) / 12;
    const fluids = valueAt(scenario.fluidsByYear, yearIndex) / 12;
    const consumables = valueAt(scenario.consumablesByYear, yearIndex) / 12;
    const tires = valueAt(scenario.tiresByYear, yearIndex) / 12;
    const washing = valueAt(scenario.washingByYear, yearIndex) / 12;
    const fines = valueAt(scenario.finesByYear, yearIndex) / 12;
    const regularExpenses = fuel + insurance + tax + service + fluids + consumables + tires + washing + fines;
    const deferredFacts = deferredByMonth[monthIndex];
    const scheduledEvents = scheduledByMonth[monthIndex];
    const certain = regularExpenses + deferredFacts + scheduledEvents;
    return {
      month: monthIndex + 1,
      year: yearIndex + 1,
      regularExpenses,
      fuel,
      insurance,
      tax,
      service,
      fluids,
      consumables,
      tires,
      washing,
      fines,
      deferredFacts,
      scheduledEvents,
      expectedRepairs: analytic.meanMonth[monthIndex],
      plannedReserve: plannedReserve[monthIndex],
      plannedBudget: regularExpenses + plannedReserve[monthIndex],
      expectedTotal: certain + analytic.meanMonth[monthIndex],
      p50Total: certain + analytic.p50Month[monthIndex],
      p80Total: certain + analytic.p80Month[monthIndex],
      p90Total: certain + analytic.p90Month[monthIndex],
      reserveBalance: reserveBalance[monthIndex],
    };
  });

  const yearsResult: YearForecast[] = Array.from({ length: years }, (_, yearIndex) => {
    const expectedRepairs = analytic.meanYear[yearIndex] + scheduledByYear[yearIndex];
    const certain = baseline[yearIndex] + scheduledByYear[yearIndex];
    return {
      year: yearIndex + 1,
      fuel: scenario.annualKm * profile.consumptionLPer100Km / 100 * scenario.fuelPrice,
      insurance: valueAt(scenario.insuranceByYear, yearIndex),
      tax: profile.taxAnnual,
      service: valueAt(scenario.serviceByYear, yearIndex),
      fluids: valueAt(scenario.fluidsByYear, yearIndex),
      consumables: valueAt(scenario.consumablesByYear, yearIndex),
      tires: valueAt(scenario.tiresByYear, yearIndex),
      washing: valueAt(scenario.washingByYear, yearIndex),
      fines: valueAt(scenario.finesByYear, yearIndex),
      deferredFacts: deferredByYear[yearIndex],
      expectedRepairs,
      expectedTotal: certain + analytic.meanYear[yearIndex],
      p80Total: certain + analytic.p80Year[yearIndex],
      p90Total: certain + analytic.p90Year[yearIndex],
      probabilityLimitViolation: risk ? risk.limitByYear[yearIndex] : null,
      probabilityMajorRepairLimitViolation: risk ? risk.majorByYear[yearIndex] : null,
      probabilityAnyMajorRepair: risk ? risk.majorPresenceByYear[yearIndex] : null,
    };
  });

  const eventRows = model.eventRows.map((event) => {
    const expected = analytic.eventExpected5y.get(event.id) ?? 0;
    const prepared = model.events.find((item) => item.event.id === event.id);
    return {
      event,
      enabled: event.enabled,
      expectedCost: event.enabled ? roundCurrency(expected) : 0,
      riskCost: event.maxCost > 0 ? event.maxCost : roundCurrency(event.repairCost * event.coefficient),
      recurrenceMonths: prepared?.recurrenceMonths ?? Math.max(0, event.recurrenceMonths ?? 0),
      mode: event.mode ?? 'RISK',
    };
  });

  const totalCost = yearsResult.reduce((sum, year) => sum + year.expectedTotal, 0);
  const purchasePrice = inspection.pricing.actualPurchasePrice ?? Math.max(0, inspection.pricing.askingPrice - inspection.pricing.expectedDiscount);
  const deterministicTotal = yearsResult.reduce((sum, year) => sum + year.expectedTotal - analytic.meanYear[year.year - 1], 0);
  const expectedUncertainty = model.events.reduce((sum, prepared) => sum + (analytic.eventExpected5y.get(prepared.event.id) ?? 0) * Math.max(0, 1 - 1 / Math.max(1, prepared.event.coefficient)), 0);
  const p80FiveYearCost = fiveYearPercentile(model, deterministicTotal, P80_Z);

  return {
    years: yearsResult,
    totalCost,
    averageMonthlyCost: totalCost / totalMonths,
    fullFiveYearCost: purchasePrice + immediateSafeRestoreCost + totalCost,
    fullAverageMonthlyCost: (purchasePrice + immediateSafeRestoreCost + totalCost) / totalMonths,
    expectedMajorRepairs5y: analytic.expectedMajorRepairs5y,
    expectedMajorRepairsPerYear: analytic.expectedMajorRepairs5y / years,
    p80MonthlyCost: p80FiveYearCost / totalMonths,
    p80FiveYearCost,
    expectedRecurringSpend5y: analytic.expectedRecurringSpend5y,
    expectedOneShotSpend5y: analytic.expectedOneShotSpend5y,
    probabilityAnyLimitViolation: risk ? risk.probabilityAnyLimitViolation : null,
    probabilityAnyMajorRepairLimitViolation: risk ? risk.probabilityAnyMajorRepairLimitViolation : null,
    probabilityAnyMajorRepair: risk ? risk.probabilityAnyMajorRepair : null,
    probabilityCloseMajorRepairs: risk ? risk.probabilityCloseMajorRepairs : null,
    probabilityCriticalRepair: risk ? risk.probabilityCriticalRepair : null,
    probabilityEngineEvent: analytic.probabilityEngineEvent,
    probabilityTransmissionEvent: analytic.probabilityTransmissionEvent,
    riskPending: risk === null,
    uncertaintyLoad: fullUncertaintyPremium + expectedUncertainty,
    eventRows,
    months,
    questionFactsCount: inspection.facts.filter((fact) => fact.status === 'QUESTION').length,
    confirmedFactsCount: inspection.facts.filter((fact) => fact.status === 'CONFIRMED').length,
    questionShare: inspection.facts.length > 0 ? inspection.facts.filter((fact) => fact.status === 'QUESTION').length / inspection.facts.length : 0,
    complete: scenarioIsComplete(config),
  };
}
