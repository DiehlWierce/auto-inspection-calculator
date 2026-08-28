import { MoneyInput, PercentInput } from '../../ui/NumberInput';
import { Field } from '../../ui/primitives';
import type { AppConfig } from '../../types';

export function BudgetSettings({ config, onUpdate }: { config: AppConfig; onUpdate: (updater: (config: AppConfig) => AppConfig) => void }) {
  return <div className="content-card">
    <div className="section-heading compact-heading"><div><p className="eyebrow">ОБЩИЕ ПРАВИЛА</p><h2>Бюджет</h2></div></div>
    <div className="form-grid three">
      <Field label="Общий фонд, ₽"><MoneyInput value={config.fund} onCommit={(value) => onUpdate((current) => { current.fund = value ?? 0; return current; })} /></Field>
      <Field label="Макс. объявления, ₽"><MoneyInput value={config.maxAskingPrice} onCommit={(value) => onUpdate((current) => { current.maxAskingPrice = value ?? 0; return current; })} /></Field>
      <Field label="Целевая цена, ₽"><MoneyInput value={config.targetPurchasePrice} onCommit={(value) => onUpdate((current) => { current.targetPurchasePrice = value ?? 0; return current; })} /></Field>
    </div>
    <div className="form-grid two">
      <Field label="Зелёная зона, %"><PercentInput value={config.greenReserveRatio} onCommit={(value) => onUpdate((current) => { current.greenReserveRatio = value; return current; })} /></Field>
      <Field label="Жёлтая зона, %"><PercentInput value={config.yellowReserveRatio} onCommit={(value) => onUpdate((current) => { current.yellowReserveRatio = value; return current; })} /></Field>
    </div>
  </div>;
}
