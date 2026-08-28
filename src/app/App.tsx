import { useState } from 'react';
import { useAppData } from '../hooks/useAppData';
import { useCalculation } from '../hooks/useCalculation';
import { cloneConfig } from '../config';
import { CompareView } from '../views/CompareView';
import { FAQView } from '../views/FAQView';
import { HistoryView } from '../views/HistoryView';
import { NewInspectionView } from '../views/NewInspectionView';
import { ForecastView } from '../views/forecast/ForecastView';
import { InspectionView } from '../views/inspection/InspectionView';
import { SettingsView } from '../views/settings/SettingsView';
import type { Inspection, View } from '../types';

function App() {
  const { config, inspections, loading, updateInspection, createInspection, removeInspection, updateConfig, exportBackup, importBackup } = useAppData();
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

  const applyCurrentConfigToActive = () => {
    if (!active || !config) return;
    updateInspection({ ...active, configSnapshot: cloneConfig(config) });
  };

  if (loading || !config) return <div className="loading-screen">Загрузка локального хранилища…</div>;

  const activeResult = active ? results.get(active.id) : undefined;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" onClick={() => setView('history')} role="button" tabIndex={0}>
          <span className="brand-mark">⌁</span>
          <span><strong>Автоосмотр</strong><small>детерминированный калькулятор</small></span>
        </div>
        <div className="topbar-actions">
          <label className="ghost-button compact">Импорт<input type="file" accept="application/json" onChange={importBackup} hidden /></label>
          <button className="ghost-button compact" onClick={exportBackup}>Экспорт</button>
        </div>
      </header>

      <main className="main-content">
        {view === 'history' && <HistoryView inspections={inspections} results={results} config={config} onOpen={(id) => { setActiveId(id); setView('inspection'); }} onNew={() => setView('new')} onDelete={deleteInspection} />}
        {view === 'new' && <NewInspectionView config={config} onCancel={() => setView('history')} onCreate={openInspection} />}
        {view === 'inspection' && active && activeResult && <InspectionView inspection={active} result={activeResult} onUpdate={updateInspection} onNavigate={setView} />}
        {view === 'forecast' && active && activeResult && <ForecastView inspection={active} result={activeResult} onUpdate={updateInspection} onApplyConfig={applyCurrentConfigToActive} onBack={() => setView('inspection')} />}
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

function NavItem({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}><span>{icon}</span>{label}</button>;
}

export default App;
