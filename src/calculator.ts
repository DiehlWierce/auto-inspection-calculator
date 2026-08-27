import { CATEGORIES } from './config';
import { clamp, roundCurrency } from './utils';
import type {
  AppConfig,
  BodyRisk,
  CalculatedFact,
  CalculationResult,
  CategoryId,
  Fact,
  ForecastResult,
  Inspection,
  RatingResult,
  RepairEvent,
  VehicleInfo,
  YearForecast,
} from './types';

/**
 * Штрафы компонента рейтинга «История и комплектность», шкала 0–100.
 * Шкала развёрнута намеренно: при весе компонента 5 из 105 полный набор
 * штрафов снимает с итогового рейтинга около 3 баллов — заметно, но не решающе.
 */
export const VEHICLE_INFO_PENALTIES = {
  accident: 35,
  unknownAccident: 10,
  duplicateWithOriginal: 10,
  duplicateWithoutOriginal: 30,
  fewerThanTwoKeys: 10,
} as const;

/**
 * Риски, которые нельзя закрыть денежной сметой: силовая структура и геометрия.
 * Каждый из них останавливает расчёт (hard block).
 * `weak_sills` сюда намеренно не входит: отдельный порог — оцениваемая работа,
 * он даёт предупреждение, а не блокировку.
 */
export const CRITICAL_BODY_RISKS: readonly BodyRisk[] = [
  'structural_corrosion',
  'longerons',
  'strut_towers',
  'floor',
  'suspension_mounts',
  'geometry',
  'major_crash',
  'large_welding',
  'unestimable_scope',
];

/** Заявленная стоимость работы не может быть отрицательной. */
function statedCostOf(fact: Fact): number {
  return fact.statedCost === undefined ? 0 : Math.max(0, fact.statedCost);
}

function vehicleInfoScore(vehicle: VehicleInfo): number {
  let penalty = 0;
  if (vehicle.accidentStatus === 'YES') penalty += VEHICLE_INFO_PENALTIES.accident;
  if (vehicle.accidentStatus === 'UNKNOWN' || vehicle.accidentStatus === undefined)
    penalty += VEHICLE_INFO_PENALTIES.unknownAccident;
  if (vehicle.documentsStatus === 'DUPLICATE_WITH_ORIGINAL') penalty += VEHICLE_INFO_PENALTIES.duplicateWithOriginal;
  if (vehicle.documentsStatus === 'DUPLICATE_WITHOUT_ORIGINAL')
    penalty += VEHICLE_INFO_PENALTIES.duplicateWithoutOriginal;
  if (vehicle.keyCount !== undefined && vehicle.keyCount < 2) penalty += VEHICLE_INFO_PENALTIES.fewerThanTwoKeys;
  return clamp(100 - penalty, 0, 100);
}

function categoryLabel(category: CategoryId): string {
  return CATEGORIES.find((item) => item.id === category)?.label ?? category;
}

function coefficientFor(fact: Fact, config: AppConfig): number {
  const text = `${fact.subcategory} ${fact.description}`.toLowerCase();
  let id: string = fact.category;

  if (fact.category === 'engine') {
    if (text.includes('круп') || text.includes('капит')) id = 'engine-major';
    else if (text.includes('сред')) id = 'engine-medium';
    else if (text.includes('диаг')) id = 'engine-diagnostic';
    else id = 'engine-minor';
  }
  if (fact.category === 'transmission') {
    if (text.includes('ремонт')) id = 'transmission-repair';
    else if (text.includes('диаг')) id = 'transmission-diagnostic';
    else id = 'transmission-service';
  }
  if (fact.category === 'body') {
    if (text.includes('свар')) id = 'body-welding';
    else if (text.includes('геометр')) id = 'body-geometry';
    else if (text.includes('окрас') || text.includes('облив')) id = 'body-paint';
    else if (text.includes('несколько')) id = 'body-multiple';
    else id = 'body-local';
  }

  return (
    config.coefficients.find((item) => item.id === id)?.coefficient ??
    config.coefficients.find((item) => item.category === fact.category)?.coefficient ??
    1.2
  );
}

function priceFor(inspection: Inspection): { price: number; source: 'ACTUAL' | 'ASKING_MINUS_DISCOUNT' } {
  if (inspection.pricing.actualPurchasePrice !== undefined && inspection.pricing.actualPurchasePrice > 0) {
    return { price: inspection.pricing.actualPurchasePrice, source: 'ACTUAL' };
  }
  return {
    price: Math.max(0, inspection.pricing.askingPrice - inspection.pricing.expectedDiscount),
    source: 'ASKING_MINUS_DISCOUNT',
  };
}

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
    monthStart:
      mode === 'SCHEDULED' ? scheduledMonth : Math.max(1, Math.round(override?.monthStart ?? event.monthStart)),
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

/**
 * Ключ симуляции. В него входят только те параметры события, которые влияют на исход.
 * Название, категория и прочий текст сюда не попадают: переименование события
 * в настройках не должно менять рассчитанные вероятности.
 */
function simulationKey(events: Array<RepairEvent & { enabled: boolean }>): string {
  return events
    .map((event) =>
      [
        event.id,
        event.enabled ? 1 : 0,
        event.mode ?? 'RISK',
        event.probability5y,
        event.repairCost,
        event.coefficient,
        event.maxCost,
        event.monthStart,
        event.monthEnd,
      ].join('|'),
    )
    .join(';');
}

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Горизонт прогноза в годах. Значение из конфигурации может прийти испорченным
 * (например, из чужого файла бэкапа), поэтому оно приводится к разумному диапазону:
 * иначе деления на ноль превращают весь прогноз и рейтинг в NaN.
 */
export const MIN_FORECAST_YEARS = 1;
export const MAX_FORECAST_YEARS = 15;

function forecastYears(config: AppConfig): number {
  const raw = Math.round(config.scenario.years);
  if (!Number.isFinite(raw)) return MIN_FORECAST_YEARS;
  return clamp(raw, MIN_FORECAST_YEARS, MAX_FORECAST_YEARS);
}

function scenarioIsComplete(config: AppConfig): boolean {
  const { scenario } = config;
  const arrays = [
    scenario.insuranceByYear,
    scenario.serviceByYear,
    scenario.fluidsByYear,
    scenario.consumablesByYear,
    scenario.tiresByYear,
    scenario.washingByYear,
    scenario.finesByYear,
  ];
  return (
    scenario.years > 0 &&
    Number.isFinite(scenario.annualKm) &&
    Number.isFinite(scenario.fuelPrice) &&
    arrays.every((array) => array.length >= scenario.years && array.slice(0, scenario.years).every(Number.isFinite))
  );
}

function simulateRisks(
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
  const years = forecastYears(config);
  const scenarios = clamp(Math.round(config.simulationScenarios), 1, 100000);
  const random = mulberry32(hashSeed(`${config.simulationSeed}:${modelId}:${simulationKey(events)}`));
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
    const close = majorMonths.some(
      (month, index) => index > 0 && month - majorMonths[index - 1] < config.minMonthsBetweenMajorRepairs,
    );
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

function deferredMonth(urgency: Fact['urgency']): number | null {
  if (urgency === 'SOON') return 3;
  if (urgency === 'PLANNED') return 9;
  if (urgency === 'OPTIONAL') return 18;
  return null;
}

function calculateForecast(
  inspection: Inspection,
  config: AppConfig,
  calculationPrice: number,
  immediateSafeRestoreCost: number,
  fullUncertaintyPremium: number,
): ForecastResult {
  const model = config.models.find((item) => item.id === inspection.vehicle.modelId) ?? config.models[0];
  const scenario = config.scenario;
  const years = forecastYears(config);
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
  for (const fact of inspection.facts) {
    if (fact.kind !== 'WORK' || fact.statedCost === undefined || fact.urgency === 'NOW') continue;
    const month = deferredMonth(fact.urgency);
    if (month === null) continue;
    const coefficient = coefficientFor(fact, config);
    deferredByMonth[Math.min(totalMonths - 1, month - 1)] += roundCurrency(statedCostOf(fact) * coefficient);
  }

  const deferredByYear = Array.from({ length: years }, (_, yearIndex) =>
    deferredByMonth.slice(yearIndex * 12, yearIndex * 12 + 12).reduce((sum, value) => sum + value, 0),
  );

  const dueMonthByEvent = new Map(events.map((event) => [event.id, eventDueMonth(event, totalMonths)]));

  const baseline = Array.from({ length: years }, (_, yearIndex) => {
    const fuel = ((scenario.annualKm * model.consumptionLPer100Km) / 100) * scenario.fuelPrice;
    return (
      fuel +
      valueAt(scenario.insuranceByYear, yearIndex) +
      model.taxAnnual +
      valueAt(scenario.serviceByYear, yearIndex) +
      valueAt(scenario.fluidsByYear, yearIndex) +
      valueAt(scenario.consumablesByYear, yearIndex) +
      valueAt(scenario.tiresByYear, yearIndex) +
      valueAt(scenario.washingByYear, yearIndex) +
      valueAt(scenario.finesByYear, yearIndex) +
      deferredByYear[yearIndex]
    );
  });

  const expectedRepairsByYear = Array.from({ length: years }, () => 0);
  for (const event of events) {
    if (!event.enabled) continue;
    const dueMonth = dueMonthByEvent.get(event.id) ?? 1;
    const yearIndex = Math.floor((dueMonth - 1) / 12);
    expectedRepairsByYear[yearIndex] += event.probability5y * event.repairCost * event.coefficient;
  }
  let reserveBalance = 0;
  const months = Array.from({ length: totalMonths }, (_, monthIndex) => {
    const yearIndex = Math.floor(monthIndex / 12);
    const fuel = (((scenario.annualKm * model.consumptionLPer100Km) / 100) * scenario.fuelPrice) / 12;
    const insurance = valueAt(scenario.insuranceByYear, yearIndex) / 12;
    const tax = model.taxAnnual / 12;
    const service = valueAt(scenario.serviceByYear, yearIndex) / 12;
    const fluids = valueAt(scenario.fluidsByYear, yearIndex) / 12;
    const consumables = valueAt(scenario.consumablesByYear, yearIndex) / 12;
    const tires = valueAt(scenario.tiresByYear, yearIndex) / 12;
    const washing = valueAt(scenario.washingByYear, yearIndex) / 12;
    const fines = valueAt(scenario.finesByYear, yearIndex) / 12;
    const month = monthIndex + 1;
    const scheduledEvents = events.reduce(
      (sum, event) =>
        sum +
        (event.enabled && event.mode === 'SCHEDULED' && (dueMonthByEvent.get(event.id) ?? 1) === month
          ? event.repairCost * event.coefficient
          : 0),
      0,
    );
    const expectedRepairs = events.reduce(
      (sum, event) =>
        sum +
        (event.enabled && event.mode !== 'SCHEDULED' && (dueMonthByEvent.get(event.id) ?? 1) === month
          ? event.probability5y * event.repairCost * event.coefficient
          : 0),
      0,
    );
    const deferredFacts = deferredByMonth[monthIndex];
    const regularExpenses = fuel + insurance + tax + service + fluids + consumables + tires + washing + fines;
    const repairOutflow = deferredFacts + scheduledEvents + expectedRepairs;
    const deferredReserve = deferredByMonth.reduce(
      (sum, value, index) => sum + (index < monthIndex || value === 0 ? 0 : value / (index + 1)),
      0,
    );
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
    const fuel = ((scenario.annualKm * model.consumptionLPer100Km) / 100) * scenario.fuelPrice;
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
  const expectedUncertainty = events.reduce(
    (sum, event) =>
      sum + (event.enabled ? event.probability5y * event.repairCost * Math.max(0, event.coefficient - 1) : 0),
    0,
  );
  const complete = scenarioIsComplete(config);
  const fullCost = calculationPrice + immediateSafeRestoreCost + totalCost;

  return {
    years: yearsResult,
    totalCost,
    averageMonthlyCost: totalCost / (years * 12),
    fullFiveYearCost: fullCost,
    fullAverageMonthlyCost: fullCost / (years * 12),
    expectedMajorRepairs5y,
    expectedMajorRepairsPerYear: expectedMajorRepairs5y / years,
    probabilityAnyLimitViolation: simulated.anyLimit,
    probabilityAnyMajorRepairLimitViolation: simulated.anyMajor,
    probabilityAnyMajorRepair: simulated.anyMajorRepair,
    probabilityCloseMajorRepairs: simulated.closeMajor,
    probabilityCriticalRepair: simulated.critical,
    probabilityEngineEvent:
      1 -
      events
        .filter((event) => event.enabled && event.category === 'engine')
        .reduce((product, event) => product * (1 - event.probability5y), 1),
    probabilityTransmissionEvent:
      1 -
      events
        .filter((event) => event.enabled && event.category === 'transmission')
        .reduce((product, event) => product * (1 - event.probability5y), 1),
    uncertaintyLoad: fullUncertaintyPremium + expectedUncertainty,
    eventRows,
    months,
    questionFactsCount: inspection.facts.filter((fact) => fact.status === 'QUESTION').length,
    confirmedFactsCount: inspection.facts.filter((fact) => fact.status === 'CONFIRMED').length,
    questionShare:
      inspection.facts.length > 0
        ? inspection.facts.filter((fact) => fact.status === 'QUESTION').length / inspection.facts.length
        : 0,
    complete,
  };
}

function ratingFor(
  config: AppConfig,
  restoreBudget: number,
  remainingBudget: number,
  forecast: ForecastResult,
  criticalBodyRisks: BodyRisk[],
  otherBodyRisks: BodyRisk[],
  unknownCostCount: number,
  askingPrice: number,
  vehicle: VehicleInfo,
): RatingResult {
  const years = forecastYears(config);
  const annualLimit = config.scenario.annualLimit > 0 ? config.scenario.annualLimit : 1;
  const hardBlocks: string[] = [];
  const warnings: string[] = [];
  if (askingPrice > config.maxAskingPrice)
    hardBlocks.push(`Цена объявления выше ${config.maxAskingPrice.toLocaleString('ru-RU')} ₽.`);
  if (remainingBudget < 0) hardBlocks.push('Безопасная смета превышает доступный бюджет доведения.');
  if (unknownCostCount > 0)
    hardBlocks.push(
      unknownCostCount === 1
        ? 'Есть работа без оценённой стоимости — смета неполная.'
        : `Работ без оценённой стоимости: ${unknownCostCount} — смета неполная.`,
    );
  if (criticalBodyRisks.length > 0) hardBlocks.push('Есть критический кузовной или геометрический риск.');
  if (otherBodyRisks.length > 0) warnings.push('Отмечен кузовной риск, оцениваемый как ремонтная работа.');
  if (!forecast.complete) hardBlocks.push('Прогноз владения настроен не полностью.');
  if (forecast.years.some((year) => year.expectedTotal > config.scenario.annualLimit)) {
    hardBlocks.push(
      `Ожидаемые расходы одного из годов выше лимита ${config.scenario.annualLimit.toLocaleString('ru-RU')} ₽.`,
    );
  }
  if (remainingBudget >= 0 && restoreBudget > 0 && remainingBudget / restoreBudget < config.greenReserveRatio) {
    warnings.push('Запас доведения ниже зелёной зоны.');
  }
  if (forecast.probabilityAnyLimitViolation > 0)
    warnings.push(
      `Есть модельная вероятность превышения годового лимита: ${(forecast.probabilityAnyLimitViolation * 100).toFixed(1)}%.`,
    );
  if (forecast.probabilityCloseMajorRepairs > 0)
    warnings.push(
      `Есть модельная вероятность двух крупных ремонтов ближе чем через ${config.minMonthsBetweenMajorRepairs} месяца.`,
    );

  const ratio = restoreBudget > 0 ? remainingBudget / restoreBudget : 0;
  const greenRatio = config.greenReserveRatio > 0 ? config.greenReserveRatio : 1;
  const budgetScore = clamp((ratio / greenRatio) * 100, 0, 100);
  const avgAnnual = forecast.totalCost / years;
  const ownershipScore = clamp((1 - avgAnnual / annualLimit) * 100, 0, 100);
  const annualRiskScore = (1 - forecast.probabilityAnyLimitViolation) * 100;
  const majorLimit = config.majorRepairsPerYearLimit > 0 ? config.majorRepairsPerYearLimit : 1;
  const frequencyScore = clamp((1 - forecast.expectedMajorRepairsPerYear / majorLimit) * 100, 0, 100);
  const maxScore = (1 - forecast.probabilityCriticalRepair) * 100;
  const engineScore = (1 - forecast.probabilityEngineEvent) * 100;
  const transmissionScore = (1 - forecast.probabilityTransmissionEvent) * 100;
  const predictabilityScore = clamp((1 - forecast.uncertaintyLoad / (years * annualLimit)) * 100, 0, 100);
  const expectedServiceAnnual =
    forecast.years.reduce(
      (sum, year) => sum + year.expectedRepairs + year.service + year.fluids + year.consumables + year.tires,
      0,
    ) / years;
  const serviceScore = clamp((1 - expectedServiceAnnual / annualLimit) * 100, 0, 100);
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
    [
      'vehicle-info',
      'История и комплектность автомобиля',
      config.ratingWeights.vehicleInfo ?? 0,
      vehicleInfoRatingScore,
    ],
  ] as const;
  const components = rawComponents.map(([id, label, weight, score]) => ({
    id,
    label,
    weight,
    score: roundCurrency(score * 10) / 10,
  }));
  const weightTotal = components.reduce((sum, component) => sum + Math.max(0, component.weight), 0);
  if (weightTotal <= 0) warnings.push('Все веса рейтинга обнулены — итоговый балл не рассчитывается.');
  const score =
    weightTotal > 0
      ? components.reduce((sum, component) => sum + (component.score * Math.max(0, component.weight)) / weightTotal, 0)
      : null;
  return {
    score: score === null ? null : roundCurrency(score * 10) / 10,
    components,
    hardBlocks,
    warnings,
    status:
      hardBlocks.length > 0
        ? 'BLOCKED'
        : forecast.complete && forecast.questionFactsCount === 0
          ? 'VALID'
          : 'PROVISIONAL',
  };
}

export function calculateInspection(inspection: Inspection, config = inspection.configSnapshot): CalculationResult {
  const { price: calculationPrice, source: priceSource } = priceFor(inspection);
  const restoreBudget = config.fund - calculationPrice;
  const calculatedFacts: CalculatedFact[] = inspection.facts.map((fact) => {
    const coefficient = coefficientFor(fact, config);
    return {
      ...fact,
      coefficient,
      safeCost:
        fact.kind === 'WORK' && fact.statedCost !== undefined ? roundCurrency(statedCostOf(fact) * coefficient) : 0,
    };
  });
  const workFacts = calculatedFacts.filter((fact) => fact.kind === 'WORK');
  const statedRestoreCost = workFacts.reduce((sum, fact) => sum + statedCostOf(fact), 0);
  const immediateSafeRestoreCost = workFacts
    .filter((fact) => fact.urgency === 'NOW')
    .reduce((sum, fact) => sum + fact.safeCost, 0);
  const nearTermSafeRestoreCost = workFacts
    .filter((fact) => fact.urgency === 'NOW' || fact.urgency === 'SOON')
    .reduce((sum, fact) => sum + fact.safeCost, 0);
  const fullSafeRestoreCost = workFacts.reduce((sum, fact) => sum + fact.safeCost, 0);
  const deferredSafeRestoreCost = fullSafeRestoreCost - immediateSafeRestoreCost;
  const safeRestoreCost = immediateSafeRestoreCost;
  const uncertaintyPremium =
    safeRestoreCost -
    workFacts.filter((fact) => fact.urgency === 'NOW').reduce((sum, fact) => sum + statedCostOf(fact), 0);
  const fullUncertaintyPremium = fullSafeRestoreCost - statedRestoreCost;
  const remainingBudget = restoreBudget - safeRestoreCost;
  const fullRemainingBudget = restoreBudget - fullSafeRestoreCost;
  const reserveRatio = restoreBudget > 0 ? remainingBudget / restoreBudget : null;
  const fullReserveRatio = restoreBudget > 0 ? fullRemainingBudget / restoreBudget : null;
  const zone =
    inspection.pricing.askingPrice > config.maxAskingPrice
      ? 'FILTER_FAIL'
      : reserveRatio !== null && reserveRatio >= config.greenReserveRatio
        ? 'GREEN'
        : reserveRatio !== null && reserveRatio >= config.yellowReserveRatio
          ? 'YELLOW'
          : 'RED';
  const bodyRisks = Array.from(new Set(inspection.facts.flatMap((fact) => fact.bodyRisks)));
  const criticalBodyRisks = bodyRisks.filter((risk) => CRITICAL_BODY_RISKS.includes(risk));
  const otherBodyRisks = bodyRisks.filter((risk) => !CRITICAL_BODY_RISKS.includes(risk));
  const unknownCostCount = inspection.facts.filter((fact) => fact.kind === 'WORK' && !(statedCostOf(fact) > 0)).length;
  const questionFactsCount = inspection.facts.filter((fact) => fact.status === 'QUESTION').length;
  const confirmedFactsCount = inspection.facts.filter((fact) => fact.status === 'CONFIRMED').length;
  const questionShare = inspection.facts.length > 0 ? questionFactsCount / inspection.facts.length : 0;
  const forecast = calculateForecast(inspection, config, calculationPrice, safeRestoreCost, fullUncertaintyPremium);
  const rating = ratingFor(
    config,
    restoreBudget,
    remainingBudget,
    forecast,
    criticalBodyRisks,
    otherBodyRisks,
    unknownCostCount,
    inspection.pricing.askingPrice,
    inspection.vehicle,
  );
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
    bodyRisks,
    criticalBodyRisks,
    otherBodyRisks,
    unknownCostCount,
    questionFactsCount,
    confirmedFactsCount,
    questionShare,
    forecast,
    rating,
  };
}

export function categoryName(category: CategoryId): string {
  return categoryLabel(category);
}
