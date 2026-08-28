import { useState } from 'react';
import { money, percent } from '../../utils';
import { categoryName } from '../../calc';
import { Metric } from '../../ui/primitives';
import { RiskCard } from './RiskCard';
import { CustomEventForm } from './CustomEventForm';
import { EventEditor } from './EventEditor';
import { ForecastBreakdown } from './ForecastBreakdown';
import type { CalculationResult, Inspection, RepairEvent } from '../../types';

export function ForecastView({ inspection, result, onUpdate, onApplyConfig, onBack }: { inspection: Inspection; result: CalculationResult; onUpdate: (inspection: Inspection) => void; onApplyConfig: () => void; onBack: () => void }) {
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const forecast = result.forecast;
  const config = inspection.configSnapshot;
  const customEventIds = new Set((inspection.customEvents ?? []).map((event) => event.id));
  const toggleEvent = (eventId: string, enabled: boolean) => onUpdate({ ...inspection, eventOverrides: { ...inspection.eventOverrides, [eventId]: { ...inspection.eventOverrides[eventId], enabled } } });
  const deleteEvent = (eventId: string) => {
    const event = forecast.eventRows.find((row) => row.event.id === eventId)?.event;
    if (!event || !window.confirm(`Удалить событие «${event.name}» из этого прогноза?`)) return;
    if (customEventIds.has(eventId)) {
      onUpdate({ ...inspection, customEvents: (inspection.customEvents ?? []).filter((item) => item.id !== eventId) });
    } else {
      onUpdate({ ...inspection, eventOverrides: { ...inspection.eventOverrides, [eventId]: { ...inspection.eventOverrides[eventId], removed: true } } });
    }
    if (editingEventId === eventId) setEditingEventId(null);
  };
  const saveEvent = (updated: RepairEvent) => {
    if (customEventIds.has(updated.id)) {
      onUpdate({ ...inspection, customEvents: (inspection.customEvents ?? []).map((item) => item.id === updated.id ? updated : item) });
    } else {
      onUpdate({ ...inspection, eventOverrides: { ...inspection.eventOverrides, [updated.id]: { ...inspection.eventOverrides[updated.id], name: updated.name, category: updated.category, mode: updated.mode, scheduledMonth: updated.scheduledMonth, probability5y: updated.probability5y, repairCost: updated.repairCost, coefficient: updated.coefficient, maxCost: updated.maxCost, monthStart: updated.monthStart, monthEnd: updated.monthEnd, recurrenceMonths: updated.recurrenceMonths } } });
    }
    setEditingEventId(null);
  };
  return <section className="page-section">
    <div className="page-heading"><div><button className="back-link" onClick={onBack}>← Назад к осмотру</button><p className="eyebrow">ПРОГНОЗ / 60 МЕСЯЦЕВ</p><h1>Стоимость эксплуатации</h1><p className="muted">Модельные вероятности являются редактируемыми сценарными параметрами.</p></div><button className="ghost-button" onClick={onApplyConfig}>Применить текущие настройки</button></div>
    <div className="forecast-hero"><Metric label="Операционные расходы за 5 лет" value={money(forecast.totalCost)} /><Metric label="Операционные ₽/мес" value={money(forecast.averageMonthlyCost)} /><Metric label="Плохой сценарий P80 за 5 лет" value={money(forecast.p80FiveYearCost)} /><Metric label="P80 ₽/мес" value={money(forecast.p80MonthlyCost)} /><Metric label="Полная стоимость за 5 лет" value={money(forecast.fullFiveYearCost)} /><Metric label="Полные ₽/мес" value={money(forecast.fullAverageMonthlyCost)} /></div>
    <div className="forecast-note neutral-note"><strong>P50 / P80 / P90 — это перцентили расходов.</strong><span>P50 — медиана: в половине сценариев траты будут ниже. P80 и P90 — «неудачные» годы: расходы окажутся ниже этой суммы в 80 % и 90 % сценариев. Ожидаемая сумма — среднее, из-за редких крупных ремонтов она выше медианы.</span></div>
    <div className="forecast-note neutral-note"><strong>Регулярные и повторяющиеся траты.</strong><span>За 5 лет: повторяющиеся работы {money(forecast.expectedRecurringSpend5y)}, разовые риски {money(forecast.expectedOneShotSpend5y)}. Повторяющиеся события (тормоза, кузовная поддержка, расходники) перевзводятся каждые несколько месяцев, поэтому не заканчиваются на 2–3 году.</span></div>
    <div className="initial-outlay-note"><strong>Сразу после покупки: {money(result.safeRestoreCost)}</strong><span>Эта сумма уже входит в полную стоимость, но не смешивается с ежемесячными эксплуатационными расходами.</span></div>
    <div className="risk-grid"><RiskCard label="Хотя бы один крупный ремонт" value={forecast.probabilityAnyMajorRepair} /><RiskCard label={`Превышение лимита ${money(config.scenario.annualLimit)} / год`} value={forecast.probabilityAnyLimitViolation} /><RiskCard label={`Больше ${config.majorRepairsPerYearLimit} крупных ремонтов`} value={forecast.probabilityAnyMajorRepairLimitViolation} /><RiskCard label={`Ремонты ближе ${config.minMonthsBetweenMajorRepairs} месяцев`} value={forecast.probabilityCloseMajorRepairs} /><RiskCard label={`Ремонт дороже ${money(config.criticalRepairThreshold)}`} value={forecast.probabilityCriticalRepair} /></div>
    {forecast.riskPending && <div className="forecast-note neutral-note">Риск-метрики считаются симуляцией и появятся через мгновение. Денежная часть прогноза уже посчитана аналитически и не зависит от симуляции.</div>}
    <div className="forecast-note"><strong>Откуда берётся риск крупных ремонтов.</strong><span>Денежный прогноз считается аналитически по интенсивности событий, поэтому меняется мгновенно. Вероятности крупных ремонтов даёт отдельная симуляция на {config.simulationScenarios.toLocaleString('ru-RU')} сценариев: крупным считается ремонт стоимостью не ниже {money(config.majorRepairThreshold)}. Показатели меняются при добавлении, удалении, отключении или редактировании P, стоимости, периодичности и срока события.</span></div>
    {forecast.questionFactsCount > 0 && <div className="forecast-note neutral-note"><strong>В осмотре {forecast.questionFactsCount} фактов под вопросом.</strong> Они не увеличивают вероятность крупных ремонтов автоматически: приложение не выдумывает статистику. Влияние видно как уровень определённости, а конкретный риск появится в прогнозе только после добавления работы, стоимости или отдельного потенциального события.</div>}
    <div className="content-card"><div className="section-heading compact-heading"><div><p className="eyebrow">ПО ГОДАМ И МЕСЯЦАМ</p><h2>Детализация денежных потоков</h2></div><span className="muted">Лимит: {money(config.scenario.annualLimit)} / год</span></div><div className="forecast-legend"><span><strong>P</strong> — вероятность события за 5 лет.</span><span><strong>K</strong> — множитель неопределённости стоимости, не вероятность.</span><span><strong>Плановый бюджет</strong> = регулярные расходы + ежемесячное пополнение резерва.</span><span><strong>Ожидаемо всего</strong> = регулярные расходы + средние траты месяца.</span><span><strong>P80</strong> — расходы месяца или года в неудачном сценарии.</span></div><ForecastBreakdown forecast={forecast} /></div>
    <div className="content-card"><div className="section-heading compact-heading"><div><p className="eyebrow">МОДЕЛЬ РЕМОНТОВ</p><h2>Потенциальные события</h2></div><div className="button-row"><span className="muted">События можно отключить, изменить или удалить.</span><button className="primary-button" onClick={() => setShowCustomForm((value) => !value)}>＋ Добавить работу</button></div></div>{showCustomForm && <CustomEventForm modelId={inspection.vehicle.modelId} onCancel={() => setShowCustomForm(false)} onAdd={(event) => { onUpdate({ ...inspection, customEvents: [...(inspection.customEvents ?? []), event] }); setShowCustomForm(false); }} /> }<div className="event-list">{forecast.eventRows.length === 0 && <div className="subtle-empty">В этом прогнозе нет потенциальных событий. Добавьте работу вручную — стандартный каталог конфигурации при этом не меняется.</div>}{forecast.eventRows.map(({ event, enabled, expectedCost, riskCost, recurrenceMonths, mode }) => <div className="event-entry" key={event.id}><div className={`event-row ${enabled ? '' : 'disabled'}`}><label className="switch-label"><input type="checkbox" checked={enabled} onChange={(input) => toggleEvent(event.id, input.target.checked)} /><span className="switch"></span></label><div className="event-name"><strong>{event.name}</strong><span>{categoryName(event.category)} · {mode === 'SCHEDULED' ? `запланировано на ${event.monthStart}-й месяц` : recurrenceMonths > 0 ? `повторяется примерно раз в ${recurrenceMonths} мес.` : `окно ${event.monthStart}–${event.monthEnd} мес.`}</span></div><div><span className="event-stat">{mode === 'SCHEDULED' ? 'Срок 100%' : recurrenceMonths > 0 ? `P ${percent(event.probability5y)} / цикл` : `P ${percent(event.probability5y)}`}</span><small>ожидаемо {money(expectedCost)}</small></div><div><span className="event-stat">max {money(riskCost)}</span><small>K {event.coefficient.toFixed(2)}</small></div><div className="event-actions"><button className="action-button secondary-action" onClick={() => setEditingEventId(editingEventId === event.id ? null : event.id)}>{editingEventId === event.id ? 'Закрыть' : 'Изменить'}</button><button className="action-button danger-action" onClick={() => deleteEvent(event.id)}>Удалить</button></div></div>{editingEventId === event.id && <EventEditor event={event} allowMode onCancel={() => setEditingEventId(null)} onSave={saveEvent} />}</div>)}</div></div>
  </section>;
}
