import { useState } from 'react';
import type { FormEvent } from 'react';
import { CATEGORIES } from '../../config';
import { numberValue } from '../../utils';
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
      {mode === 'RISK' ? <Field label="Вероятность, %"><input type="number" min="0" max="100" value={probability} onChange={(input) => setProbability(numberValue(input.target.value))} /></Field> : <Field label="Через сколько месяцев"><input type="number" min="1" max="60" value={monthStart} onChange={(input) => setMonthStart(numberValue(input.target.value))} /></Field>}
      <Field label="Стоимость, ₽"><input type="number" min="0" value={cost} onChange={(input) => setCost(numberValue(input.target.value))} /></Field>
      <Field label="Коэффициент K"><input type="number" min="0" step="0.01" value={coefficient} onChange={(input) => setCoefficient(numberValue(input.target.value))} /></Field>
    </div>
    <div className="form-grid three">
      <Field label="Максимальная стоимость, ₽"><input type="number" min="0" value={maxCost} onChange={(input) => setMaxCost(numberValue(input.target.value))} /></Field>
      {mode === 'RISK' && <><Field label="Начало окна, мес."><input type="number" min="1" max="60" value={monthStart} onChange={(input) => setMonthStart(numberValue(input.target.value))} /></Field><Field label="Конец окна, мес."><input type="number" min="1" max="60" value={monthEnd} onChange={(input) => setMonthEnd(numberValue(input.target.value))} /></Field></>}
    </div>
    <div className="form-actions"><button type="button" className="ghost-button" onClick={onCancel}>Отмена</button><button type="submit" className="primary-button">Сохранить событие</button></div>
  </form>;
}
