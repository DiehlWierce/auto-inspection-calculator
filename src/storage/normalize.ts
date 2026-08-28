import { DEFAULT_CONFIG, cloneConfig } from '../config';
import type { AppConfig, InspectionTemplate, PriceRangeRule, RepairEvent } from '../types';

export function normalizeConfig(stored: AppConfig | undefined): AppConfig {
  if (!stored) return cloneConfig(DEFAULT_CONFIG);
  const fallback = cloneConfig(DEFAULT_CONFIG);
  return {
    ...fallback,
    ...stored,
    ratingWeights: { ...fallback.ratingWeights, ...stored.ratingWeights },
    scenario: {
      ...fallback.scenario,
      ...stored.scenario,
      insuranceByYear: stored.scenario?.insuranceByYear ?? fallback.scenario.insuranceByYear,
      serviceByYear: stored.scenario?.serviceByYear ?? fallback.scenario.serviceByYear,
      fluidsByYear: stored.scenario?.fluidsByYear ?? fallback.scenario.fluidsByYear,
      consumablesByYear: stored.scenario?.consumablesByYear ?? fallback.scenario.consumablesByYear,
      tiresByYear: stored.scenario?.tiresByYear ?? fallback.scenario.tiresByYear,
      washingByYear: stored.scenario?.washingByYear ?? fallback.scenario.washingByYear,
      finesByYear: stored.scenario?.finesByYear ?? fallback.scenario.finesByYear,
    },
    models: fallback.models.map((baseModel) => {
      const storedModel = stored.models?.find((model) => model.id === baseModel.id);
      return { ...baseModel, ...storedModel, engineVariants: storedModel?.engineVariants ?? baseModel.engineVariants };
    }).concat((stored.models ?? []).filter((model) => !fallback.models.some((baseModel) => baseModel.id === model.id)).map((model) => ({
      ...model,
      engineVariants: model.engineVariants?.length ? model.engineVariants : [{ id: 'unknown', label: 'Код двигателя не установлен', code: '', timingDrive: 'UNKNOWN', note: 'Уточните код двигателя и тип привода ГРМ.' }],
    }))),
    coefficients: Array.isArray(stored.coefficients) ? stored.coefficients : fallback.coefficients,
    priceBook: normalizePriceBook(stored.priceBook, fallback.priceBook),
    repairEvents: normalizeRepairEvents(stored.repairEvents, fallback.repairEvents),
    templates: normalizeTemplates(stored.templates, fallback.templates),
  };
}

function normalizeTemplates(storedTemplates: InspectionTemplate[] | undefined, fallbackTemplates: InspectionTemplate[]): InspectionTemplate[] {
  if (!Array.isArray(storedTemplates)) return fallbackTemplates;
  const builtIn = fallbackTemplates.map((fallback) => {
    const stored = storedTemplates.find((template) => template.id === fallback.id);
    return stored ? { ...fallback, ...stored, layout: stored.layout ?? fallback.layout } : fallback;
  });
  const custom = storedTemplates.filter((template) => !fallbackTemplates.some((fallback) => fallback.id === template.id));
  return [...builtIn, ...custom];
}

function normalizeRepairEvents(storedEvents: RepairEvent[] | undefined, fallbackEvents: RepairEvent[]): RepairEvent[] {
  if (!Array.isArray(storedEvents)) return fallbackEvents;
  const legacyTimingEvent = storedEvents.find((event) => event.id === 'timing-belt' && event.modelIds.includes('corolla-e120'));
  const withoutLegacy = storedEvents.filter((event) => event.id !== 'timing-belt' || !event.modelIds.includes('corolla-e120'));
  if (!legacyTimingEvent) return withoutLegacy;
  const chainFallback = fallbackEvents.find((event) => event.id === 'corolla-timing-chain');
  const beltFallback = fallbackEvents.find((event) => event.id === 'timing-belt');
  return [...withoutLegacy, ...(chainFallback && !withoutLegacy.some((event) => event.id === chainFallback.id) ? [chainFallback] : []), ...(beltFallback && !withoutLegacy.some((event) => event.id === beltFallback.id) ? [beltFallback] : [])];
}

function normalizePriceBook(storedRules: PriceRangeRule[] | undefined, fallbackRules: PriceRangeRule[]): PriceRangeRule[] {
  if (!Array.isArray(storedRules)) return fallbackRules;
  const merged = fallbackRules.map((rule) => ({ ...rule, ...storedRules.find((item) => item.id === rule.id) }));
  return [...merged, ...storedRules.filter((rule) => !fallbackRules.some((item) => item.id === rule.id))];
}
