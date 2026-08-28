import type { AppConfig, Fact, PriceRangeRule } from '../types';

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

export function resolvePriceRange(fact: Fact, config: AppConfig): PriceRangeRule | null {
  const id = repairTypeId(fact);
  const priceBook = config.priceBook ?? [];
  return priceBook.find((item) => item.id === id)
    ?? priceBook.find((item) => item.category === fact.category)
    ?? null;
}
