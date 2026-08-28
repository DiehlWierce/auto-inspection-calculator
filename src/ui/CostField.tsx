import { MoneyInput } from './NumberInput';
import { clamp, money } from '../utils';
import type { PriceRangeRule } from '../types';

const amount = (value: number): string => Math.round(value).toLocaleString('ru-RU');
const hours = (value: number): string => `${value.toString().replace('.', ',')} ч`;

/** Показывает, из чего собрана вилка: запчасти плюс нормо-часы, а не просто итоговое число. */
export function CostBasis({ range }: { range: PriceRangeRule }) {
  if (!range.parts || !range.laborHours) return null;
  const labor = Math.max(0, range.typical - range.parts.typical);
  return <small className="cost-basis">
    <strong>{range.label}</strong>
    <span>Запчасти ≈ {amount(range.parts.typical)} ₽ + работа {hours(range.laborHours.typical)} ≈ {amount(labor)} ₽</span>
    {range.scope && <span className="cost-basis-scope">{range.scope}</span>}
  </small>;
}

export function CostField({ label, hint, value, range, compact = false, onCommit, onOpenPriceBook }: { label: string; hint?: string; value: number | null; range: PriceRangeRule | null; compact?: boolean; onCommit: (value: number | null) => void; onOpenPriceBook?: () => void }) {
  const filled = value !== null && value !== undefined;
  const tone = filled && range ? (value < range.min ? 'below' : value > range.max ? 'above' : 'inside') : null;
  const presets = range ? [{ title: 'Мин', sum: range.min }, { title: 'Типовая', sum: range.typical }, { title: 'Макс', sum: range.max }] : [];
  const position = range && filled ? (range.max > range.min ? clamp((value - range.min) / (range.max - range.min), 0, 1) * 100 : 50) : 0;

  return <div className={`cost-field ${compact ? 'mini-field compact' : 'field'}`}>
    {compact ? <span>{label}</span> : <span className="field-label">{label}{hint && <small>{hint}</small>}</span>}
    <MoneyInput allowEmpty format suffix="₽" value={value} onCommit={onCommit} placeholder={range ? amount(range.typical) : 'Сумма'} />
    {range
      ? <>
        <div className="cost-chips">{presets.map((preset) => <button key={preset.title} type="button" className={`cost-chip ${value === preset.sum ? 'active' : ''}`} onClick={() => onCommit(preset.sum)}>{preset.title} {amount(preset.sum)}</button>)}</div>
        {filled && <div className="cost-scale"><span className={`cost-scale-marker ${tone}`} style={{ left: `${position}%` }} /></div>}
        <CostBasis range={range} />
        <small className={`cost-note ${tone === 'above' || tone === 'below' ? 'attention' : ''}`}>{noteFor(range, filled, tone)}</small>
      </>
      : <div className="cost-missing"><span>Для этого типа работ нет вилки цен — без суммы расчёт не сойдётся.</span>{onOpenPriceBook && <button type="button" className="text-button" onClick={onOpenPriceBook}>Справочник цен</button>}</div>}
  </div>;
}

function noteFor(range: PriceRangeRule, filled: boolean, tone: string | null): string {
  if (!filled) return `Пусто — считаем по типовой ${money(range.typical)}`;
  if (tone === 'above') return 'Выше справочной вилки — проверьте сумму';
  if (tone === 'below') return 'Ниже справочной вилки — проверьте сумму';
  return 'В пределах справочной вилки';
}
