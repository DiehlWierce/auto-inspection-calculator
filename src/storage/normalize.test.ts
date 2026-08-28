import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, cloneConfig } from '../config';
import { calculateInspection } from '../calc';
import { normalizeConfig } from './normalize';
import type { AppConfig, Inspection } from '../types';

function legacyConfig(): AppConfig {
  const config = cloneConfig(DEFAULT_CONFIG);
  delete (config as Partial<AppConfig>).priceBook;
  config.version = 'seed-2026-08-27';
  return config;
}

describe('normalizeConfig migrations', () => {
  it('fills the price book in for a config stored without one', () => {
    const normalized = normalizeConfig(legacyConfig());
    expect(normalized.priceBook.length).toBe(DEFAULT_CONFIG.priceBook.length);
  });

  it('keeps user edits of known price book rules and custom rules', () => {
    const stored = cloneConfig(DEFAULT_CONFIG);
    stored.priceBook = [
      { ...stored.priceBook[0], typical: 99000 },
      { id: 'my-rule', label: 'Своя работа', category: 'other', min: 1, typical: 2, max: 3 },
    ];
    const normalized = normalizeConfig(stored);
    expect(normalized.priceBook.find((rule) => rule.id === stored.priceBook[0].id)?.typical).toBe(99000);
    expect(normalized.priceBook.find((rule) => rule.id === 'my-rule')).toBeDefined();
    expect(normalized.priceBook.length).toBe(DEFAULT_CONFIG.priceBook.length + 1);
  });

  it('заменяет справочник вилок уровня категории на разбор «запчасти + работа»', () => {
    const stored = cloneConfig(DEFAULT_CONFIG);
    stored.version = 'seed-2026-08-28';
    stored.priceBook = [
      { id: 'brakes', label: 'Тормоза', category: 'brakes', min: 7000, typical: 18000, max: 38000 },
      { id: 'tires', label: 'Резина', category: 'tires', min: 12000, typical: 24000, max: 45000 },
      { id: 'my-rule', label: 'Своя работа', category: 'other', min: 1, typical: 2, max: 3 },
    ];
    const normalized = normalizeConfig(stored);
    const brakes = normalized.priceBook.find((rule) => rule.id === 'brakes')!;
    expect(brakes.typical).not.toBe(18000);
    expect(brakes.parts).toBeDefined();
    expect(normalized.priceBook.find((rule) => rule.id === 'my-rule')?.typical).toBe(2);
    expect(normalized.priceBook.length).toBe(DEFAULT_CONFIG.priceBook.length + 1);
  });

  it('подставляет ставку нормо-часа и коэффициент запчастей в старую конфигурацию', () => {
    const stored = cloneConfig(DEFAULT_CONFIG);
    delete (stored as Partial<AppConfig>).laborRate;
    stored.models = stored.models.map((model) => { const copy = { ...model }; delete copy.partsFactor; return copy; });
    const normalized = normalizeConfig(stored);
    expect(normalized.laborRate).toEqual(DEFAULT_CONFIG.laborRate);
    expect(normalized.models.find((model) => model.id === 'lacetti-hatch')?.partsFactor).toBe(0.92);
  });

  it('returns the default config for an empty store', () => {
    expect(normalizeConfig(undefined).priceBook.length).toBeGreaterThan(0);
  });

  it('calculates an old inspection snapshot without crashing', () => {
    const inspection: Inspection = {
      id: 'old', createdAt: '2026-08-27T00:00:00.000Z', updatedAt: '2026-08-27T00:00:00.000Z',
      status: 'IN_PROGRESS', vehicle: { modelId: 'corolla-e120', year: 2006, mileage: 240000 },
      pricing: { askingPrice: 390000, expectedDiscount: 0 },
      facts: [{ id: '1', sequence: 1, kind: 'WORK', category: 'brakes', subcategory: 'Диски и колодки', description: 'Колодки', statedCost: 12000, urgency: 'NOW', status: 'CONFIRMED', comment: '', bodyRisks: [], createdAt: '', updatedAt: '' }],
      eventOverrides: {}, configSnapshot: normalizeConfig(legacyConfig()),
    };
    const result = calculateInspection(inspection);
    expect(result.calculatedFacts[0].costSource).toBe('STATED');
    expect(result.forecast.months).toHaveLength(60);
  });
});
