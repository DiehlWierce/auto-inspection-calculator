import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cloneConfig, DEFAULT_CONFIG } from '../config';
import {
  clearJournal,
  deleteInspection,
  loadConfig,
  loadInspections,
  readJournal,
  replaceInspections,
  saveConfig,
  saveInspection,
  writeJournal,
} from '../storage';
import { notify } from '../ui/notify';
import type { AppConfig, Inspection } from '../types';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Пауза перед записью в IndexedDB: ввод в поле не должен писать по букве. */
const SAVE_DEBOUNCE_MS = 500;

interface AppData {
  config: AppConfig | null;
  inspections: Inspection[];
  loading: boolean;
  loadError: string | null;
  saveState: SaveState;
  updateInspection: (inspection: Inspection) => void;
  createInspection: (inspection: Inspection) => void;
  removeInspection: (id: string) => void;
  updateConfig: (updater: (current: AppConfig) => AppConfig) => void;
  replaceAll: (config: AppConfig, inspections: Inspection[]) => void;
  flushPendingSaves: () => Promise<void>;
}

/**
 * Владеет всеми данными приложения и их записью в локальное хранилище.
 *
 * Отдельный хук, потому что запись — не «поставил и забыл»: изменения
 * складываются в отложенную очередь, ошибки видны пользователю, а перед
 * закрытием вкладки очередь принудительно сбрасывается на диск.
 */
export function useAppData(): AppData {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const pendingInspections = useRef(new Map<string, Inspection>());
  const pendingConfig = useRef<AppConfig | null>(null);
  const timer = useRef<number | null>(null);
  const inFlight = useRef(0);

  /**
   * Синхронно переписывает журнал по текущему содержимому очереди.
   * Вызывается при каждом изменении очереди: журнал должен быть актуален
   * в любой момент, потому что страницу могут закрыть между двумя кадрами.
   */
  const syncJournal = useCallback(() => {
    writeJournal([...pendingInspections.current.values()], pendingConfig.current);
  }, []);

  const track = useCallback(async (action: () => Promise<void>) => {
    inFlight.current += 1;
    setSaveState('saving');
    try {
      await action();
      inFlight.current -= 1;
      if (inFlight.current === 0) setSaveState('saved');
    } catch (error) {
      inFlight.current -= 1;
      // Статус ошибки не сбрасывается сам: пользователь должен его увидеть.
      setSaveState('error');
      notify(error instanceof Error ? error.message : 'Не удалось сохранить данные локально.', 'error');
    }
  }, []);

  // «Сохранено» — короткое подтверждение, а не постоянная надпись в шапке.
  useEffect(() => {
    if (saveState !== 'saved') return;
    const id = window.setTimeout(() => setSaveState('idle'), 2500);
    return () => window.clearTimeout(id);
  }, [saveState]);

  const flushPendingSaves = useCallback(async () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const inspectionsToSave = [...pendingInspections.current.values()];
    const configToSave = pendingConfig.current;
    if (inspectionsToSave.length === 0 && !configToSave) return;
    pendingInspections.current.clear();
    pendingConfig.current = null;
    let failed = false;
    await track(async () => {
      try {
        for (const inspection of inspectionsToSave) await saveInspection(inspection);
        if (configToSave) await saveConfig(configToSave);
      } catch (error) {
        // Запись не удалась — возвращаем данные в очередь, чтобы они не пропали
        // ни из памяти, ни из журнала, и пробрасываем ошибку дальше для статуса.
        failed = true;
        for (const inspection of inspectionsToSave) {
          if (!pendingInspections.current.has(inspection.id)) {
            pendingInspections.current.set(inspection.id, inspection);
          }
        }
        if (configToSave && !pendingConfig.current) pendingConfig.current = configToSave;
        throw error;
      }
    });
    if (!failed) syncJournal();
  }, [track, syncJournal]);

  const scheduleFlush = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void flushPendingSaves();
    }, SAVE_DEBOUNCE_MS);
  }, [flushPendingSaves]);

  useEffect(() => {
    void Promise.all([loadConfig(), loadInspections()])
      .then(([loadedConfig, loadedInspections]) => {
        // Журнал содержит правки, которые не успели дойти до IndexedDB
        // (например, страницу перезагрузили сразу после ввода). Они новее
        // того, что лежит в базе, поэтому применяются поверх и тут же
        // ставятся в очередь на нормальное сохранение.
        const journal = readJournal();
        const byId = new Map(loadedInspections.map((item) => [item.id, item]));
        for (const pending of journal.inspections) byId.set(pending.id, pending);
        const restored = [...byId.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
        setConfig(journal.config ?? loadedConfig);
        setInspections(restored);
        setLoading(false);
        if (journal.inspections.length > 0 || journal.config) {
          for (const pending of journal.inspections) pendingInspections.current.set(pending.id, pending);
          if (journal.config) pendingConfig.current = journal.config;
          void flushPendingSaves();
        }
      })
      .catch((error: unknown) => {
        setConfig(cloneConfig(DEFAULT_CONFIG));
        setLoadError(
          error instanceof Error
            ? error.message
            : 'Не удалось прочитать локальное хранилище — работа продолжится без сохранения.',
        );
        setLoading(false);
      });
    // Восстановление выполняется один раз при монтировании.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Приложение — PWA: вкладку закрывают внезапно, поэтому очередь записи
  // сбрасывается при уходе страницы в фон, а не только по таймеру.
  useEffect(() => {
    const flushNow = () => void flushPendingSaves();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushNow();
    };
    window.addEventListener('pagehide', flushNow);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flushNow);
      document.removeEventListener('visibilitychange', onVisibility);
      flushNow();
    };
  }, [flushPendingSaves]);

  const queueInspection = useCallback(
    (inspection: Inspection) => {
      pendingInspections.current.set(inspection.id, inspection);
      // Журнал пишется сразу, до всякого таймера: только он переживает
      // мгновенную перезагрузку страницы.
      syncJournal();
      scheduleFlush();
    },
    [scheduleFlush, syncJournal],
  );

  const updateInspection = useCallback(
    (next: Inspection) => {
      const saved = { ...next, updatedAt: new Date().toISOString() };
      setInspections((items) => items.map((item) => (item.id === saved.id ? saved : item)));
      queueInspection(saved);
    },
    [queueInspection],
  );

  const createInspection = useCallback(
    (next: Inspection) => {
      setInspections((items) => [next, ...items]);
      queueInspection(next);
    },
    [queueInspection],
  );

  const removeInspection = useCallback(
    (id: string) => {
      pendingInspections.current.delete(id);
      syncJournal();
      setInspections((items) => items.filter((item) => item.id !== id));
      void track(() => deleteInspection(id));
    },
    [track, syncJournal],
  );

  const updateConfig = useCallback(
    (updater: (current: AppConfig) => AppConfig) => {
      setConfig((current) => {
        if (!current) return current;
        const next = updater(cloneConfig(current));
        next.version = `manual-${Date.now()}`;
        // Побочный эффект вынесен из редьюсера состояния наружу:
        // в StrictMode апдейтер вызывается дважды, запись — нет.
        pendingConfig.current = next;
        syncJournal();
        return next;
      });
      scheduleFlush();
    },
    [scheduleFlush, syncJournal],
  );

  const replaceAll = useCallback(
    (nextConfig: AppConfig, nextInspections: Inspection[]) => {
      pendingInspections.current.clear();
      pendingConfig.current = null;
      clearJournal();
      setConfig(nextConfig);
      setInspections([...nextInspections].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
      void track(async () => {
        await saveConfig(nextConfig);
        await replaceInspections(nextInspections);
      });
    },
    [track],
  );

  return useMemo(
    () => ({
      config,
      inspections,
      loading,
      loadError,
      saveState,
      updateInspection,
      createInspection,
      removeInspection,
      updateConfig,
      replaceAll,
      flushPendingSaves,
    }),
    [
      config,
      inspections,
      loading,
      loadError,
      saveState,
      updateInspection,
      createInspection,
      removeInspection,
      updateConfig,
      replaceAll,
      flushPendingSaves,
    ],
  );
}
