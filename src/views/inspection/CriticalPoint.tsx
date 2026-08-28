import { money, percent } from '../../utils';
import type { CalculationResult } from '../../types';

export function CriticalPoint({ result, onReject, onContinue }: { result: CalculationResult; onReject: () => void; onContinue: () => void }) {
  const reason = result.remainingBudget < 0
    ? `Безопасная стоимость доведения составляет ${money(result.safeRestoreCost)} при доступном бюджете ${money(result.restoreBudget)}.`
    : result.zone === 'FILTER_FAIL'
      ? 'Цена объявления выше установленного предела первичного фильтра.'
      : result.criticalBodyRisks.length > 0
        ? 'Обнаружен критический кузовной или геометрический риск. Денежная смета не заменяет экспертную оценку.'
        : result.rating.hardBlocks[0] ?? 'Текущий сценарий требует дополнительной проверки.';
  return <div className="critical-point"><div className="critical-icon">!</div><div><strong>Критическая точка</strong><p>{reason} {result.reserveRatio !== null && `Запас ${percent(result.reserveRatio)}.`}</p></div><div className="button-row"><button className="danger-button" onClick={onReject}>Завершить — отказ</button><button className="continue-button" onClick={onContinue}>Понятно, продолжить</button></div></div>;
}
