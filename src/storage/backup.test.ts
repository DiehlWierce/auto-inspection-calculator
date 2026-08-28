import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, cloneConfig } from '../config';
import { BACKUP_SCHEMA_VERSION, buildBackup, parseBackup } from './backup';
import { normalizeConfig } from './normalize';
import { snapshotHash } from './snapshots';
import type { AppConfig, Inspection } from '../types';

function inspection(id: string, config: AppConfig): Inspection {
  return {
    id,
    createdAt: '2026-08-27T10:00:00.000Z',
    updatedAt: `2026-08-27T10:0${id.length % 10}:00.000Z`,
    status: 'IN_PROGRESS',
    vehicle: { modelId: 'corolla-e120', year: 2006, mileage: 240000 },
    pricing: { askingPrice: 390000, expectedDiscount: 0 },
    facts: [{ id: `${id}-f1`, sequence: 1, kind: 'WORK', category: 'brakes', subcategory: 'Диски и колодки', description: 'Колодки', statedCost: 12000, urgency: 'NOW', status: 'CONFIRMED', comment: '', bodyRisks: [], createdAt: '', updatedAt: '' }],
    eventOverrides: {},
    configSnapshot: config,
  };
}

function legacyBackup(inspections: Inspection[], config: AppConfig): string {
  return JSON.stringify({ schemaVersion: 1, exportedAt: '2026-08-27T10:00:00.000Z', config, inspections }, null, 2);
}

describe('backup file', () => {
  const config = cloneConfig(DEFAULT_CONFIG);
  const many = Array.from({ length: 20 }, (_, index) => inspection(`i-${index}`, config));

  it('writes schema 2 with one shared copy of an identical config snapshot', () => {
    const file = JSON.parse(buildBackup(config, many));
    expect(file.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(file.configSnapshots).toHaveLength(1);
    expect(file.inspections).toHaveLength(20);
    expect(file.inspections.every((record: { configSnapshot?: unknown }) => record.configSnapshot === undefined)).toBe(true);
  });

  it('is far smaller than the schema 1 file it replaces', () => {
    const compact = buildBackup(config, many).length;
    const legacy = legacyBackup(many, config).length;
    expect(compact * 10).toBeLessThan(legacy);
  });

  it('round-trips the inspections and shares one config object between them', () => {
    const restored = parseBackup(buildBackup(config, many));
    expect(restored.inspections).toHaveLength(20);
    expect(restored.inspections[0].id).toBe('i-0');
    expect(restored.inspections[0].facts[0].statedCost).toBe(12000);
    expect(restored.inspections[0].configSnapshot).toBe(restored.inspections[19].configSnapshot);
    expect(snapshotHash(restored.inspections[0].configSnapshot)).toBe(snapshotHash(normalizeConfig(config)));
  });

  it('keeps distinct snapshots apart', () => {
    const other = { ...cloneConfig(DEFAULT_CONFIG), fund: 999000 };
    const mixed = [inspection('a', config), inspection('b', other)];
    const restored = parseBackup(buildBackup(config, mixed));
    expect(JSON.parse(buildBackup(config, mixed)).configSnapshots).toHaveLength(2);
    expect(restored.inspections[0].configSnapshot.fund).toBe(config.fund);
    expect(restored.inspections[1].configSnapshot.fund).toBe(999000);
  });

  it('still reads a schema 1 file and collapses its repeated snapshots', () => {
    const restored = parseBackup(legacyBackup(many, config));
    expect(restored.inspections).toHaveLength(20);
    expect(restored.inspections[0].configSnapshot).toBe(restored.inspections[19].configSnapshot);
    expect(restored.inspections[0].configSnapshot.priceBook.length).toBeGreaterThan(0);
  });

  it('reports what is wrong instead of importing a broken file', () => {
    expect(() => parseBackup('{')).toThrow(/JSON/);
    expect(() => parseBackup('[]')).toThrow(/объект/);
    expect(() => parseBackup('{"inspections":{}}')).toThrow(/списка осмотров/);
    expect(() => parseBackup('{"inspections":[{"id":"a","facts":[],"vehicle":{}},{"id":"b"}]}')).toThrow(/№2/);
    expect(() => parseBackup(JSON.stringify({ inspections: [inspection('same', config), inspection('same', config)] }))).toThrow(/дважды/);
  });
});
