import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, cloneConfig } from './config';
import { clearJournal, normalizeConfig, readJournal, snapshotConfig, writeJournal } from './storage';
import { BACKUP_SCHEMA_VERSION, BackupError, createBackup, parseBackup } from './backup';
import type { AppConfig, Inspection } from './types';

function inspection(overrides: Partial<Inspection> = {}): Inspection {
  return {
    id: 'test-inspection',
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
    status: 'IN_PROGRESS',
    vehicle: { modelId: 'corolla-e120', year: 2006, mileage: 240000 },
    pricing: { askingPrice: 390000, expectedDiscount: 0 },
    facts: [],
    eventOverrides: {},
    configSnapshot: cloneConfig(DEFAULT_CONFIG),
    ...overrides,
  };
}

describe('нормализация конфигурации', () => {
  it('возвращает конфигурацию по умолчанию для пустого и мусорного значения', () => {
    expect(normalizeConfig(undefined).fund).toBe(DEFAULT_CONFIG.fund);
    expect(normalizeConfig(null as unknown as AppConfig).fund).toBe(DEFAULT_CONFIG.fund);
    expect(normalizeConfig([] as unknown as AppConfig).models.length).toBe(DEFAULT_CONFIG.models.length);
  });

  it('чинит горизонт прогноза вне допустимого диапазона', () => {
    const broken = cloneConfig(DEFAULT_CONFIG);
    broken.scenario.years = 0;
    expect(normalizeConfig(broken).scenario.years).toBe(1);

    const huge = cloneConfig(DEFAULT_CONFIG);
    huge.scenario.years = 400;
    expect(normalizeConfig(huge).scenario.years).toBe(15);
  });

  it('заменяет NaN и Infinity значениями по умолчанию', () => {
    const broken = cloneConfig(DEFAULT_CONFIG);
    broken.fund = Number.NaN;
    broken.scenario.fuelPrice = Number.POSITIVE_INFINITY;
    broken.scenario.annualLimit = -5;
    const normalized = normalizeConfig(broken);
    expect(normalized.fund).toBe(DEFAULT_CONFIG.fund);
    expect(normalized.scenario.fuelPrice).toBe(DEFAULT_CONFIG.scenario.fuelPrice);
    expect(normalized.scenario.annualLimit).toBe(1);
  });

  it('достраивает короткие массивы расходов по годам', () => {
    const broken = cloneConfig(DEFAULT_CONFIG);
    broken.scenario.insuranceByYear = [40000];
    const normalized = normalizeConfig(broken);
    expect(normalized.scenario.insuranceByYear).toHaveLength(5);
    expect(normalized.scenario.insuranceByYear.every(Number.isFinite)).toBe(true);
  });

  it('приводит вероятность события ремонта к отрезку от нуля до единицы', () => {
    const broken = cloneConfig(DEFAULT_CONFIG);
    broken.repairEvents[0].probability5y = 7;
    broken.repairEvents[1].probability5y = -1;
    const normalized = normalizeConfig(broken);
    expect(normalized.repairEvents[0].probability5y).toBe(1);
    expect(normalized.repairEvents[1].probability5y).toBe(0);
  });

  it('сохраняет пользовательские модели и не теряет встроенные', () => {
    const withCustom = cloneConfig(DEFAULT_CONFIG);
    withCustom.models.push({
      id: 'custom-1',
      make: 'Свой',
      model: 'Автомобиль',
      generation: '',
      engine: '1.6',
      transmission: 'AT',
      engineVariants: [],
      consumptionLPer100Km: 8,
      taxAnnual: 2000,
    });
    const normalized = normalizeConfig(withCustom);
    expect(normalized.models.some((model) => model.id === 'custom-1')).toBe(true);
    expect(normalized.models.some((model) => model.id === 'corolla-e120')).toBe(true);
    // пустой список вариантов двигателя заменяется заглушкой «код не установлен»
    expect(normalized.models.find((model) => model.id === 'custom-1')?.engineVariants).toHaveLength(1);
  });

  it('не пишет шаблоны осмотра в снимок конфигурации внутри осмотра', () => {
    const snapshot = snapshotConfig(DEFAULT_CONFIG);
    expect(snapshot.templates).toHaveLength(0);
    expect(JSON.stringify(snapshot).length).toBeLessThan(JSON.stringify(DEFAULT_CONFIG).length / 2);
    // расчётные параметры при этом сохранены полностью
    expect(snapshot.repairEvents).toHaveLength(DEFAULT_CONFIG.repairEvents.length);
    expect(normalizeConfig(snapshot).templates.length).toBe(DEFAULT_CONFIG.templates.length);
  });
});

describe('резервная копия', () => {
  it('переживает круг экспорт → импорт без потерь', () => {
    const source = inspection({
      facts: [
        {
          id: 'f1',
          sequence: 1,
          kind: 'WORK',
          category: 'suspension',
          subcategory: 'Передняя',
          description: 'Стойки',
          statedCost: 22000,
          urgency: 'NOW',
          status: 'CONFIRMED',
          comment: 'проверено',
          bodyRisks: [],
          createdAt: '2026-08-27T00:00:00.000Z',
          updatedAt: '2026-08-27T00:00:00.000Z',
        },
      ],
    });
    const restored = parseBackup(createBackup(DEFAULT_CONFIG, [source]));
    expect(restored.inspections).toHaveLength(1);
    expect(restored.inspections[0].id).toBe(source.id);
    expect(restored.inspections[0].facts[0].statedCost).toBe(22000);
    expect(restored.inspections[0].pricing.askingPrice).toBe(390000);
    expect(restored.config.fund).toBe(DEFAULT_CONFIG.fund);
  });

  it('отклоняет файл, который не является бэкапом приложения', () => {
    expect(() => parseBackup('не json')).toThrow(BackupError);
    expect(() => parseBackup('{"foo":1}')).toThrow(BackupError);
    expect(() => parseBackup('[]')).toThrow(BackupError);
  });

  it('отклоняет бэкап более новой схемы, а не читает его наугад', () => {
    const future = JSON.stringify({ schemaVersion: BACKUP_SCHEMA_VERSION + 1, config: DEFAULT_CONFIG });
    expect(() => parseBackup(future)).toThrow(BackupError);
  });

  it('чинит повреждённые поля осмотра вместо падения', () => {
    const dirty = JSON.stringify({
      schemaVersion: 1,
      inspections: [
        {
          id: 'x',
          vehicle: { modelId: 'corolla-e120', year: 'позапрошлый', mileage: -100 },
          pricing: { askingPrice: 'дорого', expectedDiscount: null },
          facts: [{ id: 'f', description: 'скидка', statedCost: -50000, kind: 'WORK' }],
        },
        'это не осмотр',
      ],
    });
    const restored = parseBackup(dirty);
    expect(restored.inspections).toHaveLength(1);
    expect(restored.inspections[0].vehicle.mileage).toBe(0);
    expect(restored.inspections[0].pricing.askingPrice).toBe(0);
    expect(restored.inspections[0].facts[0].statedCost).toBe(0);
  });
});

describe('журнал несохранённых изменений', () => {
  // localStorage в тестовой среде отсутствует — подставляем минимальную реализацию.
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  };

  it('переживает круг запись → чтение', () => {
    const source = inspection({ facts: [] });
    writeJournal([source], DEFAULT_CONFIG);
    const restored = readJournal();
    expect(restored.inspections).toHaveLength(1);
    expect(restored.inspections[0].id).toBe(source.id);
    expect(restored.config?.fund).toBe(DEFAULT_CONFIG.fund);
  });

  it('не хранит шаблоны в журнале — он должен оставаться компактным', () => {
    writeJournal([inspection()], null);
    const raw = store.get('auto-inspection-pending-v1') ?? '';
    expect(raw.length).toBeLessThan(JSON.stringify(DEFAULT_CONFIG).length);
  });

  it('очищается и не падает на повреждённом содержимом', () => {
    clearJournal();
    expect(readJournal().inspections).toHaveLength(0);
    store.set('auto-inspection-pending-v1', 'не json');
    expect(readJournal().inspections).toHaveLength(0);
    expect(readJournal().config).toBeNull();
    store.set('auto-inspection-pending-v1', '[]');
    expect(readJournal().inspections).toHaveLength(0);
    clearJournal();
  });
});
