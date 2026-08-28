import { MoneyInput, NumberInput } from '../../ui/NumberInput';
import { Field } from '../../ui/primitives';
import type { AppConfig } from '../../types';

type ScenarioArrayKey = 'insuranceByYear' | 'serviceByYear' | 'fluidsByYear' | 'consumablesByYear' | 'tiresByYear' | 'washingByYear' | 'finesByYear';

const YEAR_ROWS: Array<{ label: string; key: ScenarioArrayKey }> = [
  { label: 'ОСАГО', key: 'insuranceByYear' },
  { label: 'Плановое ТО', key: 'serviceByYear' },
  { label: 'Жидкости', key: 'fluidsByYear' },
  { label: 'Расходники', key: 'consumablesByYear' },
  { label: 'Резина', key: 'tiresByYear' },
  { label: 'Мойка', key: 'washingByYear' },
  { label: 'Штрафы', key: 'finesByYear' },
];

export function ScenarioSettings({ config, onUpdate }: { config: AppConfig; onUpdate: (updater: (config: AppConfig) => AppConfig) => void }) {
  const setScenarioNumber = (key: 'annualKm' | 'fuelPrice' | 'annualLimit', value: number) => onUpdate((current) => { current.scenario[key] = value; return current; });
  const setArrayValue = (key: ScenarioArrayKey, index: number, value: number) => onUpdate((current) => { current.scenario[key][index] = value; return current; });
  return <div className="content-card">
    <div className="section-heading compact-heading"><div><p className="eyebrow">ОБЩИЕ ПРАВИЛА</p><h2>Сценарий эксплуатации</h2></div></div>
    <div className="form-grid three">
      <Field label="Лет"><NumberInput min={1} max={20} value={config.scenario.years} onCommit={(value) => onUpdate((current) => { current.scenario.years = value ?? 0; return current; })} /></Field>
      <Field label="Пробег в год, км"><NumberInput min={0} step={1000} value={config.scenario.annualKm} onCommit={(value) => setScenarioNumber('annualKm', value ?? 0)} /></Field>
      <Field label="АИ-95, ₽/л"><NumberInput min={0} step="0.1" value={config.scenario.fuelPrice} onCommit={(value) => setScenarioNumber('fuelPrice', value ?? 0)} /></Field>
    </div>
    <div className="form-grid four">
      <Field label="Лимит в год, ₽"><MoneyInput value={config.scenario.annualLimit} onCommit={(value) => setScenarioNumber('annualLimit', value ?? 0)} /></Field>
      <Field label="Крупный ремонт, ₽"><MoneyInput value={config.majorRepairThreshold} onCommit={(value) => onUpdate((current) => { current.majorRepairThreshold = value ?? 0; return current; })} /></Field>
      <Field label="Критический, ₽"><MoneyInput value={config.criticalRepairThreshold} onCommit={(value) => onUpdate((current) => { current.criticalRepairThreshold = value ?? 0; return current; })} /></Field>
      <Field label="Крупных в год"><NumberInput min={0} value={config.majorRepairsPerYearLimit} onCommit={(value) => onUpdate((current) => { current.majorRepairsPerYearLimit = value ?? 0; return current; })} /></Field>
    </div>
    <div className="form-grid two">
      <Field label="Интервал между крупными, мес."><NumberInput min={1} value={config.minMonthsBetweenMajorRepairs} onCommit={(value) => onUpdate((current) => { current.minMonthsBetweenMajorRepairs = value ?? 0; return current; })} /></Field>
      <Field label="Сценариев симуляции" hint="Только риск-метрики"><NumberInput min={500} step={500} value={config.simulationScenarios} onCommit={(value) => onUpdate((current) => { current.simulationScenarios = value ?? 0; return current; })} /></Field>
    </div>
    <div className="year-inputs">
      <div className="year-header"><span>Расход</span>{Array.from({ length: Math.min(config.scenario.years, 5) }, (_, index) => <span key={index}>Год {index + 1}</span>)}</div>
      {YEAR_ROWS.map((row) => <YearInput key={row.key} label={row.label} values={config.scenario[row.key]} onChange={(index, value) => setArrayValue(row.key, index, value)} />)}
    </div>
  </div>;
}

export function YearInput({ label, values, onChange }: { label: string; values: number[]; onChange: (index: number, value: number) => void }) {
  return <div className="year-row"><span>{label}</span>{values.slice(0, 5).map((value, index) => <MoneyInput key={index} value={value} onCommit={(next) => onChange(index, next ?? 0)} />)}</div>;
}
