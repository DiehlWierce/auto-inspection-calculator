import type { Inspection } from '../types';
import { request } from './db';
import { normalizeConfig } from './normalize';

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
