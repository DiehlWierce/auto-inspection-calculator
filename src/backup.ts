import { normalizeConfig } from './storage';
import type { AppConfig, Fact, Inspection } from './types';

export const BACKUP_SCHEMA_VERSION = 1;

export interface Backup {
  schemaVersion: number;
  exportedAt: string;
  config: AppConfig;
  inspections: Inspection[];
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

export function createBackup(config: AppConfig, inspections: Inspection[]): string {
  const backup: Backup = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    config,
    inspections,
  };
  return JSON.stringify(backup, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeFact(raw: unknown, index: number): Fact | null {
  if (!isRecord(raw)) return null;
  const now = new Date().toISOString();
  const statedCost = typeof raw.statedCost === 'number' && Number.isFinite(raw.statedCost) ? raw.statedCost : undefined;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `imported-${index}`,
    sequence: typeof raw.sequence === 'number' ? raw.sequence : index + 1,
    kind: raw.kind === 'CONDITION' ? 'CONDITION' : 'WORK',
    category: (typeof raw.category === 'string' ? raw.category : 'other') as Fact['category'],
    subcategory: typeof raw.subcategory === 'string' ? raw.subcategory : '',
    description: typeof raw.description === 'string' ? raw.description : '',
    statedCost: statedCost === undefined ? undefined : Math.max(0, statedCost),
    urgency: (['NOW', 'SOON', 'PLANNED', 'OPTIONAL'] as const).includes(raw.urgency as Fact['urgency'])
      ? (raw.urgency as Fact['urgency'])
      : 'NOW',
    status: raw.status === 'QUESTION' ? 'QUESTION' : 'CONFIRMED',
    comment: typeof raw.comment === 'string' ? raw.comment : '',
    bodyRisks: Array.isArray(raw.bodyRisks)
      ? (raw.bodyRisks.filter((item) => typeof item === 'string') as Fact['bodyRisks'])
      : [],
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
    group: typeof raw.group === 'string' ? raw.group : undefined,
    stageId: typeof raw.stageId === 'string' ? raw.stageId : undefined,
    blockId: typeof raw.blockId === 'string' ? raw.blockId : undefined,
    elementId: typeof raw.elementId === 'string' ? raw.elementId : undefined,
  };
}

/**
 * Приводит осмотр из внешнего файла к рабочему виду.
 * Файл бэкапа может быть от другой версии приложения или просто испорчен,
 * поэтому каждое поле проверяется, а не принимается на веру.
 */
export function normalizeInspection(raw: unknown, index: number): Inspection | null {
  if (!isRecord(raw)) return null;
  const vehicle = isRecord(raw.vehicle) ? raw.vehicle : {};
  const pricing = isRecord(raw.pricing) ? raw.pricing : {};
  const now = new Date().toISOString();
  const numberOr = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `imported-${index}-${Date.now().toString(36)}`,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
    status: raw.status === 'FINISHED_CANDIDATE' || raw.status === 'FINISHED_REJECTED' ? raw.status : 'IN_PROGRESS',
    vehicle: {
      ...vehicle,
      modelId: typeof vehicle.modelId === 'string' ? vehicle.modelId : 'corolla-e120',
      year: numberOr(vehicle.year, 0),
      mileage: Math.max(0, numberOr(vehicle.mileage, 0)),
    },
    pricing: {
      askingPrice: Math.max(0, numberOr(pricing.askingPrice, 0)),
      expectedDiscount: Math.max(0, numberOr(pricing.expectedDiscount, 0)),
      actualPurchasePrice:
        typeof pricing.actualPurchasePrice === 'number' && Number.isFinite(pricing.actualPurchasePrice)
          ? Math.max(0, pricing.actualPurchasePrice)
          : undefined,
    },
    facts: Array.isArray(raw.facts)
      ? raw.facts.map((fact, factIndex) => normalizeFact(fact, factIndex)).filter((fact): fact is Fact => fact !== null)
      : [],
    eventOverrides: isRecord(raw.eventOverrides) ? (raw.eventOverrides as Inspection['eventOverrides']) : {},
    customEvents: Array.isArray(raw.customEvents) ? (raw.customEvents as Inspection['customEvents']) : [],
    templateId: typeof raw.templateId === 'string' ? raw.templateId : undefined,
    inspectionLayout: Array.isArray(raw.inspectionLayout)
      ? (raw.inspectionLayout as Inspection['inspectionLayout'])
      : undefined,
    configSnapshot: normalizeConfig(raw.configSnapshot as AppConfig | undefined),
  };
}

/**
 * Разбирает файл резервной копии. Бросает `BackupError` с понятным текстом,
 * если файл не является бэкапом этого приложения.
 */
export function parseBackup(text: string): { config: AppConfig; inspections: Inspection[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return raise('Файл не является корректным JSON.');
  }
  if (!isRecord(parsed)) return raise('Файл не похож на резервную копию приложения.');
  const schemaVersion = parsed.schemaVersion;
  if (typeof schemaVersion !== 'number') return raise('В файле нет поля schemaVersion — это не бэкап приложения.');
  if (schemaVersion > BACKUP_SCHEMA_VERSION) {
    return raise(
      `Файл сохранён более новой версией приложения (схема ${schemaVersion}, поддерживается ${BACKUP_SCHEMA_VERSION}).`,
    );
  }
  if (parsed.config === undefined && parsed.inspections === undefined) {
    return raise('В файле нет ни конфигурации, ни осмотров.');
  }
  if (parsed.inspections !== undefined && !Array.isArray(parsed.inspections)) {
    return raise('Поле inspections в файле повреждено.');
  }
  const inspections = Array.isArray(parsed.inspections)
    ? parsed.inspections
        .map((item, index) => normalizeInspection(item, index))
        .filter((item): item is Inspection => item !== null)
    : [];
  return { config: normalizeConfig(parsed.config as AppConfig | undefined), inspections };
}

function raise(message: string): never {
  throw new BackupError(message);
}
