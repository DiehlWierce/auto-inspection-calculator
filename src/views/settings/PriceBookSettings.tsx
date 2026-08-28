import { MoneyInput } from '../../ui/NumberInput';
import type { AppConfig } from '../../types';

export function PriceBookSettings({ config, onUpdate }: { config: AppConfig; onUpdate: (updater: (config: AppConfig) => AppConfig) => void }) {
  const setValue = (id: string, key: 'min' | 'typical' | 'max', value: number) => onUpdate((current) => { const target = current.priceBook.find((item) => item.id === id); if (target) target[key] = value; return current; });
  return <div className="content-card full-width">
    <div className="section-heading compact-heading"><div><p className="eyebrow">ОБЩИЕ ПРАВИЛА</p><h2>Справочник вилок цен</h2></div><span className="muted">Подставляется в факт без указанной стоимости: в смету — типовая, в безопасную — максимум.</span></div>
    <div className="price-book-grid">
      <div className="price-book-header"><span>Тип работ</span><span>Минимум</span><span>Типовая</span><span>Максимум</span></div>
      {config.priceBook.map((rule) => <div className="price-book-row" key={rule.id}>
        <span className="price-book-label">{rule.label}</span>
        <MoneyInput suffix="₽" value={rule.min} onCommit={(value) => setValue(rule.id, 'min', value ?? 0)} />
        <MoneyInput suffix="₽" value={rule.typical} onCommit={(value) => setValue(rule.id, 'typical', value ?? 0)} />
        <MoneyInput suffix="₽" value={rule.max} onCommit={(value) => setValue(rule.id, 'max', value ?? 0)} />
      </div>)}
    </div>
  </div>;
}
