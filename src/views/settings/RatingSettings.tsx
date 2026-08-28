import { numberValue } from '../../utils';
import { RATING_WEIGHT_LABELS } from '../../domain/labels';
import type { AppConfig } from '../../types';

export function RatingSettings({ config, onUpdate }: { config: AppConfig; onUpdate: (updater: (config: AppConfig) => AppConfig) => void }) {
  return <div className="content-card full-width"><div className="section-heading compact-heading"><div><p className="eyebrow">ОБЩИЕ ПРАВИЛА</p><h2>Рейтинг</h2></div><span className="muted">Сумма весов автоматически нормализуется до 100 баллов.</span></div><div className="coefficient-grid">{(Object.keys(config.ratingWeights) as Array<keyof AppConfig['ratingWeights']>).map((key) => <label key={key}><span>{RATING_WEIGHT_LABELS[key]}</span><input type="number" min="0" value={config.ratingWeights[key]} onChange={(event) => onUpdate((current) => { current.ratingWeights[key] = numberValue(event.target.value); return current; })} /></label>)}</div></div>;
}
