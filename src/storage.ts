import { DEFAULT_CONFIG, cloneConfig } from './config';
import type { AppConfig, Inspection, InspectionTemplate, RepairEvent } from './types';

const DB_NAME = 'auto-inspection-calculator';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('inspections')) db.createObjectStore('inspections', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('config')) db.createObjectStore('config', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function request<T>(storeName: 'inspections' | 'config', mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const result = action(transaction.objectStore(storeName));
    result.onsuccess = () => resolve(result.result);
    result.onerror = () => reject(result.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function loadConfig(): Promise<AppConfig> {
  const stored = await request<AppConfig | undefined>('config', 'readonly', (store) => store.get('current'));
  return normalizeConfig(stored);
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await request('config', 'readwrite', (store) => store.put(config));
}

export async function loadInspections(): Promise<Inspection[]> {
  const stored = await request<Inspection[]>('inspections', 'readonly', (store) => store.getAll());
  return (stored ?? []).map((inspection) => ({
    ...inspection,
    vehicle: { ...inspection.vehicle, engineVariantId: inspection.vehicle.engineVariantId },
    configSnapshot: normalizeConfig(inspection.configSnapshot),
  })).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function saveInspection(inspection: Inspection): Promise<void> {
  await request('inspections', 'readwrite', (store) => store.put(inspection));
}

export async function deleteInspection(id: string): Promise<void> {
  await request('inspections', 'readwrite', (store) => store.delete(id));
}

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
