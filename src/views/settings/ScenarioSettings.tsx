import { numberValue } from '../../utils';
import { Field } from '../../ui/primitives';
import type { AppConfig } from '../../types';

type ScenarioArrayKey = 'insuranceByYear' | 'serviceByYear' | 'fluidsByYear' | 'consumablesByYear' | 'tiresByYear' | 'washingByYear' | 'finesByYear';

export function ScenarioSettings({ config, onUpdate }: { config: AppConfig; onUpdate: (updater: (config: AppConfig) => AppConfig) => void }) {
  const setScenarioNumber = (key: 'annualKm' | 'fuelPrice' | 'annualLimit', value: number) => onUpdate((current) => { current.scenario[key] = value; return current; });
  const setArrayValue = (key: ScenarioArrayKey, index: number, value: number) => onUpdate((current) => { current.scenario[key][index] = value; return current; });
  const yearRows: Array<{ label: string; key: ScenarioArrayKey }> = [
    { label: 'ОСАГО', key: 'insuranceByYear' },
    { label: 'Плановое ТО', key: 'serviceByYear' },
    { label: 'Жидкости', key: 'fluidsByYear' },
    { label: 'Расходники', key: 'consumablesByYear' },
    { label: 'Резина', key: 'tiresByYear' },
    { label: 'Мойка', key: 'washingByYear' },
    { label: 'Штрафы', key: 'finesByYear' },
  ];
  return <div className="content-card">
    <div className="section-heading compact-heading"><div><p className="eyebrow">ОБЩИЕ ПРАВИЛА</p><h2>Сценарий эксплуатации</h2></div></div>
    <div className="form-grid three"><Field label="Лет"><input type="number" min="1" max="20" value={config.scenario.years} onChange={(event) => onUpdate((current) => { current.scenario.years = numberValue(event.target.value); return current; })} /></Field><Field label="Пробег в год, км"><input type="number" value={config.scenario.annualKm} onChange={(event) => setScenarioNumber('annualKm', numberValue(event.target.value))} /></Field><Field label="АИ-95, ₽/л"><input type="number" step="0.1" value={config.scenario.fuelPrice} onChange={(event) => setScenarioNumber('fuelPrice', numberValue(event.target.value))} /></Field></div>
    <div className="form-grid four"><Field label="Лимит в год, ₽"><input type="number" value={config.scenario.annualLimit} onChange={(event) => setScenarioNumber('annualLimit', numberValue(event.target.value))} /></Field><Field label="Крупный ремонт, ₽"><input type="number" value={config.majorRepairThreshold} onChange={(event) => onUpdate((current) => { current.majorRepairThreshold = numberValue(event.target.value); return current; })} /></Field><Field label="Крупных в год"><input type="number" value={config.majorRepairsPerYearLimit} onChange={(event) => onUpdate((current) => { current.majorRepairsPerYearLimit = numberValue(event.target.value); return current; })} /></Field><Field label="Интервал, мес."><input type="number" value={config.minMonthsBetweenMajorRepairs} onChange={(event) => onUpdate((current) => { current.minMonthsBetweenMajorRepairs = numberValue(event.target.value); return current; })} /></Field></div>
    <div className="year-inputs"><div className="year-header"><span>Расход</span>{Array.from({ length: Math.min(config.scenario.years, 5) }, (_, index) => <span key={index}>Год {index + 1}</span>)}</div>{yearRows.map((row) => <YearInput key={row.key} label={row.label} values={config.scenario[row.key]} onChange={(index, value) => setArrayValue(row.key, index, value)} />)}</div>
  </div>;
}

export function YearInput({ label, values, onChange }: { label: string; values: number[]; onChange: (index: number, value: number) => void }) {
  return <div className="year-row"><span>{label}</span>{values.slice(0, 5).map((value, index) => <input key={index} type="number" value={value} onChange={(event) => onChange(index, numberValue(event.target.value))} />)}</div>;
}
