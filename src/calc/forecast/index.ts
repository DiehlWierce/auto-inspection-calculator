import { clamp, roundCurrency } from '../../utils';
import { simulateRisks } from './simulate';
import type {
  AppConfig,
  CalculatedFact,
  Fact,
  ForecastResult,
  Inspection,
  RepairEvent,
  YearForecast,
} from '../../types';

function valueAt(values: number[], yearIndex: number): number {
  const value = values[yearIndex];
  return Number.isFinite(value) ? value : 0;
}

function effectiveEvent(event: RepairEvent, inspection: Inspection): RepairEvent & { enabled: boolean } {
  const override = inspection.eventOverrides?.[event.id];
  const mode = override?.mode ?? event.mode ?? 'RISK';
  const scheduledMonth = Math.max(1, Math.round(override?.scheduledMonth ?? event.scheduledMonth ?? event.monthStart));
  return {
    ...event,
    ...override,
    mode,
    scheduledMonth,
    probability5y: mode === 'SCHEDULED' ? 1 : clamp(override?.probability5y ?? event.probability5y, 0, 1),
    repairCost: Math.max(0, override?.repairCost ?? event.repairCost),
    coefficient: Math.max(0, override?.coefficient ?? event.coefficient),
    maxCost: Math.max(0, override?.maxCost ?? event.maxCost),
    monthStart: mode === 'SCHEDULED' ? scheduledMonth : Math.max(1, Math.round(override?.monthStart ?? event.monthStart)),
    monthEnd: mode === 'SCHEDULED' ? scheduledMonth : Math.max(1, Math.round(override?.monthEnd ?? event.monthEnd)),
    enabled: override?.enabled !== false,
  };
}

function eventDueMonth(event: RepairEvent, totalMonths: number): number {
  if (event.mode === 'SCHEDULED') return clamp(Math.round(event.scheduledMonth ?? event.monthStart), 1, totalMonths);
  const start = clamp(Math.round(event.monthStart), 1, totalMonths);
  const end = clamp(Math.max(start, Math.round(event.monthEnd)), start, totalMonths);
  return Math.round((start + end) / 2);
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

export function calculateForecast(inspection: Inspection, config: AppConfig, calculatedFacts: CalculatedFact[], immediateSafeRestoreCost: number, fullUncertaintyPremium: number): ForecastResult {
  const model = config.models.find((item) => item.id === inspection.vehicle.modelId) ?? config.models[0];
  const scenario = config.scenario;
  const years = scenario.years;
  const events = [...config.repairEvents, ...(inspection.customEvents ?? [])]
    .filter((event) => event.modelIds.includes(model.id) && inspection.eventOverrides?.[event.id]?.removed !== true)
    .map((event) => effectiveEvent(event, inspection));
  const eventRows = events.map((event) => ({
    event,
    enabled: event.enabled,
    expectedCost: event.enabled ? roundCurrency(event.probability5y * event.repairCost * event.coefficient) : 0,
    riskCost: event.maxCost > 0 ? event.maxCost : roundCurrency(event.repairCost * event.coefficient),
    mode: event.mode ?? 'RISK',
  }));

  const totalMonths = years * 12;
  const deferredByMonth = Array.from({ length: totalMonths }, () => 0);
  for (const fact of calculatedFacts) {
    if (fact.kind !== 'WORK' || fact.urgency === 'NOW') continue;
    const month = deferredMonth(fact.urgency);
    if (month === null) continue;
    deferredByMonth[Math.min(totalMonths - 1, month - 1)] += fact.safeCost;
  }

  const deferredByYear = Array.from({ length: years }, (_, yearIndex) => deferredByMonth.slice(yearIndex * 12, yearIndex * 12 + 12).reduce((sum, value) => sum + value, 0));
  const deferredSafeRestoreCost = deferredByMonth.reduce((sum, value) => sum + value, 0);

  const dueMonthByEvent = new Map(events.map((event) => [event.id, eventDueMonth(event, totalMonths)]));

  const baseline = Array.from({ length: years }, (_, yearIndex) => {
    const fuel = scenario.annualKm * model.consumptionLPer100Km / 100 * scenario.fuelPrice;
    return fuel + valueAt(scenario.insuranceByYear, yearIndex) + model.taxAnnual
      + valueAt(scenario.serviceByYear, yearIndex)
      + valueAt(scenario.fluidsByYear, yearIndex)
      + valueAt(scenario.consumablesByYear, yearIndex)
      + valueAt(scenario.tiresByYear, yearIndex)
      + valueAt(scenario.washingByYear, yearIndex)
      + valueAt(scenario.finesByYear, yearIndex)
      + deferredByYear[yearIndex];
  });

  const expectedRepairsByYear = Array.from({ length: years }, () => 0);
  for (const event of events) {
    if (!event.enabled) continue;
    const dueMonth = dueMonthByEvent.get(event.id) ?? 1;
    const yearIndex = Math.floor((dueMonth - 1) / 12);
    expectedRepairsByYear[yearIndex] += event.probability5y * event.repairCost * event.coefficient;
  }
  const expectedEventCost5y = events.reduce((sum, event) => sum + (event.enabled ? event.probability5y * event.repairCost * event.coefficient : 0), 0);
  let reserveBalance = 0;
  const months = Array.from({ length: totalMonths }, (_, monthIndex) => {
    const yearIndex = Math.floor(monthIndex / 12);
    const fuel = scenario.annualKm * model.consumptionLPer100Km / 100 * scenario.fuelPrice / 12;
    const insurance = valueAt(scenario.insuranceByYear, yearIndex) / 12;
    const tax = model.taxAnnual / 12;
    const service = valueAt(scenario.serviceByYear, yearIndex) / 12;
    const fluids = valueAt(scenario.fluidsByYear, yearIndex) / 12;
    const consumables = valueAt(scenario.consumablesByYear, yearIndex) / 12;
    const tires = valueAt(scenario.tiresByYear, yearIndex) / 12;
    const washing = valueAt(scenario.washingByYear, yearIndex) / 12;
    const fines = valueAt(scenario.finesByYear, yearIndex) / 12;
    const month = monthIndex + 1;
    const scheduledEvents = events.reduce((sum, event) => sum + (event.enabled && event.mode === 'SCHEDULED' && (dueMonthByEvent.get(event.id) ?? 1) === month ? event.repairCost * event.coefficient : 0), 0);
    const expectedRepairs = events.reduce((sum, event) => sum + (event.enabled && event.mode !== 'SCHEDULED' && (dueMonthByEvent.get(event.id) ?? 1) === month
      ? event.probability5y * event.repairCost * event.coefficient
      : 0), 0);
    const deferredFacts = deferredByMonth[monthIndex];
    const regularExpenses = fuel + insurance + tax + service + fluids + consumables + tires + washing + fines;
    const repairOutflow = deferredFacts + scheduledEvents + expectedRepairs;
    const deferredReserve = deferredByMonth.reduce((sum, value, index) => sum + (index < monthIndex || value === 0 ? 0 : value / (index + 1)), 0);
    const eventReserve = events.reduce((sum, event) => {
      if (!event.enabled) return sum;
      const dueMonth = dueMonthByEvent.get(event.id) ?? 1;
      if (month > dueMonth) return sum;
      const expectedCost = event.probability5y * event.repairCost * event.coefficient;
      return sum + expectedCost / dueMonth;
    }, 0);
    const plannedReserve = deferredReserve + eventReserve;
    reserveBalance += plannedReserve - repairOutflow;
    return {
      month,
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
      expectedRepairs,
      plannedReserve,
      plannedBudget: regularExpenses + plannedReserve,
      expectedTotal: regularExpenses + repairOutflow,
      reserveBalance,
    };
  });
  const expectedMajorRepairs5y = events.reduce((sum, event) => {
    if (!event.enabled) return sum;
    const riskCost = event.maxCost > 0 ? event.maxCost : event.repairCost * event.coefficient;
    return sum + (riskCost >= config.majorRepairThreshold ? event.probability5y : 0);
  }, 0);
  const simulated = simulateRisks(events, config, model.id, baseline);
  const yearsResult: YearForecast[] = Array.from({ length: years }, (_, yearIndex) => {
    const fuel = scenario.annualKm * model.consumptionLPer100Km / 100 * scenario.fuelPrice;
    const insurance = valueAt(scenario.insuranceByYear, yearIndex);
    const service = valueAt(scenario.serviceByYear, yearIndex);
    const fluids = valueAt(scenario.fluidsByYear, yearIndex);
    const consumables = valueAt(scenario.consumablesByYear, yearIndex);
    const tires = valueAt(scenario.tiresByYear, yearIndex);
    const washing = valueAt(scenario.washingByYear, yearIndex);
    const fines = valueAt(scenario.finesByYear, yearIndex);
    const expectedRepairs = expectedRepairsByYear[yearIndex];
    return {
      year: yearIndex + 1,
      fuel,
      insurance,
      tax: model.taxAnnual,
      service,
      fluids,
      consumables,
      tires,
      washing,
      fines,
      deferredFacts: deferredByYear[yearIndex],
      expectedRepairs,
      expectedTotal: baseline[yearIndex] + expectedRepairs,
      probabilityLimitViolation: simulated.limitByYear[yearIndex],
      probabilityMajorRepairLimitViolation: simulated.majorByYear[yearIndex],
      probabilityAnyMajorRepair: simulated.majorPresenceByYear[yearIndex],
    };
  });
  const totalCost = yearsResult.reduce((sum, year) => sum + year.expectedTotal, 0);
  const expectedUncertainty = events.reduce((sum, event) => sum + (event.enabled
    ? event.probability5y * event.repairCost * Math.max(0, event.coefficient - 1)
    : 0), 0);
  const complete = scenarioIsComplete(config);

  return {
    years: yearsResult,
    totalCost,
    averageMonthlyCost: totalCost / (years * 12),
    fullFiveYearCost: (inspection.pricing.actualPurchasePrice ?? Math.max(0, inspection.pricing.askingPrice - inspection.pricing.expectedDiscount)) + immediateSafeRestoreCost + totalCost,
    fullAverageMonthlyCost: ((inspection.pricing.actualPurchasePrice ?? Math.max(0, inspection.pricing.askingPrice - inspection.pricing.expectedDiscount)) + immediateSafeRestoreCost + totalCost) / (years * 12),
    expectedMajorRepairs5y,
    expectedMajorRepairsPerYear: expectedMajorRepairs5y / years,
    probabilityAnyLimitViolation: simulated.anyLimit,
    probabilityAnyMajorRepairLimitViolation: simulated.anyMajor,
    probabilityAnyMajorRepair: simulated.anyMajorRepair,
    probabilityCloseMajorRepairs: simulated.closeMajor,
    probabilityCriticalRepair: simulated.critical,
    probabilityEngineEvent: 1 - events.filter((event) => event.enabled && event.category === 'engine').reduce((product, event) => product * (1 - event.probability5y), 1),
    probabilityTransmissionEvent: 1 - events.filter((event) => event.enabled && event.category === 'transmission').reduce((product, event) => product * (1 - event.probability5y), 1),
    uncertaintyLoad: fullUncertaintyPremium + expectedUncertainty,
    eventRows,
    months,
    questionFactsCount: inspection.facts.filter((fact) => fact.status === 'QUESTION').length,
    confirmedFactsCount: inspection.facts.filter((fact) => fact.status === 'CONFIRMED').length,
    questionShare: inspection.facts.length > 0 ? inspection.facts.filter((fact) => fact.status === 'QUESTION').length / inspection.facts.length : 0,
    complete,
  };
}
