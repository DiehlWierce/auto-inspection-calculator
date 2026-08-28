import { useState } from 'react';
import { uid } from '../../utils';
import { CLASSIC_INSPECTION_LAYOUT } from '../../inspectionTemplates';
import { makeCustomEvent, makeCustomModel } from '../../domain/factory';
import { cloneLayout } from '../../domain/layout';
import { modelName } from '../../domain/vehicle';
import { BudgetSettings } from './BudgetSettings';
import { CoefficientSettings } from './CoefficientSettings';
import { ModelSettingsCard } from './ModelSettingsCard';
import { PriceBookSettings } from './PriceBookSettings';
import { RatingSettings } from './RatingSettings';
import { ScenarioSettings } from './ScenarioSettings';
import { TemplateEditorPanel } from './TemplateEditorPanel';
import type { AppConfig, Inspection, InspectionTemplate, ModelId, ModelProfile, RepairEvent } from '../../types';

export function SettingsView({ config, active, onUpdate, onApplyActive }: { config: AppConfig; active: Inspection | null; onUpdate: (updater: (config: AppConfig) => AppConfig) => void; onApplyActive: () => void }) {
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const updateModel = (modelId: ModelId, change: Partial<ModelProfile>) => onUpdate((current) => { const model = current.models.find((item) => item.id === modelId); if (model) Object.assign(model, change); return current; });
  const updateVariant = (modelId: ModelId, variantId: string, change: Partial<ModelProfile['engineVariants'][number]>) => onUpdate((current) => { const model = current.models.find((item) => item.id === modelId); const variant = model?.engineVariants.find((item) => item.id === variantId); if (variant) Object.assign(variant, change); return current; });
  const addVariant = (modelId: ModelId) => onUpdate((current) => { const model = current.models.find((item) => item.id === modelId); if (model) model.engineVariants.push({ id: `variant-${uid()}`, label: 'Новый вариант двигателя', code: '', timingDrive: 'UNKNOWN' }); return current; });
  const removeVariant = (modelId: ModelId, variantId: string) => onUpdate((current) => { const model = current.models.find((item) => item.id === modelId); if (model && model.engineVariants.length > 1) model.engineVariants = model.engineVariants.filter((item) => item.id !== variantId); return current; });
  const updateEvent = (eventId: string, change: Partial<RepairEvent>) => onUpdate((current) => { const event = current.repairEvents.find((item) => item.id === eventId); if (event) Object.assign(event, change); return current; });
  const addEvent = (modelId: ModelId) => onUpdate((current) => { const event = makeCustomEvent(modelId); current.repairEvents.push(event); const model = current.models.find((item) => item.id === modelId); if (model) model.repairEventIds = [...model.repairEventIds, event.id]; return current; });
  const removeEvent = (eventId: string) => { if (!window.confirm('Удалить потенциальное событие из каталога?')) return; onUpdate((current) => { current.repairEvents = current.repairEvents.filter((event) => event.id !== eventId); current.models.forEach((model) => { model.repairEventIds = model.repairEventIds.filter((id) => id !== eventId); }); return current; }); };
  const addModel = () => onUpdate((current) => { current.models.push(makeCustomModel()); return current; });
  const removeModel = (modelId: ModelId) => { if (!window.confirm('Удалить пользовательскую модель и её события из каталога?')) return; onUpdate((current) => { current.models = current.models.filter((model) => model.id !== modelId); current.repairEvents = current.repairEvents.filter((event) => !event.modelIds.includes(modelId)); current.templates = current.templates.map((template) => ({ ...template, modelIds: template.modelIds.filter((id) => id !== modelId) })).filter((template) => template.modelIds.length > 0); return current; }); };
  const startTemplateEdit = (template: InspectionTemplate) => {
    if (!template.isBuiltIn) { setEditingTemplateId(template.id); return; }
    const copy: InspectionTemplate = { ...template, id: `custom-template-${uid()}`, name: `${template.name} · мой вариант`, modelIds: [...template.modelIds], engineVariantIds: template.engineVariantIds ? [...template.engineVariantIds] : undefined, layout: cloneLayout(template.layout), isBuiltIn: false };
    onUpdate((current) => { current.templates.push(copy); return current; });
    setEditingTemplateId(copy.id);
  };
  const addTemplate = () => {
    const source = config.templates[0];
    const template: InspectionTemplate = { id: `custom-template-${uid()}`, name: 'Новый шаблон осмотра', description: 'Пользовательский набор этапов, подблоков и элементов.', modelIds: [config.models[0]?.id ?? ''], layout: cloneLayout(source?.layout ?? CLASSIC_INSPECTION_LAYOUT), isBuiltIn: false };
    onUpdate((current) => { current.templates.push(template); return current; });
    setEditingTemplateId(template.id);
  };
  const saveTemplate = (template: InspectionTemplate) => { onUpdate((current) => { current.templates = current.templates.map((item) => item.id === template.id ? template : item); return current; }); setEditingTemplateId(null); };
  const deleteTemplate = (templateId: string) => { if (!window.confirm('Удалить пользовательский шаблон?')) return; onUpdate((current) => { current.templates = current.templates.filter((template) => template.id !== templateId); return current; }); setEditingTemplateId(null); };
  return <section className="page-section settings-page">
    <div className="page-heading"><div><p className="eyebrow">КОНФИГУРАЦИЯ</p><h1>Настройки каталога</h1><p className="muted">Базовые автомобили, пользовательские модели, потенциальные работы и шаблоны собраны по отдельным группам.</p></div>{active && <button className="primary-button" onClick={onApplyActive}>Применить к текущему осмотру</button>}</div>
    <div className="info-strip"><span className="info-icon">i</span><span>Изменения применяются к новым осмотрам. Уже созданный осмотр хранит собственный снимок конфигурации до явного применения текущих настроек.</span></div>
    <div className="settings-grid"><BudgetSettings config={config} onUpdate={onUpdate} /><ScenarioSettings config={config} onUpdate={onUpdate} /></div>
    <div className="content-card full-width"><div className="section-heading compact-heading"><div><p className="eyebrow">КАТАЛОГ АВТОМОБИЛЕЙ</p><h2>Модели и конфигурации</h2><p className="muted">Базовые три модели можно уточнять; свои модели добавляются в этот же каталог и доступны при старте осмотра.</p></div><button className="primary-button" onClick={addModel}>＋ Добавить модель</button></div><div className="model-settings-groups">{config.models.map((model) => <ModelSettingsCard key={model.id} model={model} config={config} onUpdateModel={updateModel} onUpdateVariant={updateVariant} onAddVariant={addVariant} onRemoveVariant={removeVariant} onAddEvent={addEvent} onUpdateEvent={updateEvent} onRemoveEvent={removeEvent} onRemoveModel={removeModel} />)}</div></div>
    <div className="content-card full-width"><div className="section-heading compact-heading"><div><p className="eyebrow">ШАБЛОНЫ ОСМОТРА</p><h2>Наборы этапов и элементов</h2><p className="muted">Классические шаблоны и варианты под конкретный двигатель уже добавлены. Пользовательские шаблоны можно собрать из любого набора.</p></div><button className="primary-button" onClick={addTemplate}>＋ Создать шаблон</button></div>{editingTemplateId && <TemplateEditorPanel template={config.templates.find((item) => item.id === editingTemplateId) ?? config.templates[0]} config={config} onSave={saveTemplate} onCancel={() => setEditingTemplateId(null)} />}{!editingTemplateId && <div className="template-library">{config.templates.map((template) => <article className="template-card" key={template.id}><div><span className="step-chip">{template.isBuiltIn ? 'БАЗОВЫЙ' : 'МОЙ ШАБЛОН'}</span><h3>{template.name}</h3><p>{template.description}</p><small>{template.modelIds.map((id) => modelName(config, id)).join(' · ')} · {template.layout.length} этапов</small></div><div className="button-row"><button className="ghost-button compact-action" onClick={() => startTemplateEdit(template)}>{template.isBuiltIn ? 'Дублировать и изменить' : 'Изменить'}</button>{!template.isBuiltIn && <button className="action-button danger-action" onClick={() => deleteTemplate(template.id)}>Удалить</button>}</div></article>)}</div>}</div>
    <PriceBookSettings config={config} onUpdate={onUpdate} />
    <RatingSettings config={config} onUpdate={onUpdate} />
    <CoefficientSettings config={config} onUpdate={onUpdate} />
  </section>;
}
