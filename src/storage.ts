import { DEFAULT_CONFIG, cloneConfig } from './config';
import type { AppConfig, Inspection, InspectionTemplate, RepairEvent } from './types';

const DB_NAME = 'auto-inspection-calculator';
const DB_VERSION = 1;

/** Ошибка слоя хранения с текстом, который можно показать пользователю. */
export class StorageError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new StorageError('Браузер не даёт доступ к локальному хранилищу (IndexedDB недоступен).'));
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(new StorageError('Не удалось открыть локальное хранилище.', error));
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('inspections')) db.createObjectStore('inspections', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('config')) db.createObjectStore('config', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onblocked = () =>
      reject(new StorageError('Хранилище занято другой вкладкой приложения — закройте лишние вкладки.'));
    request.onerror = () =>
      reject(
        new StorageError(
          'Не удалось открыть локальное хранилище. В приватном окне браузера сохранение может быть запрещено.',
          request.error,
        ),
      );
  });
}

async function request<T>(
  storeName: 'inspections' | 'config',
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const fail = (error: unknown) => {
      db.close();
      reject(
        error instanceof StorageError
          ? error
          : new StorageError('Не удалось записать данные в локальное хранилище. Возможно, кончилось место.', error),
      );
    };
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction(storeName, mode);
    } catch (error) {
      fail(error);
      return;
    }
    let value: T;
    const result = action(transaction.objectStore(storeName));
    result.onsuccess = () => {
      value = result.result;
    };
    result.onerror = () => fail(result.error);
    transaction.onabort = () => fail(transaction.error);
    transaction.onerror = () => fail(transaction.error);
    // Успех подтверждается только завершением транзакции: запись, попавшая
    // в onsuccess, всё ещё может быть отменена при нехватке места на диске.
    transaction.oncomplete = () => {
      db.close();
      resolve(value);
    };
  });
}

export async function loadConfig(): Promise<AppConfig> {
  const stored = await request<AppConfig | undefined>(
    'config',
    'readonly',
    (store) => store.get('current') as IDBRequest<AppConfig | undefined>,
  );
  return normalizeConfig(stored);
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await request('config', 'readwrite', (store) => store.put(config));
}

/**
 * Снимок конфигурации, который хранится внутри осмотра.
 * Шаблоны форм осмотра в расчёте не участвуют и одинаковы для всех осмотров,
 * а весят около 30 КБ — в снимке они не нужны. Собственная форма осмотра
 * лежит в `inspection.inspectionLayout`, поэтому ничего не теряется.
 */
export function snapshotConfig(config: AppConfig): AppConfig {
  return { ...cloneConfig(config), templates: [] };
}

export async function loadInspections(): Promise<Inspection[]> {
  const stored = await request<Inspection[]>(
    'inspections',
    'readonly',
    (store) => store.getAll() as IDBRequest<Inspection[]>,
  );
  return (stored ?? [])
    .map((inspection) => ({
      ...inspection,
      vehicle: { ...inspection.vehicle, engineVariantId: inspection.vehicle.engineVariantId },
      configSnapshot: normalizeConfig(inspection.configSnapshot),
    }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function saveInspection(inspection: Inspection): Promise<void> {
  const record: Inspection = { ...inspection, configSnapshot: snapshotConfig(inspection.configSnapshot) };
  await request('inspections', 'readwrite', (store) => store.put(record));
}

export async function deleteInspection(id: string): Promise<void> {
  await request('inspections', 'readwrite', (store) => store.delete(id));
}

/**
 * Полностью заменяет содержимое хранилища осмотров — используется при импорте
 * резервной копии, чтобы состояние в памяти и в базе не разъезжались.
 */
export async function replaceInspections(inspections: Inspection[]): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const fail = (error: unknown) => {
      db.close();
      reject(new StorageError('Не удалось записать импортированные осмотры.', error));
    };
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction('inspections', 'readwrite');
    } catch (error) {
      fail(error);
      return;
    }
    const store = transaction.objectStore('inspections');
    store.clear();
    for (const inspection of inspections) {
      store.put({ ...inspection, configSnapshot: snapshotConfig(inspection.configSnapshot) });
    }
    transaction.onabort = () => fail(transaction.error);
    transaction.onerror = () => fail(transaction.error);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
  });
}

/** Число из внешнего источника: не число, NaN и Infinity заменяются значением по умолчанию. */
function safeNumber(value: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** Массив «по годам»: нечисловые элементы заменяются нулём, длина дотягивается до нужной. */
function safeYearArray(value: unknown, fallback: number[], years: number): number[] {
  const source = Array.isArray(value) ? value : fallback;
  return Array.from({ length: Math.max(years, fallback.length) }, (_, index) =>
    safeNumber(source[index], fallback[index] ?? 0, 0),
  );
}

export function normalizeConfig(stored: AppConfig | undefined): AppConfig {
  const fallback = cloneConfig(DEFAULT_CONFIG);
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return fallback;
  const storedScenario = stored.scenario ?? fallback.scenario;
  const years = Math.round(safeNumber(storedScenario.years, fallback.scenario.years, 1, 15));
  return {
    ...fallback,
    ...stored,
    id: 'current',
    version: typeof stored.version === 'string' ? stored.version : fallback.version,
    fund: safeNumber(stored.fund, fallback.fund, 0),
    maxAskingPrice: safeNumber(stored.maxAskingPrice, fallback.maxAskingPrice, 0),
    targetPurchasePrice: safeNumber(stored.targetPurchasePrice, fallback.targetPurchasePrice, 0),
    greenReserveRatio: safeNumber(stored.greenReserveRatio, fallback.greenReserveRatio, 0, 1),
    yellowReserveRatio: safeNumber(stored.yellowReserveRatio, fallback.yellowReserveRatio, 0, 1),
    majorRepairThreshold: safeNumber(stored.majorRepairThreshold, fallback.majorRepairThreshold, 0),
    criticalRepairThreshold: safeNumber(stored.criticalRepairThreshold, fallback.criticalRepairThreshold, 0),
    majorRepairsPerYearLimit: safeNumber(stored.majorRepairsPerYearLimit, fallback.majorRepairsPerYearLimit, 1),
    minMonthsBetweenMajorRepairs: safeNumber(
      stored.minMonthsBetweenMajorRepairs,
      fallback.minMonthsBetweenMajorRepairs,
      1,
    ),
    simulationScenarios: Math.round(safeNumber(stored.simulationScenarios, fallback.simulationScenarios, 100, 100000)),
    simulationSeed: Math.round(safeNumber(stored.simulationSeed, fallback.simulationSeed)),
    ratingWeights: (Object.keys(fallback.ratingWeights) as Array<keyof AppConfig['ratingWeights']>).reduce(
      (result, key) => {
        result[key] = safeNumber(stored.ratingWeights?.[key], fallback.ratingWeights[key], 0, 100);
        return result;
      },
      {} as AppConfig['ratingWeights'],
    ),
    scenario: {
      ...fallback.scenario,
      ...storedScenario,
      years,
      annualKm: safeNumber(storedScenario.annualKm, fallback.scenario.annualKm, 0),
      fuelPrice: safeNumber(storedScenario.fuelPrice, fallback.scenario.fuelPrice, 0),
      annualLimit: safeNumber(storedScenario.annualLimit, fallback.scenario.annualLimit, 1),
      insuranceByYear: safeYearArray(storedScenario.insuranceByYear, fallback.scenario.insuranceByYear, years),
      serviceByYear: safeYearArray(storedScenario.serviceByYear, fallback.scenario.serviceByYear, years),
      fluidsByYear: safeYearArray(storedScenario.fluidsByYear, fallback.scenario.fluidsByYear, years),
      consumablesByYear: safeYearArray(storedScenario.consumablesByYear, fallback.scenario.consumablesByYear, years),
      tiresByYear: safeYearArray(storedScenario.tiresByYear, fallback.scenario.tiresByYear, years),
      washingByYear: safeYearArray(storedScenario.washingByYear, fallback.scenario.washingByYear, years),
      finesByYear: safeYearArray(storedScenario.finesByYear, fallback.scenario.finesByYear, years),
    },
    models: fallback.models
      .map((baseModel) => {
        const storedModel = stored.models?.find((model) => model.id === baseModel.id);
        return {
          ...baseModel,
          ...storedModel,
          engineVariants: storedModel?.engineVariants ?? baseModel.engineVariants,
        };
      })
      .concat(
        (stored.models ?? [])
          .filter((model) => !fallback.models.some((baseModel) => baseModel.id === model.id))
          .map((model) => ({
            ...model,
            engineVariants: model.engineVariants?.length
              ? model.engineVariants
              : [
                  {
                    id: 'unknown',
                    label: 'Код двигателя не установлен',
                    code: '',
                    timingDrive: 'UNKNOWN',
                    note: 'Уточните код двигателя и тип привода ГРМ.',
                  },
                ],
          })),
      ),
    coefficients:
      Array.isArray(stored.coefficients) && stored.coefficients.length > 0
        ? stored.coefficients.map((rule) => ({ ...rule, coefficient: safeNumber(rule?.coefficient, 1.2, 0, 10) }))
        : fallback.coefficients,
    repairEvents: normalizeRepairEvents(stored.repairEvents, fallback.repairEvents).map(normalizeRepairEvent),
    templates: normalizeTemplates(stored.templates, fallback.templates),
  };
}

/** Событие ремонта из внешнего источника: диапазоны приводятся к допустимым. */
function normalizeRepairEvent(event: RepairEvent): RepairEvent {
  const monthStart = Math.round(safeNumber(event.monthStart, 1, 1, 180));
  const monthEnd = Math.round(safeNumber(event.monthEnd, monthStart, monthStart, 180));
  return {
    ...event,
    modelIds: Array.isArray(event.modelIds) ? event.modelIds : [],
    probability5y: safeNumber(event.probability5y, 0, 0, 1),
    repairCost: safeNumber(event.repairCost, 0, 0),
    coefficient: safeNumber(event.coefficient, 1, 0, 10),
    maxCost: safeNumber(event.maxCost, 0, 0),
    monthStart,
    monthEnd,
    scheduledMonth:
      event.scheduledMonth === undefined ? undefined : Math.round(safeNumber(event.scheduledMonth, 1, 1, 180)),
  };
}

function normalizeTemplates(
  storedTemplates: InspectionTemplate[] | undefined,
  fallbackTemplates: InspectionTemplate[],
): InspectionTemplate[] {
  if (!Array.isArray(storedTemplates)) return fallbackTemplates;
  const builtIn = fallbackTemplates.map((fallback) => {
    const stored = storedTemplates.find((template) => template.id === fallback.id);
    return stored ? { ...fallback, ...stored, layout: stored.layout ?? fallback.layout } : fallback;
  });
  const custom = storedTemplates.filter(
    (template) => !fallbackTemplates.some((fallback) => fallback.id === template.id),
  );
  return [...builtIn, ...custom];
}

function normalizeRepairEvents(storedEvents: RepairEvent[] | undefined, fallbackEvents: RepairEvent[]): RepairEvent[] {
  if (!Array.isArray(storedEvents)) return fallbackEvents;
  const legacyTimingEvent = storedEvents.find(
    (event) => event.id === 'timing-belt' && event.modelIds.includes('corolla-e120'),
  );
  const withoutLegacy = storedEvents.filter(
    (event) => event.id !== 'timing-belt' || !event.modelIds.includes('corolla-e120'),
  );
  if (!legacyTimingEvent) return withoutLegacy;
  const chainFallback = fallbackEvents.find((event) => event.id === 'corolla-timing-chain');
  const beltFallback = fallbackEvents.find((event) => event.id === 'timing-belt');
  return [
    ...withoutLegacy,
    ...(chainFallback && !withoutLegacy.some((event) => event.id === chainFallback.id) ? [chainFallback] : []),
    ...(beltFallback && !withoutLegacy.some((event) => event.id === beltFallback.id) ? [beltFallback] : []),
  ];
}

/**
 * Журнал несохранённых изменений в localStorage.
 *
 * Зачем он нужен. Запись в IndexedDB асинхронная: если пользователь набрал
 * текст и сразу перезагрузил страницу или закрыл вкладку, браузер успевает
 * убить страницу до того, как транзакция закоммитится, и правка теряется.
 * Запись в localStorage синхронная — она гарантированно завершается до
 * выгрузки страницы. Поэтому каждое изменение сначала попадает сюда, а при
 * следующем запуске приложения журнал вычитывается и переносится в IndexedDB.
 *
 * Журнал — не хранилище данных, а страховка на те несколько секунд, что
 * проходят между правкой и подтверждённой записью в базу.
 */
const JOURNAL_KEY = 'auto-inspection-pending-v1';

export interface PendingJournal {
  inspections: Inspection[];
  config: AppConfig | null;
}

const EMPTY_JOURNAL: PendingJournal = { inspections: [], config: null };

function journalStorage(): Storage | null {
  try {
    // В приватном окне обращение к localStorage может бросить исключение.
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Синхронно сохраняет очередь несохранённых изменений. */
export function writeJournal(inspections: Inspection[], config: AppConfig | null): void {
  const store = journalStorage();
  if (!store) return;
  try {
    if (inspections.length === 0 && !config) {
      store.removeItem(JOURNAL_KEY);
      return;
    }
    const payload: PendingJournal = {
      inspections: inspections.map((inspection) => ({
        ...inspection,
        configSnapshot: snapshotConfig(inspection.configSnapshot),
      })),
      config,
    };
    store.setItem(JOURNAL_KEY, JSON.stringify(payload));
  } catch {
    // Переполнение квоты или запрет хранилища не должны ломать работу:
    // журнал — подстраховка, а не основной путь сохранения.
  }
}

/** Читает журнал. Возвращает пустой результат, если журнала нет или он повреждён. */
export function readJournal(): PendingJournal {
  const store = journalStorage();
  if (!store) return EMPTY_JOURNAL;
  try {
    const raw = store.getItem(JOURNAL_KEY);
    if (!raw) return EMPTY_JOURNAL;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_JOURNAL;
    const value = parsed as Partial<PendingJournal>;
    return {
      inspections: Array.isArray(value.inspections)
        ? value.inspections.map((inspection) => ({
            ...inspection,
            configSnapshot: normalizeConfig(inspection.configSnapshot),
          }))
        : [],
      config: value.config ? normalizeConfig(value.config) : null,
    };
  } catch {
    return EMPTY_JOURNAL;
  }
}

export function clearJournal(): void {
  writeJournal([], null);
}
