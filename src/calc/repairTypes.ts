import type { AppConfig, CostSpread, Fact, ModelId, PriceRangeRule } from '../types';

export function repairTypeId(fact: Pick<Fact, 'category' | 'subcategory' | 'description'>): string {
  const text = `${fact.subcategory} ${fact.description}`.toLowerCase();

  if (fact.category === 'engine') {
    if (text.includes('круп') || text.includes('капит')) return 'engine-major';
    if (text.includes('сред')) return 'engine-medium';
    if (text.includes('диаг')) return 'engine-diagnostic';
    return 'engine-minor';
  }
  if (fact.category === 'transmission') {
    if (text.includes('ремонт')) return 'transmission-repair';
    if (text.includes('диаг')) return 'transmission-diagnostic';
    return 'transmission-service';
  }
  if (fact.category === 'body') {
    if (text.includes('свар')) return 'body-welding';
    if (text.includes('геометр')) return 'body-geometry';
    if (text.includes('окрас') || text.includes('облив')) return 'body-paint';
    if (text.includes('несколько')) return 'body-multiple';
    return 'body-local';
  }

  return fact.category;
}

export function coefficientFor(fact: Fact, config: AppConfig): number {
  const id = repairTypeId(fact);
  return config.coefficients.find((item) => item.id === id)?.coefficient
    ?? config.coefficients.find((item) => item.category === fact.category)?.coefficient
    ?? 1.2;
}

/** Дежурные формулировки этапа осмотра не описывают работу и только сбивают подбор. */
const BOILERPLATE = /требует (ремонта|проверки)|исправно/g;

const normalizeText = (value: string): string => value.toLowerCase().replace(/ё/g, 'е').replace(BOILERPLATE, ' ');

/** Чем длиннее совпавшее ключевое слово, тем конкретнее работа: «задние колодки» точнее, чем «тормоз». */
function matchScore(rule: PriceRangeRule, text: string): number {
  if (!rule.match?.length) return 0;
  return rule.match.reduce((best, keyword) => {
    const normalized = normalizeText(keyword);
    return text.includes(normalized) ? Math.max(best, normalized.length) : best;
  }, 0);
}

function bestMatch(candidates: PriceRangeRule[], text: string): PriceRangeRule | null {
  if (!text.trim()) return null;
  return candidates.reduce<{ rule: PriceRangeRule | null; score: number }>((current, rule) => {
    const score = matchScore(rule, text);
    return score > current.score ? { rule, score } : current;
  }, { rule: null, score: 0 }).rule;
}

/**
 * Подбирает работу справочника по элементу осмотра и описанию факта, а не только по категории.
 * Описание важнее подкатегории блока: у элемента «Генератор» подкатегория «Диагностика»,
 * и подбор по ней дал бы вилку диагностики вместо вилки замены генератора.
 */
export function matchPriceRule(fact: Pick<Fact, 'category' | 'subcategory' | 'description'>, priceBook: PriceRangeRule[]): PriceRangeRule | null {
  const candidates = priceBook.filter((rule) => rule.category === fact.category);
  if (candidates.length === 0) return null;
  const matched = bestMatch(candidates, normalizeText(fact.description))
    ?? bestMatch(candidates, normalizeText(fact.subcategory));
  if (matched) return matched;

  const legacyId = repairTypeId(fact);
  return candidates.find((rule) => rule.id === legacyId)
    ?? candidates.find((rule) => rule.fallback)
    ?? candidates[0];
}

export function partsFactorFor(config: AppConfig, modelId: ModelId | undefined): number {
  if (!modelId) return 1;
  const factor = config.models.find((model) => model.id === modelId)?.partsFactor;
  return factor && factor > 0 ? factor : 1;
}

const roundTo = (value: number, step: number): number => Math.round(value / step) * step;

/** Масштабирует запчасти под конкретную модель; работа считается по той же ставке сервиса. */
function scaleToModel(rule: PriceRangeRule, factor: number): PriceRangeRule {
  if (factor === 1 || !rule.parts) return rule;
  const parts: CostSpread = {
    min: rule.parts.min * factor,
    typical: rule.parts.typical * factor,
    max: rule.parts.max * factor,
  };
  const labor: CostSpread = {
    min: rule.min - rule.parts.min,
    typical: rule.typical - rule.parts.typical,
    max: rule.max - rule.parts.max,
  };
  return {
    ...rule,
    parts,
    min: roundTo(Math.max(0, parts.min + labor.min), 100),
    typical: roundTo(Math.max(0, parts.typical + labor.typical), 100),
    max: roundTo(Math.max(0, parts.max + labor.max), 100),
  };
}

export function resolvePriceRange(fact: Fact, config: AppConfig, modelId?: ModelId): PriceRangeRule | null {
  const priceBook = config.priceBook ?? [];
  const rule = matchPriceRule(fact, priceBook);
  if (!rule) return null;
  return scaleToModel(rule, partsFactorFor(config, modelId));
}
