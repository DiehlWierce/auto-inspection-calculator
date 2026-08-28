import { money, formatDate } from '../utils';
import { inspectionStatusText, statusText, zoneText } from '../domain/format';
import { modelName } from '../domain/vehicle';
import { Metric } from '../ui/primitives';
import type { AppConfig, CalculationResult, Inspection } from '../types';

export function HistoryView({ inspections, results, config, onOpen, onNew, onDelete, onResume }: { inspections: Inspection[]; results: Map<string, CalculationResult>; config: AppConfig; onOpen: (id: string) => void; onNew: () => void; onDelete: (id: string) => void; onResume: (id: string) => void }) {
  const inProgress = inspections.filter((inspection) => inspection.status === 'IN_PROGRESS');
  const finished = inspections.filter((inspection) => inspection.status !== 'IN_PROGRESS');
  const renderGroup = (title: string, items: Inspection[]) => items.length === 0 ? null : <div className="inspection-group" key={title}>
    <h2 className="inspection-group-title">{title} <span className="count-badge">{items.length}</span></h2>
    <div className="inspection-grid">{items.map((inspection) => {
      const result = results.get(inspection.id);
      if (!result) return null;
      return <InspectionCard key={inspection.id} inspection={inspection} result={result} config={config} onOpen={() => onOpen(inspection.id)} onDelete={() => onDelete(inspection.id)} onResume={() => onResume(inspection.id)} />;
    })}</div>
  </div>;
  return <section className="page-section">
    <div className="page-heading">
      <div><p className="eyebrow">LOCAL-FIRST / ОФЛАЙН</p><h1>Осмотры автомобилей</h1><p className="muted">Базовый каталог: Toyota Corolla E120, Kia Cerato LD и Chevrolet Lacetti Hatch. Можно добавлять свои модели.</p></div>
      <button className="primary-button" onClick={onNew}>＋ Новый осмотр</button>
    </div>
    <div className="info-strip"><span className="info-icon">i</span><span>Все расчёты выполняются локально. Текущая конфигурация: фонд <strong>{money(config.fund)}</strong>, лимит объявления <strong>{money(config.maxAskingPrice)}</strong>.</span></div>
    {inspections.length === 0 ? <EmptyState onNew={onNew} /> : <>{renderGroup('В работе', inProgress)}{renderGroup('Завершённые', finished)}</>}
  </section>;
}

export function EmptyState({ onNew }: { onNew: () => void }) {
  return <div className="empty-state"><div className="empty-icon">⌁</div><h2>Осмотров пока нет</h2><p>Создайте карточку автомобиля и фиксируйте факты специалиста по одному.</p><button className="primary-button" onClick={onNew}>Начать первый осмотр</button></div>;
}

export function InspectionCard({ inspection, result, config, onOpen, onDelete, onResume }: { inspection: Inspection; result: CalculationResult; config: AppConfig; onOpen: () => void; onDelete: () => void; onResume: () => void }) {
  return <article className="inspection-card" onClick={onOpen}>
    <div className="card-topline"><span className={`zone-dot ${result.zone.toLowerCase()}`}></span><span>{zoneText(result.zone)}</span><span className={`progress-pill ${inspection.status.toLowerCase()}`}>{inspectionStatusText(inspection.status)}</span><span className="card-date">{formatDate(inspection.updatedAt)}</span></div>
    <h2>{modelName(config, inspection.vehicle.modelId)}</h2>
    <p className="vehicle-meta">{inspection.vehicle.year || 'Год не указан'} · {inspection.vehicle.mileage.toLocaleString('ru-RU')} км · {inspection.facts.length} фактов</p>
    <div className="card-metrics"><Metric label="Цена расчёта" value={money(result.calculationPrice)} /><Metric label="Доведение" value={money(result.safeRestoreCost)} /><Metric label="Рейтинг" value={result.rating.score === null ? '—' : `${result.rating.score}/100`} /></div>
    <div className="card-bottom"><span className={`status-pill ${result.rating.status.toLowerCase()}`}>{statusText(result.rating.status)}</span>{inspection.status !== 'IN_PROGRESS' && <button className="text-button" onClick={(event) => { event.stopPropagation(); onResume(); }}>Продолжить</button>}<button className="icon-button" onClick={(event) => { event.stopPropagation(); onDelete(); }} aria-label="Удалить осмотр">×</button></div>
  </article>;
}
