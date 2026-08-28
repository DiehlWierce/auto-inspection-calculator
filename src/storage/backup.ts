import { normalizeConfig } from './normalize';
import { dedupe, rehydrate } from './snapshots';
import type { StoredInspection, StoredSnapshot } from './snapshots';
import type { AppConfig, Inspection } from '../types';

export const BACKUP_SCHEMA_VERSION = 2;

interface BackupFile {
  schemaVersion: number;
  exportedAt: string;
  config: AppConfig;
  configSnapshots: StoredSnapshot[];
  inspections: StoredInspection[];
}

export interface Backup {
  config: AppConfig;
  inspections: Inspection[];
}

/**
 * Schema 2 keeps every distinct config snapshot once and has the inspections point at it.
 * On a real set of 73 inspections the identical snapshots were 81% of the file.
 */
export function buildBackup(config: AppConfig, inspections: Inspection[]): string {
  const { records, snapshots } = dedupe(inspections);
  const file: BackupFile = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    config,
    configSnapshots: snapshots,
    inspections: records,
  };
  return JSON.stringify(file);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isInspectionShaped(value: unknown): boolean {
  const record = asRecord(value);
  return record !== null
    && typeof record.id === 'string'
    && Array.isArray(record.facts)
    && asRecord(record.vehicle) !== null;
}

/** Reads both schema 1 (a full config copy inside every inspection) and schema 2. */
export function parseBackup(text: string): Backup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Файл не является корректным JSON.');
  }
  const file = asRecord(parsed);
  if (!file) throw new Error('Ожидался объект резервной копии.');
  if (!Array.isArray(file.inspections)) throw new Error('В файле нет списка осмотров.');
  const broken = file.inspections.findIndex((inspection) => !isInspectionShaped(inspection));
  if (broken >= 0) throw new Error(`Осмотр №${broken + 1} в файле повреждён: нет id, данных авто или списка фактов.`);

  const snapshots = Array.isArray(file.configSnapshots) ? file.configSnapshots as StoredSnapshot[] : [];
  const inspections = rehydrate(file.inspections as StoredInspection[], snapshots, normalizeConfig);
  const seen = new Set<string>();
  for (const inspection of inspections) {
    if (seen.has(inspection.id)) throw new Error(`Идентификатор осмотра «${inspection.id}» встречается в файле дважды.`);
    seen.add(inspection.id);
  }
  return { config: normalizeConfig((asRecord(file.config) ?? undefined) as AppConfig | undefined), inspections };
}
