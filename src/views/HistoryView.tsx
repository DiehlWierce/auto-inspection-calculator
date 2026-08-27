import { useMemo } from 'react';
import { calculateInspection } from '../calculator';
import { formatDate, money } from '../utils';
import { statusText, zoneText } from '../labels';
import { modelName } from '../domain/inspection';
import { EmptyState, Metric } from '../components/primitives';
import type { AppConfig, Inspection } from '../types';

export function HistoryView({
  inspections,
  config,
  onOpen,
  onNew,
  onDelete,
}: {
  inspections: Inspection[];
  config: AppConfig;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const rows = useMemo(
    () => inspections.map((inspection) => ({ inspection, result: calculateInspection(inspection) })),
    [inspections],
  );
  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">LOCAL-FIRST / ОФЛАЙН</p>
          <h1>Осмотры автомобилей</h1>
          <p className="muted">
            Базовый каталог: Toyota Corolla E120, Kia Cerato LD и Chevrolet Lacetti Hatch. Можно добавлять свои модели.
          </p>
        </div>
        <button type="button" className="primary-button" onClick={onNew}>
          ＋ Новый осмотр
        </button>
      </div>
      <div className="info-strip">
        <span className="info-icon">i</span>
        <span>
          Все расчёты выполняются локально. Текущая конфигурация: фонд <strong>{money(config.fund)}</strong>, лимит
          объявления <strong>{money(config.maxAskingPrice)}</strong>.
        </span>
      </div>
      {inspections.length === 0 ? (
        <EmptyState onNew={onNew} />
      ) : (
        <div className="inspection-grid">
          {rows.map(({ inspection, result }) => (
            <InspectionCard
              key={inspection.id}
              inspection={inspection}
              result={result}
              config={config}
              onOpen={() => onOpen(inspection.id)}
              onDelete={() => onDelete(inspection.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function InspectionCard({
  inspection,
  result,
  config,
  onOpen,
  onDelete,
}: {
  inspection: Inspection;
  result: ReturnType<typeof calculateInspection>;
  config: AppConfig;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="inspection-card" onClick={onOpen}>
      <div className="card-topline">
        <span className={`zone-dot ${result.zone.toLowerCase()}`}></span>
        <span>{zoneText(result.zone)}</span>
        <span className="card-date">{formatDate(inspection.updatedAt)}</span>
      </div>
      <h2>{modelName(config, inspection.vehicle.modelId)}</h2>
      <p className="vehicle-meta">
        {inspection.vehicle.year || 'Год не указан'} · {inspection.vehicle.mileage.toLocaleString('ru-RU')} км ·{' '}
        {inspection.facts.length} фактов
      </p>
      <div className="card-metrics">
        <Metric label="Цена расчёта" value={money(result.calculationPrice)} />
        <Metric label="Доведение" value={money(result.safeRestoreCost)} />
        <Metric label="Рейтинг" value={result.rating.score === null ? '—' : `${result.rating.score}/100`} />
      </div>
      <div className="card-bottom">
        <span className={`status-pill ${result.rating.status.toLowerCase()}`}>{statusText(result.rating.status)}</span>
        <button
          type="button"
          className="icon-button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          aria-label="Удалить осмотр"
        >
          ×
        </button>
      </div>
    </article>
  );
}
