import { useState } from 'react';
import type { FormEvent } from 'react';
import { CATEGORIES } from '../../config';
import { MoneyInput, NumberInput } from '../../ui/NumberInput';
import { Field } from '../../ui/primitives';
import type { CategoryId, RepairEvent } from '../../types';

export function EventEditor({ event, allowMode, onCancel, onSave }: { event: RepairEvent; allowMode: boolean; onCancel: () => void; onSave: (event: RepairEvent) => void }) {
  const [name, setName] = useState(event.name);
  const [category, setCategory] = useState<CategoryId>(event.category);
  const [mode, setMode] = useState<'RISK' | 'SCHEDULED'>(event.mode ?? 'RISK');
  const [probability, setProbability] = useState(Math.round(event.probability5y * 100));
  const [cost, setCost] = useState(event.repairCost);
  const [coefficient, setCoefficient] = useState(event.coefficient);
  const [maxCost, setMaxCost] = useState(event.maxCost);
  const [monthStart, setMonthStart] = useState(event.mode === 'SCHEDULED' ? event.scheduledMonth ?? event.monthStart : event.monthStart);
  const [monthEnd, setMonthEnd] = useState(event.monthEnd);
  const save = (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    const scheduledMonth = Math.max(1, Math.min(60, Math.round(monthStart)));
    if (!name.trim()) return;
    onSave({ ...event, name: name.trim(), category, mode, probability5y: mode === 'SCHEDULED' ? 1 : Math.min(100, Math.max(0, probability)) / 100, repairCost: Math.max(0, cost), coefficient: Math.max(0, coefficient), maxCost: Math.max(0, maxCost), monthStart: mode === 'SCHEDULED' ? scheduledMonth : Math.max(1, Math.round(monthStart)), monthEnd: mode === 'SCHEDULED' ? scheduledMonth : Math.max(Math.round(monthStart), Math.round(monthEnd)), scheduledMonth: mode === 'SCHEDULED' ? scheduledMonth : undefined });
  };
  return <form className="event-editor" onSubmit={save}>
    <div className="form-grid two">
      <Field label="Название работы"><input value={name} onChange={(input) => setName(input.target.value)} required /></Field>
      <Field label="Категория"><select value={category} onChange={(input) => setCategory(input.target.value as CategoryId)}>{CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
    </div>
    <div className="form-grid four">
      <Field label="Тип"><select disabled={!allowMode} value={mode} onChange={(input) => setMode(input.target.value as 'RISK' | 'SCHEDULED')}><option value="RISK">Вероятностное</option><option value="SCHEDULED">Известный срок</option></select></Field>
      {mode === 'RISK' ? <Field label="Вероятность, %"><NumberInput min={0} max={100} value={probability} onCommit={(value) => setProbability(value ?? 0)} /></Field> : <Field label="Через сколько месяцев"><NumberInput min={1} max={60} value={monthStart} onCommit={(value) => setMonthStart(value ?? 0)} /></Field>}
      <Field label="Стоимость, ₽"><MoneyInput value={cost} onCommit={(value) => setCost(value ?? 0)} /></Field>
      <Field label="Коэффициент K"><NumberInput min={0} step="0.01" value={coefficient} onCommit={(value) => setCoefficient(value ?? 0)} /></Field>
    </div>
    <div className="form-grid three">
      <Field label="Максимальная стоимость, ₽"><MoneyInput value={maxCost} onCommit={(value) => setMaxCost(value ?? 0)} /></Field>
      {mode === 'RISK' && <><Field label="Начало окна, мес."><NumberInput min={1} max={60} value={monthStart} onCommit={(value) => setMonthStart(value ?? 0)} /></Field><Field label="Конец окна, мес."><NumberInput min={1} max={60} value={monthEnd} onCommit={(value) => setMonthEnd(value ?? 0)} /></Field></>}
    </div>
    <div className="form-actions"><button type="button" className="ghost-button" onClick={onCancel}>Отмена</button><button type="submit" className="primary-button">Сохранить событие</button></div>
  </form>;
}
