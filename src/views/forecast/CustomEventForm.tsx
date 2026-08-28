import { useState } from 'react';
import type { FormEvent } from 'react';
import { CATEGORIES } from '../../config';
import { numberValue, uid } from '../../utils';
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
  return <form className="custom-event-form" onSubmit={submit}><div className="form-grid two"><Field label="Название работы"><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Например: замена радиатора печки" required /></Field><Field label="Категория"><select value={category} onChange={(event) => setCategory(event.target.value as CategoryId)}>{CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field></div><div className="form-grid three"><Field label="Тип события"><select value={mode} onChange={(event) => setMode(event.target.value as 'RISK' | 'SCHEDULED')}><option value="RISK">Вероятностное</option><option value="SCHEDULED">Известный срок</option></select></Field>{mode === 'RISK' ? <Field label="Вероятность, %"><input type="number" min="0" max="100" value={probability} onChange={(event) => setProbability(numberValue(event.target.value))} /></Field> : <Field label="Через сколько месяцев"><input type="number" min="1" max="60" value={month} onChange={(event) => setMonth(numberValue(event.target.value))} /></Field>}<Field label="Стоимость, ₽"><input type="number" min="1" value={cost} onChange={(event) => setCost(numberValue(event.target.value))} /></Field></div><div className="form-grid two"><Field label="Коэффициент K"><input type="number" min="1" step="0.01" value={coefficient} onChange={(event) => setCoefficient(numberValue(event.target.value))} /></Field><Field label="Максимальная стоимость, ₽"><input type="number" min="0" value={maxCost} onChange={(event) => setMaxCost(numberValue(event.target.value))} /></Field></div><div className="form-actions"><button type="button" className="ghost-button" onClick={onCancel}>Отмена</button><button type="submit" className="primary-button">Добавить в прогноз</button></div></form>;
}
