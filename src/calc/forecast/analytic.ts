import { intensityByMonth } from './model';
import type { ForecastModel } from './model';

const Z_SCORES = { p50: 0, p80: 0.8416212335729143, p90: 1.2815515655446004 } as const;

export interface AnalyticForecast {
  meanMonth: number[];
  p50Month: number[];
  p80Month: number[];
  p90Month: number[];
  meanYear: number[];
  p80Year: number[];
  p90Year: number[];
  expectedEventSpend5y: number;
  expectedRecurringSpend5y: number;
  expectedOneShotSpend5y: number;
  expectedMajorRepairs5y: number;
  eventExpected5y: Map<string, number>;
  probabilityEngineEvent: number;
  probabilityTransmissionEvent: number;
}

function cornishFisher(mean: number, variance: number, thirdCumulant: number, z: number): number {
  if (variance <= 0) return Math.max(0, mean);
  const sd = Math.sqrt(variance);
  const skew = thirdCumulant / (sd * sd * sd);
  const adjusted = z + (z * z - 1) * skew / 6;
  return Math.max(0, mean + sd * adjusted);
}

function aggregateYears(values: number[], years: number): number[] {
  return Array.from({ length: years }, (_, yearIndex) => values.slice(yearIndex * 12, yearIndex * 12 + 12).reduce((sum, value) => sum + value, 0));
}

function occurrenceProbability(intensity: number[]): number {
  return 1 - intensity.reduce((product, rate) => product * (1 - Math.min(1, rate)), 1);
}

export function calculateAnalytic(model: ForecastModel, years: number, majorRepairThreshold: number): AnalyticForecast {
  const totalMonths = model.totalMonths;
  const meanMonth = Array.from({ length: totalMonths }, () => 0);
  const varianceMonth = Array.from({ length: totalMonths }, () => 0);
  const thirdMonth = Array.from({ length: totalMonths }, () => 0);
  const eventExpected5y = new Map<string, number>();
  const intensities = new Map<string, number[]>();
  let expectedRecurringSpend5y = 0;
  let expectedOneShotSpend5y = 0;
  let expectedMajorRepairs5y = 0;

  for (const prepared of model.events) {
    if (prepared.mode === 'SCHEDULED') {
      eventExpected5y.set(prepared.event.id, prepared.costMode);
      continue;
    }
    const intensity = intensityByMonth(prepared, model.wearByMonth);
    intensities.set(prepared.event.id, intensity);
    let expected = 0;
    let occurrences = 0;
    for (let index = 0; index < totalMonths; index += 1) {
      const rate = intensity[index];
      if (rate <= 0) continue;
      meanMonth[index] += rate * prepared.costMean;
      varianceMonth[index] += rate * (prepared.costMean * prepared.costMean + prepared.costVariance);
      thirdMonth[index] += rate * prepared.costMoment3;
      expected += rate * prepared.costMean;
      occurrences += rate;
    }
    eventExpected5y.set(prepared.event.id, expected);
    if (prepared.recurrenceMonths > 0) expectedRecurringSpend5y += expected;
    else expectedOneShotSpend5y += expected;
    if (prepared.riskCost >= majorRepairThreshold) expectedMajorRepairs5y += occurrences;
  }

  const meanYear = aggregateYears(meanMonth, years);
  const varianceYear = aggregateYears(varianceMonth, years);
  const thirdYear = aggregateYears(thirdMonth, years);
  const categoryProbability = (category: string) => {
    const parts = model.events.filter((prepared) => prepared.event.category === category);
    if (parts.length === 0) return 0;
    return 1 - parts.reduce((product, prepared) => {
      const intensity = intensities.get(prepared.event.id);
      const probability = intensity ? occurrenceProbability(intensity) : 1;
      return product * (1 - probability);
    }, 1);
  };

  return {
    meanMonth,
    p50Month: meanMonth.map((mean, index) => cornishFisher(mean, varianceMonth[index], thirdMonth[index], Z_SCORES.p50)),
    p80Month: meanMonth.map((mean, index) => cornishFisher(mean, varianceMonth[index], thirdMonth[index], Z_SCORES.p80)),
    p90Month: meanMonth.map((mean, index) => cornishFisher(mean, varianceMonth[index], thirdMonth[index], Z_SCORES.p90)),
    meanYear,
    p80Year: meanYear.map((mean, index) => cornishFisher(mean, varianceYear[index], thirdYear[index], Z_SCORES.p80)),
    p90Year: meanYear.map((mean, index) => cornishFisher(mean, varianceYear[index], thirdYear[index], Z_SCORES.p90)),
    expectedEventSpend5y: expectedRecurringSpend5y + expectedOneShotSpend5y,
    expectedRecurringSpend5y,
    expectedOneShotSpend5y,
    expectedMajorRepairs5y,
    eventExpected5y,
    probabilityEngineEvent: categoryProbability('engine'),
    probabilityTransmissionEvent: categoryProbability('transmission'),
  };
}

export function fiveYearPercentile(model: ForecastModel, deterministic: number, z: number): number {
  let mean = 0;
  let variance = 0;
  let third = 0;
  for (const prepared of model.events) {
    if (prepared.mode === 'SCHEDULED') continue;
    for (const rate of intensityByMonth(prepared, model.wearByMonth)) {
      if (rate <= 0) continue;
      mean += rate * prepared.costMean;
      variance += rate * (prepared.costMean * prepared.costMean + prepared.costVariance);
      third += rate * prepared.costMoment3;
    }
  }
  return deterministic + cornishFisher(mean, variance, third, z);
}

export const P80_Z = Z_SCORES.p80;
