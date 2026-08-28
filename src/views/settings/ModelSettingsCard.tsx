import { useState } from 'react';
import { money, percent } from '../../utils';
import { categoryName } from '../../calc';
import { modelName } from '../../domain/vehicle';
import { MoneyInput, NumberInput } from '../../ui/NumberInput';
import { Field } from '../../ui/primitives';
import { EventEditor } from '../forecast/EventEditor';
import type { AppConfig, ModelId, ModelProfile, RepairEvent } from '../../types';

export function ModelSettingsCard({ model, config, onUpdateModel, onUpdateVariant, onAddVariant, onRemoveVariant, onAddEvent, onUpdateEvent, onRemoveEvent, onRemoveModel }: { model: ModelProfile; config: AppConfig; onUpdateModel: (modelId: ModelId, change: Partial<ModelProfile>) => void; onUpdateVariant: (modelId: ModelId, variantId: string, change: Partial<ModelProfile['engineVariants'][number]>) => void; onAddVariant: (modelId: ModelId) => void; onRemoveVariant: (modelId: ModelId, variantId: string) => void; onAddEvent: (modelId: ModelId) => void; onUpdateEvent: (eventId: string, change: Partial<RepairEvent>) => void; onRemoveEvent: (eventId: string) => void; onRemoveModel: (modelId: ModelId) => void }) {
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const events = config.repairEvents.filter((event) => event.modelIds.includes(model.id));
  return <article className="model-settings-card">
    <div className="model-settings-title"><div><span className="step-chip">{model.isBuiltIn ? 'БАЗОВАЯ МОДЕЛЬ' : 'ПОЛЬЗОВАТЕЛЬСКАЯ'}</span><h3>{modelName(config, model.id)}</h3><p>{model.generation || 'Поколение не указано'} · {model.engine || 'Двигатель не указан'} · {model.transmission || 'Коробка не указана'}</p></div>{!model.isBuiltIn && <button className="action-button danger-action" onClick={() => onRemoveModel(model.id)}>Удалить модель</button>}</div>
    <div className="form-grid two model-profile-fields">
      <Field label="Отображаемое название"><input value={model.displayName ?? ''} onChange={(event) => onUpdateModel(model.id, { displayName: event.target.value })} placeholder="Например: Honda Civic VII" /></Field>
      <Field label="Марка"><input value={model.make} onChange={(event) => onUpdateModel(model.id, { make: event.target.value })} placeholder="Марка" /></Field>
      <Field label="Модель"><input value={model.model} onChange={(event) => onUpdateModel(model.id, { model: event.target.value })} placeholder="Модель" /></Field>
      <Field label="Поколение"><input value={model.generation} onChange={(event) => onUpdateModel(model.id, { generation: event.target.value })} placeholder="Поколение" /></Field>
      <Field label="Двигатель по умолчанию"><input value={model.engine} onChange={(event) => onUpdateModel(model.id, { engine: event.target.value })} placeholder="1.6" /></Field>
      <Field label="Коробка"><input value={model.transmission} onChange={(event) => onUpdateModel(model.id, { transmission: event.target.value })} placeholder="AT" /></Field>
      <Field label="Расход, л/100 км"><NumberInput min={0} step="0.1" value={model.consumptionLPer100Km} onCommit={(value) => onUpdateModel(model.id, { consumptionLPer100Km: value ?? 0 })} /></Field>
      <Field label="Налог, ₽/год"><MoneyInput step={100} value={model.taxAnnual} onCommit={(value) => onUpdateModel(model.id, { taxAnnual: value ?? 0 })} /></Field>
    </div>
    <div className="engine-variant-list">
      <div className="section-heading compact-heading"><strong>Варианты двигателя и ГРМ</strong><button className="ghost-button compact-action" onClick={() => onAddVariant(model.id)}>＋ Добавить вариант</button></div>
      {model.engineVariants.map((variant) => <div className="variant-editor" key={variant.id}><Field label="Название"><input value={variant.label} onChange={(event) => onUpdateVariant(model.id, variant.id, { label: event.target.value })} /></Field><Field label="Код"><input value={variant.code} onChange={(event) => onUpdateVariant(model.id, variant.id, { code: event.target.value })} placeholder="Например, 3ZZ-FE" /></Field><Field label="ГРМ"><select value={variant.timingDrive} onChange={(event) => onUpdateVariant(model.id, variant.id, { timingDrive: event.target.value as ModelProfile['engineVariants'][number]['timingDrive'] })}><option value="CHAIN">Цепь</option><option value="BELT">Ремень</option><option value="UNKNOWN">Неизвестно</option></select></Field><button className="action-button danger-action" onClick={() => onRemoveVariant(model.id, variant.id)}>Удалить</button></div>)}
    </div>
    <div className="model-event-group">
      <div className="section-heading compact-heading"><div><p className="eyebrow">СОБЫТИЯ МОДЕЛИ</p><h3>Потенциальные работы</h3><p className="muted">P — вероятность за весь срок, K — запас к стоимости. Известный срок задаётся в месяцах.</p></div><button className="ghost-button compact-action" onClick={() => onAddEvent(model.id)}>＋ Добавить</button></div>
      <div className="event-settings">{events.length === 0 && <div className="subtle-empty">Событий нет. Добавьте только те работы, которые нужны для этой модели.</div>}{events.map((event) => <div key={event.id}><SettingsEventRow event={event} editing={editingEventId === event.id} onEdit={() => setEditingEventId(editingEventId === event.id ? null : event.id)} onRemove={() => onRemoveEvent(event.id)} />{editingEventId === event.id && <EventEditor event={event} allowMode onCancel={() => setEditingEventId(null)} onSave={(updated) => { onUpdateEvent(event.id, updated); setEditingEventId(null); }} />}</div>)}</div>
    </div>
  </article>;
}

export function SettingsEventRow({ event, editing, onEdit, onRemove }: { event: RepairEvent; editing: boolean; onEdit: () => void; onRemove: () => void }) {
  const timing = event.mode === 'SCHEDULED' ? `срок ${event.monthStart} мес.` : `окно ${event.monthStart}–${event.monthEnd} мес.`;
  return <div className="event-setting">
    <div className="event-setting-name"><strong>{event.name}</strong><small>{categoryName(event.category)} · {timing}</small></div>
    <div className="event-setting-facts">
      <span>{event.mode === 'SCHEDULED' ? 'Срок 100%' : `P ${percent(event.probability5y, 0)}`}</span>
      <span>{money(event.repairCost)}</span>
      <span>max {money(event.maxCost)}</span>
      <span>K {event.coefficient.toFixed(2)}</span>
    </div>
    <div className="event-setting-actions"><button className="action-button secondary-action" onClick={onEdit}>{editing ? 'Закрыть' : 'Изменить'}</button><button className="action-button danger-action" onClick={onRemove}>Удалить</button></div>
  </div>;
}
