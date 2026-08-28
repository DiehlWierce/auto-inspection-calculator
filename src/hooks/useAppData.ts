import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { DEFAULT_CONFIG, cloneConfig } from '../config';
import { loadConfig, saveConfig } from '../storage/config';
import { deleteInspection, loadInspections, saveInspection } from '../storage/inspections';
import { normalizeConfig } from '../storage/normalize';
import { downloadText } from '../utils';
import type { AppConfig, Inspection } from '../types';

export function useAppData() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([loadConfig(), loadInspections()]).then(([loadedConfig, loadedInspections]) => {
      setConfig(loadedConfig);
      setInspections(loadedInspections);
      setLoading(false);
    }).catch(() => {
      setConfig(cloneConfig(DEFAULT_CONFIG));
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
    if (!config) return;
    downloadText('автоосмотр-backup.json', JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), config, inspections }, null, 2));
  };

  const importBackup = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as { config?: AppConfig; inspections?: Inspection[] };
        if (parsed.config) {
          const normalizedConfig = normalizeConfig(parsed.config);
          setConfig(normalizedConfig);
          void saveConfig(normalizedConfig);
        }
        if (parsed.inspections) {
          const normalizedInspections = parsed.inspections.map((inspection) => ({
            ...inspection,
            configSnapshot: normalizeConfig(inspection.configSnapshot),
          }));
          setInspections(normalizedInspections);
          normalizedInspections.forEach((inspection) => void saveInspection(inspection));
        }
      } catch {
        window.alert('Не удалось прочитать резервную копию JSON.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  return { config, inspections, loading, updateInspection, createInspection, removeInspection, updateConfig, exportBackup, importBackup };
}
