import { useState } from 'react';
import type { FormEvent } from 'react';
import { CATEGORIES } from '../../config';
import { uid } from '../../utils';
import { MoneyInput, NumberInput } from '../../ui/NumberInput';
import { Field } from '../../ui/primitives';
import type { CategoryId, ModelId, RepairEvent } from '../../types';

export function CustomEventForm({ modelId, onCancel, onAdd }: { modelId: ModelId; onCancel: () => void; onAdd: (event: RepairEvent) => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<CategoryId>('other');
  const [mode, setMode] = useState<'RISK' | 'SCHEDULED'>('RISK');
  const [probability, setProbability] = useState(50);
  const [month, setMonth] = useState(4);
  const [cost, setCost] = useState(20000);
  const [coefficient, setCoefficient] = useState(1.2);
  const [maxCost, setMaxCost] = useState(30000);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || cost <= 0) return;
    onAdd({ id: `custom-${uid()}`, modelIds: [modelId], category, name: name.trim(), probability5y: mode === 'SCHEDULED' ? 1 : Math.min(100, Math.max(0, probability)) / 100, repairCost: cost, coefficient, maxCost, monthStart: mode === 'SCHEDULED' ? month : 1, monthEnd: mode === 'SCHEDULED' ? month : 60, mode, scheduledMonth: mode === 'SCHEDULED' ? month : undefined });
  };
  return <form className="custom-event-form" onSubmit={submit}><div className="form-grid two"><Field label="Название работы"><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Например: замена радиатора печки" required /></Field><Field label="Категория"><select value={category} onChange={(event) => setCategory(event.target.value as CategoryId)}>{CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field></div><div className="form-grid three"><Field label="Тип события"><select value={mode} onChange={(event) => setMode(event.target.value as 'RISK' | 'SCHEDULED')}><option value="RISK">Вероятностное</option><option value="SCHEDULED">Известный срок</option></select></Field>{mode === 'RISK' ? <Field label="Вероятность, %"><NumberInput min={0} max={100} value={probability} onCommit={(value) => setProbability(value ?? 0)} /></Field> : <Field label="Через сколько месяцев"><NumberInput min={1} max={60} value={month} onCommit={(value) => setMonth(value ?? 0)} /></Field>}<Field label="Стоимость, ₽"><MoneyInput value={cost} onCommit={(value) => setCost(value ?? 0)} /></Field></div><div className="form-grid two"><Field label="Коэффициент K"><NumberInput min={1} step="0.01" value={coefficient} onCommit={(value) => setCoefficient(value ?? 0)} /></Field><Field label="Максимальная стоимость, ₽"><MoneyInput value={maxCost} onCommit={(value) => setMaxCost(value ?? 0)} /></Field></div><div className="form-actions"><button type="button" className="ghost-button" onClick={onCancel}>Отмена</button><button type="submit" className="primary-button">Добавить в прогноз</button></div></form>;
}
