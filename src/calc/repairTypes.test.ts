import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, cloneConfig } from '../config';
import { repairTypeId, resolvePriceRange } from './repairTypes';
import type { Fact } from '../types';

function fact(overrides: Partial<Fact> = {}): Fact {
  return {
    id: 'f', sequence: 1, kind: 'WORK', category: 'suspension', subcategory: 'Передняя',
    description: 'Стойки', urgency: 'NOW', status: 'CONFIRMED', comment: '', bodyRisks: [],
    createdAt: '', updatedAt: '', ...overrides,
  };
}

describe('repairTypeId', () => {
  it('detects engine work depth by keywords', () => {
    expect(repairTypeId(fact({ category: 'engine', subcategory: 'Крупный ремонт', description: '' }))).toBe('engine-major');
    expect(repairTypeId(fact({ category: 'engine', subcategory: '', description: 'Нужен капиталный ремонт' }))).toBe('engine-major');
    expect(repairTypeId(fact({ category: 'engine', subcategory: 'Средний ремонт', description: '' }))).toBe('engine-medium');
    expect(repairTypeId(fact({ category: 'engine', subcategory: 'Диагностика', description: '' }))).toBe('engine-diagnostic');
    expect(repairTypeId(fact({ category: 'engine', subcategory: 'Мелкий ремонт', description: '' }))).toBe('engine-minor');
  });

  it('detects transmission and body work types', () => {
    expect(repairTypeId(fact({ category: 'transmission', subcategory: 'Ремонт', description: '' }))).toBe('transmission-repair');
    expect(repairTypeId(fact({ category: 'transmission', subcategory: 'Обслуживание', description: '' }))).toBe('transmission-service');
    expect(repairTypeId(fact({ category: 'body', subcategory: 'Сварка', description: '' }))).toBe('body-welding');
    expect(repairTypeId(fact({ category: 'body', subcategory: 'Геометрия', description: '' }))).toBe('body-geometry');
    expect(repairTypeId(fact({ category: 'body', subcategory: 'Полный окрас', description: '' }))).toBe('body-paint');
    expect(repairTypeId(fact({ category: 'body', subcategory: 'Локальный ремонт', description: '' }))).toBe('body-local');
  });

  it('falls back to the plain category id', () => {
    expect(repairTypeId(fact({ category: 'brakes' }))).toBe('brakes');
    expect(repairTypeId(fact({ category: 'tires' }))).toBe('tires');
  });
});

describe('resolvePriceRange', () => {
  it('resolves a range by repair type id', () => {
    const range = resolvePriceRange(fact({ category: 'engine', subcategory: 'Крупный ремонт' }), DEFAULT_CONFIG);
    expect(range?.id).toBe('engine-major');
    expect(range!.min).toBeLessThan(range!.typical);
    expect(range!.typical).toBeLessThan(range!.max);
  });

  it('falls back to any rule of the same category', () => {
    const config = cloneConfig(DEFAULT_CONFIG);
    config.priceBook = config.priceBook.filter((rule) => rule.id !== 'engine-major');
    const range = resolvePriceRange(fact({ category: 'engine', subcategory: 'Крупный ремонт' }), config);
    expect(range?.category).toBe('engine');
    expect(range?.id).not.toBe('engine-major');
  });

  it('returns null when the price book has nothing for the category', () => {
    const config = cloneConfig(DEFAULT_CONFIG);
    config.priceBook = config.priceBook.filter((rule) => rule.category !== 'engine');
    expect(resolvePriceRange(fact({ category: 'engine', subcategory: 'Крупный ремонт' }), config)).toBeNull();
  });

  it('survives a config stored without a price book', () => {
    const config = cloneConfig(DEFAULT_CONFIG);
    delete (config as { priceBook?: unknown }).priceBook;
    expect(resolvePriceRange(fact(), config)).toBeNull();
  });
});
