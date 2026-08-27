import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { cloneConfig } from './config';
import { calculateInspection } from './calculator';
import { BackupError, createBackup, parseBackup } from './backup';
import { useAppData, type SaveState } from './state/useAppData';
import { ConfirmHost, confirmAction } from './ui/confirm';
import { NotificationHost, notify } from './ui/notify';
import { downloadText } from './utils';
import { NavItem } from './components/primitives';
import { HistoryView } from './views/HistoryView';
import { NewInspectionView } from './views/NewInspectionView';
import { InspectionView } from './views/InspectionView';
import { ForecastView } from './views/ForecastView';
import { CompareView } from './views/CompareView';
import { SettingsView } from './views/SettingsView';
import { FaqView } from './views/FaqView';
import type { AppConfig, Inspection, View } from './types';

const SAVE_STATE_LABELS: Record<SaveState, string> = {
  idle: '',
  saving: 'Сохраняю…',
  saved: 'Сохранено',
  error: 'Не сохранено',
};

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  return (
    <span className={`save-indicator save-${state}`} role="status" aria-live="polite">
      {SAVE_STATE_LABELS[state]}
    </span>
  );
}

function App() {
  const {
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
  } = useAppData();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<View>('history');

  useEffect(() => {
    if (loadError) notify(loadError, 'error');
  }, [loadError]);

  const active = inspections.find((inspection) => inspection.id === activeId) ?? null;

  // Расчёт включает симуляцию Монте-Карло, поэтому он не должен запускаться
  // на каждый рендер: только когда изменился сам осмотр.
  const activeResult = useMemo(() => (active ? calculateInspection(active) : null), [active]);

  const openInspection = (id: string) => {
    setActiveId(id);
    setView('inspection');
  };

  const handleCreate = (inspection: Inspection) => {
    createInspection(inspection);
    openInspection(inspection.id);
  };

  const handleDelete = async (id: string) => {
    const target = inspections.find((item) => item.id === id);
    const confirmed = await confirmAction({
      message: 'Удалить этот осмотр?',
      detail: target ? `Будет удалён осмотр с ${target.facts.length} фактами. Действие нельзя отменить.` : undefined,
    });
    if (!confirmed) return;
    removeInspection(id);
    if (activeId === id) {
      setActiveId(null);
      setView('history');
    }
  };

  const applyCurrentConfigToActive = () => {
    if (!active || !config) return;
    updateInspection({ ...active, configSnapshot: cloneConfig(config) });
  };

  const exportBackup = async () => {
    if (!config) return;
    await flushPendingSaves();
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`автоосмотр-backup-${stamp}.json`, createBackup(config, inspections));
    notify('Резервная копия выгружена.', 'success');
  };

  const importBackup = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => notify('Не удалось прочитать файл.', 'error');
    reader.onload = () => {
      const text = reader.result;
      if (typeof text !== 'string') {
        notify('Не удалось прочитать файл.', 'error');
        return;
      }
      let parsed: { config: AppConfig; inspections: Inspection[] };
      try {
        parsed = parseBackup(text);
      } catch (error) {
        notify(error instanceof BackupError ? error.message : 'Не удалось прочитать резервную копию.', 'error');
        return;
      }
      void (async () => {
        const confirmed = await confirmAction({
          message: 'Заменить текущие данные копией из файла?',
          detail: `В файле осмотров: ${parsed.inspections.length}. Сейчас в приложении: ${inspections.length}. Текущие данные будут удалены.`,
          confirmLabel: 'Импортировать',
        });
        if (!confirmed) return;
        setActiveId(null);
        setView('history');
        replaceAll(parsed.config, parsed.inspections);
        notify(`Импортировано осмотров: ${parsed.inspections.length}.`, 'success');
      })();
    };
    reader.readAsText(file);
  };

  if (loading || !config) return <div className="loading-screen">Загрузка локального хранилища…</div>;

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          type="button"
          className="brand"
          onClick={() => setView('history')}
          aria-label="На главную — список осмотров"
        >
          <span className="brand-mark" aria-hidden="true">
            ⌁
          </span>
          <span>
            <strong>Автоосмотр</strong>
            <small>детерминированный калькулятор</small>
          </span>
        </button>
        <div className="topbar-actions">
          <SaveIndicator state={saveState} />
          <label className="ghost-button compact">
            Импорт
            <input type="file" accept="application/json" onChange={importBackup} hidden />
          </label>
          <button type="button" className="ghost-button compact" onClick={() => void exportBackup()}>
            Экспорт
          </button>
        </div>
      </header>

      <main className="main-content">
        {view === 'history' && (
          <HistoryView
            inspections={inspections}
            config={config}
            onOpen={openInspection}
            onNew={() => setView('new')}
            onDelete={(id) => void handleDelete(id)}
          />
        )}
        {view === 'new' && (
          <NewInspectionView config={config} onCancel={() => setView('history')} onCreate={handleCreate} />
        )}
        {view === 'inspection' && active && activeResult && (
          <InspectionView inspection={active} result={activeResult} onUpdate={updateInspection} onNavigate={setView} />
        )}
        {view === 'forecast' && active && activeResult && (
          <ForecastView
            inspection={active}
            result={activeResult}
            onUpdate={updateInspection}
            onApplyConfig={applyCurrentConfigToActive}
            onBack={() => setView('inspection')}
          />
        )}
        {view === 'compare' && <CompareView inspections={inspections} config={config} onOpen={openInspection} />}
        {view === 'settings' && (
          <SettingsView
            config={config}
            active={active}
            onUpdate={updateConfig}
            onApplyActive={applyCurrentConfigToActive}
          />
        )}
        {view === 'faq' && <FaqView />}
      </main>

      <nav className="bottom-nav">
        <NavItem
          icon="⌂"
          label="Осмотры"
          active={view === 'history' || view === 'new'}
          onClick={() => setView('history')}
        />
        <NavItem icon="▦" label="Сравнить" active={view === 'compare'} onClick={() => setView('compare')} />
        <NavItem icon="⚙" label="Настройки" active={view === 'settings'} onClick={() => setView('settings')} />
        <NavItem icon="?" label="FAQ" active={view === 'faq'} onClick={() => setView('faq')} />
      </nav>

      <ConfirmHost />
      <NotificationHost />
    </div>
  );
}

export default App;
