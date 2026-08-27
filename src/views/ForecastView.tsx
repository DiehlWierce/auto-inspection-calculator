import { useState } from 'react';
import type { FormEvent } from 'react';
import { CATEGORIES } from '../config';
import { calculateInspection, categoryName } from '../calculator';
import { confirmAction } from '../ui/confirm';
import { money, numberValue, percent, uid } from '../utils';
import { Field, Metric, RiskCard } from '../components/primitives';
import { EventEditor } from '../components/EventEditor';
import type { CategoryId, Inspection, ModelId, RepairEvent } from '../types';

export function ForecastView({
  inspection,
  result,
  onUpdate,
  onApplyConfig,
  onBack,
}: {
  inspection: Inspection;
  result: ReturnType<typeof calculateInspection>;
  onUpdate: (inspection: Inspection) => void;
  onApplyConfig: () => void;
  onBack: () => void;
}) {
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const forecast = result.forecast;
  const config = inspection.configSnapshot;
  const customEventIds = new Set((inspection.customEvents ?? []).map((event) => event.id));
  const toggleEvent = (eventId: string, enabled: boolean) =>
    onUpdate({
      ...inspection,
      eventOverrides: { ...inspection.eventOverrides, [eventId]: { ...inspection.eventOverrides[eventId], enabled } },
    });
  const deleteEvent = async (eventId: string) => {
    const event = forecast.eventRows.find((row) => row.event.id === eventId)?.event;
    if (!event) return;
    if (!(await confirmAction(`Удалить событие «${event.name}» из этого прогноза?`))) return;
    if (customEventIds.has(eventId)) {
      onUpdate({ ...inspection, customEvents: (inspection.customEvents ?? []).filter((item) => item.id !== eventId) });
    } else {
      onUpdate({
        ...inspection,
        eventOverrides: {
          ...inspection.eventOverrides,
          [eventId]: { ...inspection.eventOverrides[eventId], removed: true },
        },
      });
    }
    if (editingEventId === eventId) setEditingEventId(null);
  };
  const saveEvent = (updated: RepairEvent) => {
    if (customEventIds.has(updated.id)) {
      onUpdate({
        ...inspection,
        customEvents: (inspection.customEvents ?? []).map((item) => (item.id === updated.id ? updated : item)),
      });
    } else {
      onUpdate({
        ...inspection,
        eventOverrides: {
          ...inspection.eventOverrides,
          [updated.id]: {
            ...inspection.eventOverrides[updated.id],
            name: updated.name,
            category: updated.category,
            mode: updated.mode,
            scheduledMonth: updated.scheduledMonth,
            probability5y: updated.probability5y,
            repairCost: updated.repairCost,
            coefficient: updated.coefficient,
            maxCost: updated.maxCost,
            monthStart: updated.monthStart,
            monthEnd: updated.monthEnd,
          },
        },
      });
    }
    setEditingEventId(null);
  };
  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <button type="button" className="back-link" onClick={onBack}>
            ← Назад к осмотру
          </button>
          <p className="eyebrow">ПРОГНОЗ / 60 МЕСЯЦЕВ</p>
          <h1>Стоимость эксплуатации</h1>
          <p className="muted">Модельные вероятности являются редактируемыми сценарными параметрами.</p>
        </div>
        <button type="button" className="ghost-button" onClick={onApplyConfig}>
          Применить текущие настройки
        </button>
      </div>
      <div className="forecast-hero">
        <Metric label="Операционные расходы за 5 лет" value={money(forecast.totalCost)} />
        <Metric label="Операционные ₽/мес" value={money(forecast.averageMonthlyCost)} />
        <Metric label="Полная стоимость за 5 лет" value={money(forecast.fullFiveYearCost)} />
        <Metric label="Полные ₽/мес" value={money(forecast.fullAverageMonthlyCost)} />
      </div>
      <div className="initial-outlay-note">
        <strong>Сразу после покупки: {money(result.safeRestoreCost)}</strong>
        <span>
          Эта сумма уже входит в полную стоимость, но не смешивается с ежемесячными эксплуатационными расходами.
        </span>
      </div>
      <div className="risk-grid">
        <RiskCard
          label="Хотя бы один крупный ремонт"
          value={percent(forecast.probabilityAnyMajorRepair)}
          tone={forecast.probabilityAnyMajorRepair > 0 ? 'warn' : 'good'}
        />
        <RiskCard
          label="Превышение лимита 300k/год"
          value={percent(forecast.probabilityAnyLimitViolation)}
          tone={forecast.probabilityAnyLimitViolation > 0 ? 'warn' : 'good'}
        />
        <RiskCard
          label="Больше 4 крупных ремонтов"
          value={percent(forecast.probabilityAnyMajorRepairLimitViolation)}
          tone={forecast.probabilityAnyMajorRepairLimitViolation > 0 ? 'warn' : 'good'}
        />
        <RiskCard
          label="Ремонты ближе 3 месяцев"
          value={percent(forecast.probabilityCloseMajorRepairs)}
          tone={forecast.probabilityCloseMajorRepairs > 0 ? 'warn' : 'good'}
        />
        <RiskCard
          label="Ремонт >120k"
          value={percent(forecast.probabilityCriticalRepair)}
          tone={forecast.probabilityCriticalRepair > 0 ? 'warn' : 'good'}
        />
      </div>
      <div className="forecast-note">
        <strong>Откуда берётся риск крупных ремонтов.</strong>
        <span>
          Симуляция перебирает активные события: крупным считается событие с максимальной сценарной стоимостью не ниже{' '}
          {money(config.majorRepairThreshold)}. Поэтому показатель меняется при добавлении, удалении, отключении или
          редактировании P, максимальной стоимости и срока события.
        </span>
      </div>
      {forecast.questionFactsCount > 0 && (
        <div className="forecast-note neutral-note">
          <strong>В осмотре {forecast.questionFactsCount} фактов под вопросом.</strong> Они не увеличивают вероятность
          крупных ремонтов автоматически: приложение не выдумывает статистику. Влияние видно как уровень определённости,
          а конкретный риск появится в прогнозе только после добавления работы, стоимости или отдельного потенциального
          события.
        </div>
      )}
      <div className="content-card">
        <div className="section-heading compact-heading">
          <div>
            <p className="eyebrow">ПО ГОДАМ И МЕСЯЦАМ</p>
            <h2>Детализация денежных потоков</h2>
          </div>
          <span className="muted">Лимит: {money(config.scenario.annualLimit)} / год</span>
        </div>
        <div className="forecast-legend">
          <span>
            <strong>P</strong> — вероятность события за 5 лет.
          </span>
          <span>
            <strong>K</strong> — множитель неопределённости стоимости, не вероятность.
          </span>
          <span>
            <strong>Плановый бюджет</strong> = регулярные расходы + ежемесячное пополнение резерва.
          </span>
          <span>
            <strong>Ожидаемо всего</strong> = регулярные расходы + траты в конкретном месяце.
          </span>
        </div>
        <ForecastBreakdown forecast={forecast} />
      </div>
      <div className="content-card">
        <div className="section-heading compact-heading">
          <div>
            <p className="eyebrow">МОДЕЛЬ РЕМОНТОВ</p>
            <h2>Потенциальные события</h2>
          </div>
          <div className="button-row">
            <span className="muted">События можно отключить, изменить или удалить.</span>
            <button type="button" className="primary-button" onClick={() => setShowCustomForm((value) => !value)}>
              ＋ Добавить работу
            </button>
          </div>
        </div>
        {showCustomForm && (
          <CustomEventForm
            modelId={inspection.vehicle.modelId}
            onCancel={() => setShowCustomForm(false)}
            onAdd={(event) => {
              onUpdate({ ...inspection, customEvents: [...(inspection.customEvents ?? []), event] });
              setShowCustomForm(false);
            }}
          />
        )}
        <div className="event-list">
          {forecast.eventRows.length === 0 && (
            <div className="subtle-empty">
              В этом прогнозе нет потенциальных событий. Добавьте работу вручную — стандартный каталог конфигурации при
              этом не меняется.
            </div>
          )}
          {forecast.eventRows.map(({ event, enabled, expectedCost, riskCost, mode }) => (
            <div className="event-entry" key={event.id}>
              <div className={`event-row ${enabled ? '' : 'disabled'}`}>
                <label className="switch-label">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(input) => toggleEvent(event.id, input.target.checked)}
                  />
                  <span className="switch"></span>
                </label>
                <div className="event-name">
                  <strong>{event.name}</strong>
                  <span>
                    {categoryName(event.category)} ·{' '}
                    {mode === 'SCHEDULED'
                      ? `запланировано на ${event.monthStart}-й месяц`
                      : `окно ${event.monthStart}–${event.monthEnd} мес.`}
                  </span>
                </div>
                <div>
                  <span className="event-stat">
                    {mode === 'SCHEDULED' ? 'Срок 100%' : `P ${percent(event.probability5y)}`}
                  </span>
                  <small>ожидаемо {money(expectedCost)}</small>
                </div>
                <div>
                  <span className="event-stat">max {money(riskCost)}</span>
                  <small>K {event.coefficient.toFixed(2)}</small>
                </div>
                <div className="event-actions">
                  <button
                    type="button"
                    className="action-button secondary-action"
                    onClick={() => setEditingEventId(editingEventId === event.id ? null : event.id)}
                  >
                    {editingEventId === event.id ? 'Закрыть' : 'Изменить'}
                  </button>
                  <button
                    type="button"
                    className="action-button danger-action"
                    onClick={() => void deleteEvent(event.id)}
                  >
                    Удалить
                  </button>
                </div>
              </div>
              {editingEventId === event.id && (
                <EventEditor event={event} allowMode onCancel={() => setEditingEventId(null)} onSave={saveEvent} />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ForecastBreakdown({ forecast }: { forecast: ReturnType<typeof calculateInspection>['forecast'] }) {
  const [expandedYears, setExpandedYears] = useState<Record<number, boolean>>({ 1: true });
  const toggleYear = (year: number) => setExpandedYears((current) => ({ ...current, [year]: !current[year] }));
  return (
    <div className="forecast-breakdown">
      <div className="table-scroll">
        <table className="year-summary-table">
          <thead>
            <tr>
              <th>Год</th>
              <th>Регулярные расходы</th>
              <th>В резерв</th>
              <th>Плановый бюджет</th>
              <th>Отложенные работы</th>
              <th>События</th>
              <th>Ожидаемо всего</th>
              <th>Крупный ремонт</th>
              <th>Риск лимита</th>
            </tr>
          </thead>
          {forecast.years.map((year) => {
            const months = forecast.months.filter((month) => month.year === year.year);
            const regular = months.reduce((sum, month) => sum + month.regularExpenses, 0);
            const reserve = months.reduce((sum, month) => sum + month.plannedReserve, 0);
            const planned = months.reduce((sum, month) => sum + month.plannedBudget, 0);
            const scheduled = months.reduce((sum, month) => sum + month.scheduledEvents + month.expectedRepairs, 0);
            return (
              <tbody key={year.year}>
                <tr>
                  <td>
                    <button type="button" className="year-toggle" onClick={() => toggleYear(year.year)}>
                      {expandedYears[year.year] ? '−' : '+'} Год {year.year}
                    </button>
                  </td>
                  <td>{money(regular)}</td>
                  <td>{money(reserve)}</td>
                  <td className="forecast-plan-cell">{money(planned)}</td>
                  <td>{money(year.deferredFacts)}</td>
                  <td>{money(scheduled)}</td>
                  <td>
                    <strong>{money(year.expectedTotal)}</strong>
                  </td>
                  <td>
                    <span className={year.probabilityAnyMajorRepair > 0 ? 'table-warn' : 'table-good'}>
                      {percent(year.probabilityAnyMajorRepair)}
                    </span>
                  </td>
                  <td>
                    <span className={year.probabilityLimitViolation > 0 ? 'table-warn' : 'table-good'}>
                      {percent(year.probabilityLimitViolation)}
                    </span>
                  </td>
                </tr>
                {expandedYears[year.year] && (
                  <tr>
                    <td colSpan={9}>
                      <MonthlyForecastTable months={months} />
                    </td>
                  </tr>
                )}
              </tbody>
            );
          })}
        </table>
      </div>
      <p className="forecast-footnote">
        «Плановый бюджет» — регулярные расходы плюс текущие отчисления в резерв. «Ожидаемо всего» — регулярные расходы
        плюс разовые траты в месяце события. После наступления события его отчисление прекращается.
      </p>
    </div>
  );
}

export function MonthlyForecastTable({
  months,
}: {
  months: ReturnType<typeof calculateInspection>['forecast']['months'];
}) {
  return (
    <div className="monthly-table-wrap">
      <table className="monthly-table">
        <thead>
          <tr>
            <th>Месяц</th>
            <th>Бензин</th>
            <th>ОСАГО</th>
            <th>Налог</th>
            <th>Плановое ТО</th>
            <th>Жидкости</th>
            <th>Расходники</th>
            <th>Резина</th>
            <th>Мойка</th>
            <th>Штрафы</th>
            <th>Регулярно</th>
            <th>В резерв</th>
            <th>Плановый бюджет</th>
            <th>Отложенные</th>
            <th>По сроку</th>
            <th>Риски, ожидаемо</th>
            <th>Всего</th>
            <th>Баланс резерва</th>
          </tr>
        </thead>
        <tbody>
          {months.map((month) => (
            <tr key={month.month}>
              <td>
                <strong>{month.month}</strong>
              </td>
              <td>{money(month.fuel)}</td>
              <td>{money(month.insurance)}</td>
              <td>{money(month.tax)}</td>
              <td>{money(month.service)}</td>
              <td>{money(month.fluids)}</td>
              <td>{money(month.consumables)}</td>
              <td>{money(month.tires)}</td>
              <td>{money(month.washing)}</td>
              <td>{money(month.fines)}</td>
              <td>{money(month.regularExpenses)}</td>
              <td className="reserve-cell">{money(month.plannedReserve)}</td>
              <td className="forecast-plan-cell">{money(month.plannedBudget)}</td>
              <td>{month.deferredFacts > 0 ? money(month.deferredFacts) : '—'}</td>
              <td>{month.scheduledEvents > 0 ? money(month.scheduledEvents) : '—'}</td>
              <td>{month.expectedRepairs > 0 ? money(month.expectedRepairs) : '—'}</td>
              <td>
                <strong>{money(month.expectedTotal)}</strong>
              </td>
              <td className={month.reserveBalance < 0 ? 'table-warn' : 'table-good'}>{money(month.reserveBalance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CustomEventForm({
  modelId,
  onCancel,
  onAdd,
}: {
  modelId: ModelId;
  onCancel: () => void;
  onAdd: (event: RepairEvent) => void;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<CategoryId>('other');
  const [mode, setMode] = useState<'RISK' | 'SCHEDULED'>('RISK');
  const [probability, setProbability] = useState(50);
  const [month, setMonth] = useState(4);
  const [cost, setCost] = useState(20000);
  const [coefficient, setCoefficient] = useState(1.2);
  const [maxCost, setMaxCost] = useState(30000);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || cost <= 0) return;
    onAdd({
      id: `custom-${uid()}`,
      modelIds: [modelId],
      category,
      name: name.trim(),
      probability5y: mode === 'SCHEDULED' ? 1 : Math.min(100, Math.max(0, probability)) / 100,
      repairCost: cost,
      coefficient,
      maxCost,
      monthStart: mode === 'SCHEDULED' ? month : 1,
      monthEnd: mode === 'SCHEDULED' ? month : 60,
      mode,
      scheduledMonth: mode === 'SCHEDULED' ? month : undefined,
    });
  };
  return (
    <form className="custom-event-form" onSubmit={submit}>
      <div className="form-grid two">
        <Field label="Название работы">
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Например: замена радиатора печки"
            required
          />
        </Field>
        <Field label="Категория">
          <select value={category} onChange={(event) => setCategory(event.target.value as CategoryId)}>
            {CATEGORIES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="form-grid three">
        <Field label="Тип события">
          <select value={mode} onChange={(event) => setMode(event.target.value as 'RISK' | 'SCHEDULED')}>
            <option value="RISK">Вероятностное</option>
            <option value="SCHEDULED">Известный срок</option>
          </select>
        </Field>
        {mode === 'RISK' ? (
          <Field label="Вероятность, %">
            <input
              type="number"
              min="0"
              max="100"
              value={probability}
              onChange={(event) => setProbability(numberValue(event.target.value))}
            />
          </Field>
        ) : (
          <Field label="Через сколько месяцев">
            <input
              type="number"
              min="1"
              max="60"
              value={month}
              onChange={(event) => setMonth(numberValue(event.target.value))}
            />
          </Field>
        )}
        <Field label="Стоимость, ₽">
          <input type="number" min="1" value={cost} onChange={(event) => setCost(numberValue(event.target.value))} />
        </Field>
      </div>
      <div className="form-grid two">
        <Field label="Коэффициент K">
          <input
            type="number"
            min="1"
            step="0.01"
            value={coefficient}
            onChange={(event) => setCoefficient(numberValue(event.target.value))}
          />
        </Field>
        <Field label="Максимальная стоимость, ₽">
          <input
            type="number"
            min="0"
            value={maxCost}
            onChange={(event) => setMaxCost(numberValue(event.target.value))}
          />
        </Field>
      </div>
      <div className="form-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>
          Отмена
        </button>
        <button type="submit" className="primary-button">
          Добавить в прогноз
        </button>
      </div>
    </form>
  );
}
