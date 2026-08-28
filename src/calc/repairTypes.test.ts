import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, cloneConfig } from '../config';
import { LABOR_RATE, priceFromBasis } from '../config/seeds.priceBook';
import { adaptTimingElement } from '../domain/layout';
import { CLASSIC_INSPECTION_LAYOUT } from '../inspectionTemplates';
import { repairTypeId, resolvePriceRange } from './repairTypes';
import type { Fact, TimingDrive } from '../types';

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

describe('подбор работы по элементу осмотра', () => {
  const forElement = (category: Fact['category'], subcategory: string, element: string, modelId = 'corolla-e120') =>
    resolvePriceRange(fact({ category, subcategory, description: `${element}: требует ремонта` }), DEFAULT_CONFIG, modelId);

  it('ставит элемент выше подкатегории блока', () => {
    // Блок «Электрика» размечен подкатегорией «Диагностика», но замена генератора — это не диагностика.
    expect(forElement('electrics', 'Диагностика', 'Генератор')?.id).toBe('electrics-alternator');
    expect(forElement('electrics', 'Диагностика', 'Стартер')?.id).toBe('electrics-starter');
    expect(forElement('cooling', 'Радиатор', 'Помпа')?.id).toBe('cooling-pump');
    expect(forElement('steering', 'Тяги и наконечники', 'Рулевая рейка')?.id).toBe('steering-rack-repair');
  });

  it('не путается в дежурной формулировке «требует ремонта»', () => {
    expect(forElement('transmission', 'Диагностика', 'Течи и состояние масла')?.id).toBe('transmission-seals');
  });

  it('берёт вилку категории, когда работа не опознана', () => {
    expect(forElement('other', 'Не классифицировано', 'Что-то непонятное')?.id).toBe('other');
  });

  it('разводит цепь и ремень ГРМ по типу привода', () => {
    const timingElement = (drive: TimingDrive) => adaptTimingElement(CLASSIC_INSPECTION_LAYOUT, drive)
      .flatMap((stage) => stage.blocks).flatMap((block) => block.elements).find((element) => element.includes('ГРМ'))!;
    expect(forElement('maintenance', 'Регламентные работы', timingElement('CHAIN'))?.id).toBe('maintenance-timing-chain');
    expect(forElement('maintenance', 'Регламентные работы', timingElement('BELT'))?.id).toBe('maintenance-timing-belt');
    expect(forElement('maintenance', 'Регламентные работы', timingElement('UNKNOWN'))?.id).toBe('maintenance-timing-unknown');
  });

  it('находит вилку для каждого элемента базового шаблона', () => {
    const unresolved = adaptTimingElement(CLASSIC_INSPECTION_LAYOUT, 'BELT')
      .flatMap((stage) => stage.blocks)
      .flatMap((block) => block.elements.map((element) => ({ block, element })))
      .filter(({ block, element }) => forElement(block.category, block.subcategory, element) === null);
    expect(unresolved).toEqual([]);
  });
});

describe('поправка на модель', () => {
  it('масштабирует запчасти и оставляет работу неизменной', () => {
    const description = 'Радиатор: замена';
    const corolla = resolvePriceRange(fact({ category: 'cooling', subcategory: 'Радиатор', description }), DEFAULT_CONFIG, 'corolla-e120')!;
    const lacetti = resolvePriceRange(fact({ category: 'cooling', subcategory: 'Радиатор', description }), DEFAULT_CONFIG, 'lacetti-hatch')!;
    expect(corolla.id).toBe(lacetti.id);
    expect(lacetti.typical).toBeLessThan(corolla.typical);
    expect(lacetti.parts!.typical / corolla.parts!.typical).toBeCloseTo(0.92 / 1.05, 6);
    // Работа одинакова у обеих машин, расхождение — только округление итога до сотни.
    const laborGap = Math.abs((corolla.typical - corolla.parts!.typical) - (lacetti.typical - lacetti.parts!.typical));
    expect(laborGap).toBeLessThan(100);
  });

  it('оставляет справочник как есть, когда модель неизвестна', () => {
    const range = resolvePriceRange(fact({ category: 'cooling', description: 'Радиатор' }), DEFAULT_CONFIG);
    expect(range?.typical).toBe(DEFAULT_CONFIG.priceBook.find((rule) => rule.id === 'cooling-radiator')?.typical);
  });
});

describe('состав справочника', () => {
  it('выводит каждую вилку из запчастей и нормо-часов', () => {
    for (const rule of DEFAULT_CONFIG.priceBook) {
      expect(rule.parts, rule.id).toBeDefined();
      expect(rule.laborHours, rule.id).toBeDefined();
      expect(rule.min).toBe(Math.round((rule.parts!.min + rule.laborHours!.min * LABOR_RATE.min) / 100) * 100);
      expect(rule.typical).toBe(Math.round((rule.parts!.typical + rule.laborHours!.typical * LABOR_RATE.typical) / 100) * 100);
      expect(rule.max).toBe(Math.round((rule.parts!.max + rule.laborHours!.max * LABOR_RATE.max) / 100) * 100);
      expect(rule.min).toBeLessThan(rule.typical);
      expect(rule.typical).toBeLessThan(rule.max);
    }
  });

  it('даёт каждой категории общую вилку на случай неопознанной работы', () => {
    for (const category of new Set(DEFAULT_CONFIG.priceBook.map((rule) => rule.category))) {
      expect(DEFAULT_CONFIG.priceBook.filter((rule) => rule.category === category && rule.fallback), category).toHaveLength(1);
    }
  });

  it('не содержит повторяющихся идентификаторов', () => {
    const ids = DEFAULT_CONFIG.priceBook.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('пересчёт по ставке нормо-часа', () => {
  it('меняет только часть работы и не трогает запчасти', () => {
    const chain = DEFAULT_CONFIG.priceBook.find((rule) => rule.id === 'maintenance-timing-chain')!;
    const pricier = priceFromBasis(chain, { min: 2000, typical: 2400, max: 3000 });
    expect(pricier.parts).toEqual(chain.parts);
    expect(pricier.typical).toBe(chain.parts!.typical + chain.laborHours!.typical * 2400);
    expect(pricier.typical).toBeGreaterThan(chain.typical);
  });

  it('на той же ставке ничего не меняет', () => {
    for (const rule of DEFAULT_CONFIG.priceBook) {
      expect(priceFromBasis(rule, LABOR_RATE)).toEqual(rule);
    }
  });

  it('оставляет как есть правило пользователя без разбора на запчасти и часы', () => {
    const custom = { id: 'my-rule', label: 'Своя работа', category: 'other' as const, min: 1, typical: 2, max: 3 };
    expect(priceFromBasis(custom, { min: 9000, typical: 9000, max: 9000 })).toEqual(custom);
  });
});
