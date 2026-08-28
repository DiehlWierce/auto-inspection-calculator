import { money, percent } from '../../utils';
import { zoneText } from '../../domain/format';
import { Metric } from '../../ui/primitives';
import type { CalculationResult, Inspection } from '../../types';

export function Summary({ result, inspection, onForecast }: { result: CalculationResult; inspection: Inspection; onForecast: () => void }) {
  const ratio = result.reserveRatio === null ? '—' : percent(result.reserveRatio);
  const informationText = inspection.facts.length === 0
    ? 'Фактов пока нет: итоговая оценка предварительная.'
    : result.questionFactsCount > 0
      ? `Под вопросом ${result.questionFactsCount} из ${inspection.facts.length} фактов (${percent(result.questionShare)}). Это не штраф и не добавляет выдуманные расходы — данные требуют подтверждения.`
      : 'Все сохранённые факты подтверждены.';
  return <div className={`summary-card ${result.zone.toLowerCase()}`}>
    <div className="summary-main"><div><span className="summary-label">ФИНАНСОВАЯ СВОДКА</span><div className="summary-zone"><span className={`zone-dot ${result.zone.toLowerCase()}`}></span><strong>{zoneText(result.zone)}</strong></div></div><div className="summary-rating"><span>Рейтинг</span><strong>{result.rating.score === null ? '—' : result.rating.score}</strong><small>/100</small></div></div>
    <div className="summary-stats"><Metric label={result.priceSource === 'ACTUAL' ? 'Фактическая цена' : 'Цена расчёта'} value={money(result.calculationPrice)} /><Metric label="Фонд доведения" value={money(result.restoreBudget)} /><Metric label="Безопасная смета" value={money(result.safeRestoreCost)} /><Metric label="Остаток" value={money(result.remainingBudget)} accent={result.remainingBudget < 0 ? 'danger' : undefined} /><Metric label="Запас" value={ratio} accent={result.zone === 'GREEN' ? 'positive' : result.zone === 'RED' ? 'danger' : 'warning'} /></div>
    <div className="summary-footer"><span>Заявлено {money(result.statedRestoreCost)} · надбавка неопределённости {money(result.uncertaintyPremium)} · {inspection.facts.length} фактов</span><button className="text-button" onClick={onForecast}>Посмотреть прогноз →</button></div>
    <div className="summary-schedule"><span>Сразу после покупки <strong>{money(result.immediateSafeRestoreCost)}</strong></span><span>Сразу + ближайшее время <strong>{money(result.nearTermSafeRestoreCost)}</strong></span><span>Полный план работ <strong>{money(result.fullSafeRestoreCost)}</strong></span></div>
    <div className={`information-note ${result.questionFactsCount > 0 ? 'question-note' : ''}`}><strong>Определённость осмотра</strong><span>{informationText}</span></div>
    {result.fullRemainingBudget < 0 && <div className="summary-note warning-note">Полный план всех отложенных работ превышает фонд на {money(Math.abs(result.fullRemainingBudget))}. Эти траты не включены в текущую точку сразу после покупки и показаны отдельно.</div>}
    {result.calculationPrice > inspection.configSnapshot.targetPurchasePrice && <div className="summary-note warning-note">Цена расчёта выше целевой отметки {money(inspection.configSnapshot.targetPurchasePrice)}. Осмотр не блокируется, если общий сценарий укладывается в фонд.</div>}
  </div>;
}
