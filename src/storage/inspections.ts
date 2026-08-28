import type { Inspection } from '../types';
import { request, transact } from './db';
import { normalizeConfig } from './normalize';
import { dedupe, hasInlineSnapshots, rehydrate, snapshotHash } from './snapshots';
import type { StoredInspection, StoredSnapshot } from './snapshots';

export function sortInspections(inspections: Inspection[]): Inspection[] {
  return [...inspections].sort((left, right) => (right.updatedAt ?? '').localeCompare(left.updatedAt ?? ''));
}

export async function loadInspections(): Promise<Inspection[]> {
  const box = await transact(['inspections', 'snapshots'], 'readonly', (transaction) => {
    const holder: { records: StoredInspection[]; snapshots: StoredSnapshot[] } = { records: [], snapshots: [] };
    const records = transaction.objectStore('inspections').getAll() as IDBRequest<StoredInspection[]>;
    records.onsuccess = () => { holder.records = records.result ?? []; };
    const snapshots = transaction.objectStore('snapshots').getAll() as IDBRequest<StoredSnapshot[]>;
    snapshots.onsuccess = () => { holder.snapshots = snapshots.result ?? []; };
    return holder;
  });
  const inspections = sortInspections(rehydrate(box.records, box.snapshots, normalizeConfig));
  if (hasInlineSnapshots(box.records)) await compact(inspections);
  return inspections;
}

/** One-time rewrite of records saved before snapshots were shared, so the old copies stop taking space. */
async function compact(inspections: Inspection[]): Promise<void> {
  try {
    await replaceInspections(inspections);
  } catch {
    // Compaction is an optimisation: the data is already loaded and usable without it.
  }
}

export async function saveInspection(inspection: Inspection): Promise<void> {
  const hash = snapshotHash(inspection.configSnapshot);
  const { configSnapshot, ...rest } = inspection;
  await transact(['inspections', 'snapshots'], 'readwrite', (transaction) => {
    const snapshotStore = transaction.objectStore('snapshots');
    // Editing a fact saves the inspection again; the config it points at almost never changed,
    // so only write the snapshot when this one is genuinely new.
    const existing = snapshotStore.getKey(hash);
    existing.onsuccess = () => {
      if (existing.result === undefined) snapshotStore.put({ hash, config: configSnapshot } satisfies StoredSnapshot);
    };
    transaction.objectStore('inspections').put({ ...rest, configSnapshotHash: hash } satisfies StoredInspection);
  });
}

export async function deleteInspection(id: string): Promise<void> {
  await request('inspections', 'readwrite', (store) => store.delete(id));
  await collectOrphanSnapshots();
}

/** Replaces the whole inspection set in a single transaction, so a failure leaves the old data intact. */
export async function replaceInspections(inspections: Inspection[]): Promise<void> {
  const { records, snapshots } = dedupe(inspections);
  await transact(['inspections', 'snapshots'], 'readwrite', (transaction) => {
    const inspectionStore = transaction.objectStore('inspections');
    const snapshotStore = transaction.objectStore('snapshots');
    inspectionStore.clear();
    snapshotStore.clear();
    for (const snapshot of snapshots) snapshotStore.put(snapshot);
    for (const record of records) inspectionStore.put(record);
  });
}

async function collectOrphanSnapshots(): Promise<void> {
  await transact(['inspections', 'snapshots'], 'readwrite', (transaction) => {
    const inspectionStore = transaction.objectStore('inspections');
    const snapshotStore = transaction.objectStore('snapshots');
    const used = inspectionStore.getAll() as IDBRequest<StoredInspection[]>;
    used.onsuccess = () => {
      const alive = new Set((used.result ?? []).map((record) => record.configSnapshotHash));
      const keys = snapshotStore.getAllKeys();
      keys.onsuccess = () => {
        for (const key of keys.result ?? []) if (!alive.has(String(key))) snapshotStore.delete(key);
      };
    };
    return null;
  });
}
