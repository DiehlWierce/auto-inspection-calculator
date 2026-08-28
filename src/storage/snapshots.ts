import type { AppConfig, Inspection } from '../types';

export interface StoredSnapshot {
  hash: string;
  config: AppConfig;
}

export type StoredInspection = Omit<Inspection, 'configSnapshot'> & {
  configSnapshotHash?: string;
  configSnapshot?: AppConfig;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

// Every inspection carries a full copy of the config it was measured against, and in practice
// those copies are identical across a whole session. Content addressing lets one stored object
// serve all of them, in the database and in the backup file alike.
export function snapshotHash(config: AppConfig): string {
  const text = stableStringify(config);
  let first = 2166136261;
  let second = 3735928559;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619) >>> 0;
    second = Math.imul(second ^ code, 2246822519) >>> 0;
    second = ((second << 13) | (second >>> 19)) >>> 0;
  }
  return `${first.toString(36)}-${second.toString(36)}-${text.length.toString(36)}`;
}

/** Collects the distinct snapshots of a set of inspections and rewrites each one to reference its own. */
export function dedupe(inspections: Inspection[]): { records: StoredInspection[]; snapshots: StoredSnapshot[] } {
  const snapshots = new Map<string, StoredSnapshot>();
  const records = inspections.map((inspection) => {
    const hash = snapshotHash(inspection.configSnapshot);
    if (!snapshots.has(hash)) snapshots.set(hash, { hash, config: inspection.configSnapshot });
    const { configSnapshot: _snapshot, ...rest } = inspection;
    return { ...rest, configSnapshotHash: hash };
  });
  return { records, snapshots: [...snapshots.values()] };
}

/** Puts the shared snapshots back on the stored records, sharing one object between all of them. */
export function rehydrate(records: StoredInspection[], snapshots: StoredSnapshot[], normalize: (config: AppConfig | undefined) => AppConfig): Inspection[] {
  const byHash = new Map<string, AppConfig>();
  for (const snapshot of snapshots) byHash.set(snapshot.hash, normalize(snapshot.config));
  return records.map(({ configSnapshotHash, configSnapshot, ...rest }) => {
    const shared = configSnapshotHash ? byHash.get(configSnapshotHash) : undefined;
    if (shared) return { ...rest, configSnapshot: shared };
    // A record written before deduplication, or a backup in the old format: normalizing first
    // means an inline copy still lands on the same shared object as its identical siblings.
    const normalized = normalize(configSnapshot);
    const hash = snapshotHash(normalized);
    const existing = byHash.get(hash);
    if (existing) return { ...rest, configSnapshot: existing };
    byHash.set(hash, normalized);
    return { ...rest, configSnapshot: normalized };
  });
}

export function hasInlineSnapshots(records: StoredInspection[]): boolean {
  return records.some((record) => !record.configSnapshotHash);
}
