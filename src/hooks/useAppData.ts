import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { DEFAULT_CONFIG, cloneConfig } from '../config';
import { buildBackup, parseBackup } from '../storage/backup';
import { loadConfig, saveConfig } from '../storage/config';
import { deleteInspection, loadInspections, replaceInspections, saveInspection, sortInspections } from '../storage/inspections';
import { downloadText } from '../utils';
import type { AppConfig, Inspection } from '../types';

export type BackupTask = 'import' | 'export' | null;

function reason(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

export function useAppData() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [backupTask, setBackupTask] = useState<BackupTask>(null);

  useEffect(() => {
    void Promise.all([loadConfig(), loadInspections()]).then(([loadedConfig, loadedInspections]) => {
      setConfig(loadedConfig);
      setInspections(loadedInspections);
      setLoading(false);
    }).catch((error: unknown) => {
      setConfig(cloneConfig(DEFAULT_CONFIG));
      setLoadError(reason(error));
      setLoading(false);
    });
  }, []);

  const updateInspection = (next: Inspection) => {
    const saved = { ...next, updatedAt: new Date().toISOString() };
    setInspections((items) => items.map((item) => item.id === saved.id ? saved : item));
    void saveInspection(saved);
  };

  const createInspection = (next: Inspection) => {
    setInspections((items) => [next, ...items]);
    void saveInspection(next);
  };

  const removeInspection = (id: string) => {
    setInspections((items) => items.filter((item) => item.id !== id));
    void deleteInspection(id);
  };

  const updateConfig = (updater: (current: AppConfig) => AppConfig) => {
    setConfig((current) => {
      if (!current) return current;
      const next = updater(cloneConfig(current));
      next.version = `manual-${Date.now()}`;
      void saveConfig(next);
      return next;
    });
  };

  const exportBackup = () => {
    if (!config || backupTask) return;
    setBackupTask('export');
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      downloadText(`автоосмотр-backup-${stamp}.json`, buildBackup(config, inspections));
    } catch (error) {
      window.alert(`Не удалось собрать резервную копию.\n${reason(error)}`);
    } finally {
      setBackupTask(null);
    }
  };

  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file || backupTask) return;
    setBackupTask('import');
    try {
      // Parse and validate the whole file before touching the database: a broken backup
      // must not be able to leave the app with half of its data replaced.
      const backup = parseBackup(await file.text());
      const replaced = inspections.length;
      if (replaced > 0 && !window.confirm(`Импорт заменит текущие данные: ${replaced} осмотр(ов) будут удалены, вместо них ${backup.inspections.length}. Продолжить?`)) return;
      await replaceInspections(backup.inspections);
      await saveConfig(backup.config);
      setConfig(backup.config);
      setInspections(sortInspections(backup.inspections));
      setLoadError(null);
    } catch (error) {
      window.alert(`Не удалось импортировать резервную копию, данные приложения не изменились.\n${reason(error)}`);
    } finally {
      setBackupTask(null);
    }
  };

  return { config, inspections, loading, loadError, backupTask, updateInspection, createInspection, removeInspection, updateConfig, exportBackup, importBackup };
}
