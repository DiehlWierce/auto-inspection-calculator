import { useState } from 'react';
import { useAppData } from '../hooks/useAppData';
import { useCalculation } from '../hooks/useCalculation';
import { useForecastRisk } from '../hooks/useForecastRisk';
import { cloneConfig } from '../config';
import { CompareView } from '../views/CompareView';
import { FAQView } from '../views/FAQView';
import { HistoryView } from '../views/HistoryView';
import { NewInspectionView } from '../views/NewInspectionView';
import { ForecastView } from '../views/forecast/ForecastView';
import { InspectionView } from '../views/inspection/InspectionView';
import { SettingsView } from '../views/settings/SettingsView';
import { calculateInspection } from '../calc';
import type { CalculationResult, Inspection, View } from '../types';

function App() {
  const { config, inspections, loading, loadError, backupTask, updateInspection, createInspection, removeInspection, updateConfig, exportBackup, importBackup } = useAppData();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<View>('history');
  const results = useCalculation(inspections);

  const active = inspections.find((inspection) => inspection.id === activeId) ?? null;

  const openInspection = (next: Inspection) => {
    createInspection(next);
    setActiveId(next.id);
    setView('inspection');
  };

  const deleteInspection = (id: string) => {
    if (!window.confirm('Удалить этот осмотр? Действие нельзя отменить.')) return;
    removeInspection(id);
    if (activeId === id) {
      setActiveId(null);
      setView('history');
    }
  };

  const resumeInspection = (id: string) => {
    const inspection = inspections.find((item) => item.id === id);
    if (!inspection) return;
    updateInspection({ ...inspection, status: 'IN_PROGRESS' });
    setActiveId(id);
    setView('inspection');
  };

  const applyCurrentConfigToActive = () => {
    if (!active || !config) return;
    updateInspection({ ...active, configSnapshot: cloneConfig(config) });
  };

  if (loading || !config) return <div className="loading-screen">Загрузка локального хранилища…</div>;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" onClick={() => setView('history')} role="button" tabIndex={0}>
          <span className="brand-mark">⌁</span>
          <span><strong>Автоосмотр</strong><small>детерминированный калькулятор</small></span>
        </div>
        <div className="topbar-actions">
          <label className={`ghost-button compact ${backupTask ? 'disabled' : ''}`}>{backupTask === 'import' ? 'Импорт…' : 'Импорт'}<input type="file" accept="application/json" onChange={(event) => void importBackup(event)} disabled={backupTask !== null} hidden /></label>
          <button className="ghost-button compact" onClick={exportBackup} disabled={backupTask !== null}>{backupTask === 'export' ? 'Экспорт…' : 'Экспорт'}</button>
        </div>
      </header>

      <main className="main-content">
        {loadError && <div className="summary-note warning-note">Не удалось прочитать локальное хранилище: {loadError}. Показана конфигурация по умолчанию — не сохраняйте изменения, пока проблема не устранена.</div>}
        {view === 'history' && <HistoryView inspections={inspections} results={results} config={config} onOpen={(id) => { setActiveId(id); setView('inspection'); }} onNew={() => setView('new')} onDelete={deleteInspection} onResume={resumeInspection} />}
        {view === 'new' && <NewInspectionView config={config} onCancel={() => setView('history')} onCreate={openInspection} />}
        {view === 'inspection' && active && <ActiveInspection inspection={active} results={results} view={view} onUpdate={updateInspection} onApplyConfig={applyCurrentConfigToActive} onNavigate={setView} />}
        {view === 'forecast' && active && <ActiveInspection inspection={active} results={results} view={view} onUpdate={updateInspection} onApplyConfig={applyCurrentConfigToActive} onNavigate={setView} />}
        {view === 'compare' && <CompareView inspections={inspections} results={results} config={config} onOpen={(id) => { setActiveId(id); setView('inspection'); }} />}
        {view === 'settings' && <SettingsView config={config} active={active} onUpdate={updateConfig} onApplyActive={applyCurrentConfigToActive} />}
        {view === 'faq' && <FAQView />}
      </main>

      <nav className="bottom-nav">
        <NavItem icon="⌂" label="Осмотры" active={view === 'history' || view === 'new'} onClick={() => setView('history')} />
        <NavItem icon="▦" label="Сравнить" active={view === 'compare'} onClick={() => setView('compare')} />
        <NavItem icon="⚙" label="Настройки" active={view === 'settings'} onClick={() => setView('settings')} />
        <NavItem icon="?" label="FAQ" active={view === 'faq'} onClick={() => setView('faq')} />
      </nav>
    </div>
  );
}

function ActiveInspection({ inspection, results, view, onUpdate, onApplyConfig, onNavigate }: { inspection: Inspection; results: Map<string, CalculationResult>; view: View; onUpdate: (inspection: Inspection) => void; onApplyConfig: () => void; onNavigate: (view: View) => void }) {
  const base = results.get(inspection.id);
  const result = useForecastRisk(inspection, base ?? calculateInspection(inspection, inspection.configSnapshot, { withRisk: false }));
  if (view === 'forecast') return <ForecastView inspection={inspection} result={result} onUpdate={onUpdate} onApplyConfig={onApplyConfig} onBack={() => onNavigate('inspection')} />;
  return <InspectionView inspection={inspection} result={result} onUpdate={onUpdate} onNavigate={onNavigate} />;
}

function NavItem({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}><span>{icon}</span>{label}</button>;
}

export default App;
