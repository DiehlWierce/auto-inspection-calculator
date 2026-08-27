import { useMemo, useState } from 'react';
import { calculateInspection } from '../calculator';
import { money } from '../utils';
import { zoneText } from '../labels';
import { modelName } from '../domain/inspection';
import type { AppConfig, Inspection } from '../types';

export function CompareView({
  inspections,
  config,
  onOpen,
}: {
  inspections: Inspection[];
  config: AppConfig;
  onOpen: (id: string) => void;
}) {
  const [sort, setSort] = useState('score');
  const rows = useMemo(
    () =>
      inspections
        .map((inspection) => ({ inspection, result: calculateInspection(inspection) }))
        .sort((left, right) => {
          if (sort === 'price') return left.result.calculationPrice - right.result.calculationPrice;
          if (sort === 'restore') return left.result.safeRestoreCost - right.result.safeRestoreCost;
          if (sort === 'remaining') return right.result.remainingBudget - left.result.remainingBudget;
          if (sort === 'ownership') return left.result.forecast.totalCost - right.result.forecast.totalCost;
          return (right.result.rating.score ?? -1) - (left.result.rating.score ?? -1);
        }),
    [inspections, sort],
  );
  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ИСТОРИЯ / СРАВНЕНИЕ</p>
          <h1>Сравнить автомобили</h1>
          <p className="muted">Модели из текущего каталога и пользовательские профили.</p>
        </div>
        <label className="sort-control">
          Сортировать{' '}
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="score">по рейтингу</option>
            <option value="price">по цене</option>
            <option value="restore">по доведению</option>
            <option value="remaining">по остатку</option>
            <option value="ownership">по владению</option>
          </select>
        </label>
      </div>
      {rows.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">▦</div>
          <h2>Сравнивать пока нечего</h2>
          <p>Создайте хотя бы один осмотр, и он появится в этой таблице.</p>
        </div>
      ) : (
        <div className="content-card table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Автомобиль</th>
                  <th>Цена</th>
                  <th>Доведение</th>
                  <th>Остаток</th>
                  <th>Опер. ₽/мес</th>
                  <th>Полные ₽/мес</th>
                  <th>Рейтинг</th>
                  <th>Зона</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ inspection, result }) => (
                  <tr key={inspection.id} className="clickable-row" onClick={() => onOpen(inspection.id)}>
                    <td>
                      <strong>{modelName(config, inspection.vehicle.modelId)}</strong>
                      <small>
                        {inspection.vehicle.year} · {inspection.vehicle.mileage.toLocaleString('ru-RU')} км
                      </small>
                    </td>
                    <td>{money(result.calculationPrice)}</td>
                    <td>{money(result.safeRestoreCost)}</td>
                    <td className={result.remainingBudget < 0 ? 'table-warn' : ''}>{money(result.remainingBudget)}</td>
                    <td>{money(result.forecast.averageMonthlyCost)}</td>
                    <td>{money(result.forecast.fullAverageMonthlyCost)}</td>
                    <td>
                      <strong>{result.rating.score ?? '—'}</strong>
                    </td>
                    <td>
                      <span className={`table-zone ${result.zone.toLowerCase()}`}>{zoneText(result.zone)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
