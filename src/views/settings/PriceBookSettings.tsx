import { CATEGORIES } from '../../config';
import { priceFromBasis } from '../../config/seeds.priceBook';
import { MoneyInput } from '../../ui/NumberInput';
import type { AppConfig, CostSpread, PriceRangeRule } from '../../types';

const amount = (value: number): string => Math.round(value).toLocaleString('ru-RU');
const hours = (value: number): string => value.toString().replace('.', ',');

function basisLine(rule: PriceRangeRule): string | null {
  if (!rule.parts || !rule.laborHours) return null;
  return `Запчасти ${amount(rule.parts.min)}–${amount(rule.parts.max)} ₽ · работа ${hours(rule.laborHours.min)}–${hours(rule.laborHours.max)} ч`;
}

export function PriceBookSettings({ config, onUpdate }: { config: AppConfig; onUpdate: (updater: (config: AppConfig) => AppConfig) => void }) {
  const setValue = (id: string, key: 'min' | 'typical' | 'max', value: number) => onUpdate((current) => { const target = current.priceBook.find((item) => item.id === id); if (target) target[key] = value; return current; });
  const setRate = (key: keyof CostSpread, value: number) => onUpdate((current) => ({ ...current, laborRate: { ...current.laborRate, [key]: value } }));
  const recalculate = () => onUpdate((current) => ({ ...current, priceBook: current.priceBook.map((rule) => priceFromBasis(rule, current.laborRate)) }));
  const groups = CATEGORIES.map((category) => ({ category, rules: config.priceBook.filter((rule) => rule.category === category.id) })).filter((group) => group.rules.length > 0);

  return <div className="content-card full-width">
    <div className="section-heading compact-heading"><div><p className="eyebrow">ОБЩИЕ ПРАВИЛА</p><h2>Справочник цен на работы</h2></div><span className="muted">Подставляется в факт без указанной стоимости: в смету — типовая, в безопасную — максимум.</span></div>
    <div className="labor-rate-card">
      <div className="labor-rate-intro"><strong>Ставка нормо-часа</strong><span className="muted">Вилки собраны как «запчасти + нормо-часы × ставка». Поменяйте ставку под свой регион и пересчитайте.</span></div>
      <div className="labor-rate-fields">
        <label>Гараж<MoneyInput suffix="₽/ч" value={config.laborRate.min} onCommit={(value) => setRate('min', value ?? 0)} /></label>
        <label>Типовой сервис<MoneyInput suffix="₽/ч" value={config.laborRate.typical} onCommit={(value) => setRate('typical', value ?? 0)} /></label>
        <label>Специализированный<MoneyInput suffix="₽/ч" value={config.laborRate.max} onCommit={(value) => setRate('max', value ?? 0)} /></label>
      </div>
      <button type="button" className="ghost-button compact-action" onClick={recalculate}>Пересчитать по ставке</button>
    </div>
    {groups.map((group) => <div className="price-book-group" key={group.category.id}>
      <div className="price-book-group-title">{group.category.label}</div>
      <div className="price-book-grid">
        <div className="price-book-header"><span>Работа</span><span>Минимум</span><span>Типовая</span><span>Максимум</span></div>
        {group.rules.map((rule) => <div className="price-book-row" key={rule.id}>
          <span className="price-book-label">{rule.label}{basisLine(rule) && <small>{basisLine(rule)}</small>}{rule.scope && <small className="price-book-scope">{rule.scope}</small>}</span>
          <MoneyInput suffix="₽" value={rule.min} onCommit={(value) => setValue(rule.id, 'min', value ?? 0)} />
          <MoneyInput suffix="₽" value={rule.typical} onCommit={(value) => setValue(rule.id, 'typical', value ?? 0)} />
          <MoneyInput suffix="₽" value={rule.max} onCommit={(value) => setValue(rule.id, 'max', value ?? 0)} />
        </div>)}
      </div>
    </div>)}
    <p className="muted price-book-footnote">Запчасти дополнительно масштабируются под модель коэффициентом из карточки модели: работа считается одинаково, а комплектующие на Lacetti и Corolla стоят по-разному.</p>
  </div>;
}
