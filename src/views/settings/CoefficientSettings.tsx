import { NumberInput } from '../../ui/NumberInput';
import type { AppConfig } from '../../types';

export function CoefficientSettings({ config, onUpdate }: { config: AppConfig; onUpdate: (updater: (config: AppConfig) => AppConfig) => void }) {
  return <div className="content-card full-width">
    <div className="section-heading compact-heading"><div><p className="eyebrow">ОБЩИЕ ПРАВИЛА</p><h2>Коэффициенты неопределённости</h2></div><span className="muted">K увеличивает безопасную стоимость и не является вероятностью.</span></div>
    <div className="coefficient-grid">{config.coefficients.map((rule) => <label key={rule.id}><span>{rule.label}</span><NumberInput step="0.01" min={1} value={rule.coefficient} onCommit={(value) => onUpdate((current) => { const target = current.coefficients.find((item) => item.id === rule.id); if (target) target.coefficient = value ?? 0; return current; })} /></label>)}</div>
  </div>;
}
