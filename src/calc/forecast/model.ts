import { clamp } from '../../utils';
import type { AppConfig, Inspection, RepairEvent, WearConfig } from '../../types';

export interface EffectiveEvent extends RepairEvent {
  enabled: boolean;
}

export interface PreparedEvent {
  event: EffectiveEvent;
  mode: 'RISK' | 'SCHEDULED';
  recurrenceMonths: number;
  ageSensitive: boolean;
  costMean: number;
  costVariance: number;
  costMoment3: number;
  costMin: number;
  costMode: number;
  costMax: number;
  riskCost: number;
  hazard: number;
  monthStart: number;
  monthEnd: number;
  scheduledMonth: number;
}

export interface ForecastModel {
  events: PreparedEvent[];
  eventRows: EffectiveEvent[];
  wearByMonth: number[];
  totalMonths: number;
}

export function effectiveEvent(event: RepairEvent, inspection: Inspection): EffectiveEvent {
  const override = inspection.eventOverrides?.[event.id];
  const mode = override?.mode ?? event.mode ?? 'RISK';
  const scheduledMonth = Math.max(1, Math.round(override?.scheduledMonth ?? event.scheduledMonth ?? event.monthStart));
  return {
    ...event,
    ...override,
    mode,
    scheduledMonth,
    recurrenceMonths: Math.max(0, Math.round(override?.recurrenceMonths ?? event.recurrenceMonths ?? 0)),
    ageSensitive: event.ageSensitive ?? mode === 'RISK',
    probability5y: mode === 'SCHEDULED' ? 1 : clamp(override?.probability5y ?? event.probability5y, 0, 1),
    repairCost: Math.max(0, override?.repairCost ?? event.repairCost),
    coefficient: Math.max(0, override?.coefficient ?? event.coefficient),
    maxCost: Math.max(0, override?.maxCost ?? event.maxCost),
    monthStart: mode === 'SCHEDULED' ? scheduledMonth : Math.max(1, Math.round(override?.monthStart ?? event.monthStart)),
    monthEnd: mode === 'SCHEDULED' ? scheduledMonth : Math.max(1, Math.round(override?.monthEnd ?? event.monthEnd)),
    enabled: override?.enabled !== false,
  };
}

export function wearMultiplier(ageYears: number, mileageKm: number, wear: WearConfig): number {
  const value = 1
    + wear.agePerYear * Math.max(0, ageYears - wear.refAgeYears)
    + wear.mileagePer100k * Math.max(0, (mileageKm - wear.refMileageKm) / 100000);
  return clamp(value, wear.min, wear.maxMultiplier);
}

export function wearCurve(inspection: Inspection, config: AppConfig, totalMonths: number): number[] {
  const baseAge = Math.max(0, new Date().getFullYear() - inspection.vehicle.year);
  const baseMileage = Math.max(0, inspection.vehicle.mileage);
  return Array.from({ length: totalMonths }, (_, index) => {
    const months = (index + 1) / 12;
    return wearMultiplier(baseAge + months, baseMileage + config.scenario.annualKm * months, config.wear);
  });
}

function rawMoment(a: number, b: number, mode: number, power: number): number {
  const p1 = power + 1;
  const p2 = power + 2;
  let total = 0;
  if (mode > a) {
    const left = (mode ** p2 - a ** p2) / p2 - a * (mode ** p1 - a ** p1) / p1;
    total += left / (mode - a);
  }
  if (b > mode) {
    const right = b * (b ** p1 - mode ** p1) / p1 - (b ** p2 - mode ** p2) / p2;
    total += right / (b - mode);
  }
  return 2 * total / (b - a);
}

export function triangularMoments(repairCost: number, coefficient: number, maxCost: number): { mean: number; variance: number; moment3: number; min: number; mode: number; max: number } {
  const a = Math.max(0, repairCost);
  const rawMode = a * (coefficient > 0 ? coefficient : 1);
  const b = Math.max(maxCost, rawMode, a);
  const mode = clamp(rawMode, a, b);
  if (b <= a) return { mean: a, variance: 0, moment3: a ** 3, min: a, mode: a, max: a };
  const mean = rawMoment(a, b, mode, 1);
  const second = rawMoment(a, b, mode, 2);
  return { mean, variance: Math.max(0, second - mean * mean), moment3: rawMoment(a, b, mode, 3), min: a, mode, max: b };
}

export function sampleTriangular(min: number, mode: number, max: number, random: () => number): number {
  if (max <= min) return min;
  const split = (mode - min) / (max - min);
  const value = random();
  return value < split
    ? min + Math.sqrt(value * (max - min) * (mode - min))
    : max - Math.sqrt((1 - value) * (max - min) * (max - mode));
}

export function prepareEvent(event: EffectiveEvent, totalMonths: number): PreparedEvent {
  const mode = event.mode ?? 'RISK';
  const start = clamp(event.monthStart, 1, totalMonths);
  const end = clamp(Math.max(start, event.monthEnd), start, totalMonths);
  const width = end - start + 1;
  const recurrenceMonths = mode === 'SCHEDULED' ? 0 : Math.max(0, event.recurrenceMonths ?? 0);
  const cost = triangularMoments(event.repairCost, event.coefficient, event.maxCost);
  const hazard = mode === 'SCHEDULED'
    ? 0
    : recurrenceMonths > 0
      ? event.probability5y / recurrenceMonths
      : 1 - (1 - event.probability5y) ** (1 / width);
  return {
    event,
    mode,
    recurrenceMonths,
    ageSensitive: event.ageSensitive ?? mode === 'RISK',
    costMean: cost.mean,
    costVariance: cost.variance,
    costMoment3: cost.moment3,
    costMin: cost.min,
    costMode: cost.mode,
    costMax: cost.max,
    riskCost: event.maxCost > 0 ? event.maxCost : cost.mode,
    hazard,
    monthStart: start,
    monthEnd: end,
    scheduledMonth: clamp(event.scheduledMonth ?? start, 1, totalMonths),
  };
}

export function buildForecastModel(inspection: Inspection, config: AppConfig): ForecastModel {
  const model = config.models.find((item) => item.id === inspection.vehicle.modelId) ?? config.models[0];
  const totalMonths = config.scenario.years * 12;
  const eventRows = [...config.repairEvents, ...(inspection.customEvents ?? [])]
    .filter((event) => event.modelIds.includes(model.id) && inspection.eventOverrides?.[event.id]?.removed !== true)
    .map((event) => effectiveEvent(event, inspection));
  return {
    events: eventRows.filter((event) => event.enabled).map((event) => prepareEvent(event, totalMonths)),
    eventRows,
    wearByMonth: wearCurve(inspection, config, totalMonths),
    totalMonths,
  };
}

export function intensityByMonth(prepared: PreparedEvent, wearByMonth: number[]): number[] {
  const totalMonths = wearByMonth.length;
  const intensity = Array.from({ length: totalMonths }, () => 0);
  if (prepared.mode === 'SCHEDULED' || prepared.hazard <= 0) return intensity;
  let survival = 1;
  for (let index = 0; index < totalMonths; index += 1) {
    const month = index + 1;
    if (month < prepared.monthStart || month > prepared.monthEnd) continue;
    const wear = prepared.ageSensitive ? wearByMonth[index] : 1;
    if (prepared.recurrenceMonths > 0) {
      intensity[index] = Math.min(1, prepared.hazard * wear);
      continue;
    }
    const rate = Math.min(1, prepared.hazard * wear);
    intensity[index] = rate * survival;
    survival *= 1 - rate;
  }
  return intensity;
}
