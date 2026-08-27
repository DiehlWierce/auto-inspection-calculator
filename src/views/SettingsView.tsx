import { useState } from 'react';
import { CLASSIC_INSPECTION_LAYOUT } from '../inspectionTemplates';
import { confirmAction } from '../ui/confirm';
import { numberValue, uid } from '../utils';
import { RATING_WEIGHT_LABELS } from '../labels';
import { cloneLayout, modelName } from '../domain/inspection';
import { Field, YearInput } from '../components/primitives';
import { ModelSettingsCard } from './settings/ModelSettingsCard';
import { TemplateEditorPanel } from './settings/TemplateEditorPanel';
import type { AppConfig, Inspection, InspectionTemplate, ModelId, ModelProfile, RepairEvent } from '../types';

export function makeCustomModel(): ModelProfile {
  return {
    id: `custom-model-${uid()}`,
    displayName: 'Новая модель',
    isBuiltIn: false,
    make: '',
    model: '',
    generation: '',
    engine: '',
    transmission: 'AT',
    engineVariants: [
      {
        id: `variant-${uid()}`,
        label: 'Вариант двигателя',
        code: '',
        timingDrive: 'UNKNOWN',
        note: 'Уточните код двигателя и тип привода ГРМ.',
      },
    ],
    consumptionLPer100Km: 9,
    taxAnnual: 2400,
  };
}

export function makeCustomEvent(modelId: ModelId): RepairEvent {
  return {
    id: `custom-event-${uid()}`,
    modelIds: [modelId],
    category: 'other',
    name: 'Новая потенциальная работа',
    probability5y: 0.5,
    repairCost: 20000,
    coefficient: 1.2,
    maxCost: 30000,
    monthStart: 1,
    monthEnd: 60,
    mode: 'RISK',
  };
}

export function SettingsView({
  config,
  active,
  onUpdate,
  onApplyActive,
}: {
  config: AppConfig;
  active: Inspection | null;
  onUpdate: (updater: (config: AppConfig) => AppConfig) => void;
  onApplyActive: () => void;
}) {
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const setScenarioNumber = (key: 'annualKm' | 'fuelPrice' | 'annualLimit', value: number) =>
    onUpdate((current) => {
      current.scenario[key] = value;
      return current;
    });
  const setArrayValue = (
    key:
      | 'insuranceByYear'
      | 'serviceByYear'
      | 'fluidsByYear'
      | 'consumablesByYear'
      | 'tiresByYear'
      | 'washingByYear'
      | 'finesByYear',
    index: number,
    value: number,
  ) =>
    onUpdate((current) => {
      current.scenario[key][index] = value;
      return current;
    });
  const updateModel = (modelId: ModelId, change: Partial<ModelProfile>) =>
    onUpdate((current) => {
      const model = current.models.find((item) => item.id === modelId);
      if (model) Object.assign(model, change);
      return current;
    });
  const updateVariant = (
    modelId: ModelId,
    variantId: string,
    change: Partial<ModelProfile['engineVariants'][number]>,
  ) =>
    onUpdate((current) => {
      const model = current.models.find((item) => item.id === modelId);
      const variant = model?.engineVariants.find((item) => item.id === variantId);
      if (variant) Object.assign(variant, change);
      return current;
    });
  const addVariant = (modelId: ModelId) =>
    onUpdate((current) => {
      const model = current.models.find((item) => item.id === modelId);
      if (model)
        model.engineVariants.push({
          id: `variant-${uid()}`,
          label: 'Новый вариант двигателя',
          code: '',
          timingDrive: 'UNKNOWN',
        });
      return current;
    });
  const removeVariant = (modelId: ModelId, variantId: string) =>
    onUpdate((current) => {
      const model = current.models.find((item) => item.id === modelId);
      if (model && model.engineVariants.length > 1)
        model.engineVariants = model.engineVariants.filter((item) => item.id !== variantId);
      return current;
    });
  const updateEvent = (eventId: string, change: Partial<RepairEvent>) =>
    onUpdate((current) => {
      const event = current.repairEvents.find((item) => item.id === eventId);
      if (event) Object.assign(event, change);
      return current;
    });
  const addEvent = (modelId: ModelId) =>
    onUpdate((current) => {
      current.repairEvents.push(makeCustomEvent(modelId));
      return current;
    });
  const removeEvent = async (eventId: string) => {
    if (!(await confirmAction('Удалить потенциальное событие из каталога?'))) return;
    onUpdate((current) => {
      current.repairEvents = current.repairEvents.filter((event) => event.id !== eventId);
      return current;
    });
  };
  const addModel = () =>
    onUpdate((current) => {
      current.models.push(makeCustomModel());
      return current;
    });
  const removeModel = async (modelId: ModelId) => {
    const confirmed = await confirmAction({
      message: 'Удалить пользовательскую модель?',
      detail: 'Вместе с ней из каталога удалятся её события ремонта.',
    });
    if (!confirmed) return;
    onUpdate((current) => {
      current.models = current.models.filter((model) => model.id !== modelId);
      current.repairEvents = current.repairEvents.filter((event) => !event.modelIds.includes(modelId));
      current.templates = current.templates
        .map((template) => ({ ...template, modelIds: template.modelIds.filter((id) => id !== modelId) }))
        .filter((template) => template.modelIds.length > 0);
      return current;
    });
  };
  const startTemplateEdit = (template: InspectionTemplate) => {
    if (!template.isBuiltIn) {
      setEditingTemplateId(template.id);
      return;
    }
    const copy: InspectionTemplate = {
      ...template,
      id: `custom-template-${uid()}`,
      name: `${template.name} · мой вариант`,
      modelIds: [...template.modelIds],
      engineVariantIds: template.engineVariantIds ? [...template.engineVariantIds] : undefined,
      layout: cloneLayout(template.layout),
      isBuiltIn: false,
    };
    onUpdate((current) => {
      current.templates.push(copy);
      return current;
    });
    setEditingTemplateId(copy.id);
  };
  const addTemplate = () => {
    const source = config.templates[0];
    const template: InspectionTemplate = {
      id: `custom-template-${uid()}`,
      name: 'Новый шаблон осмотра',
      description: 'Пользовательский набор этапов, подблоков и элементов.',
      modelIds: [config.models[0]?.id ?? ''],
      layout: cloneLayout(source?.layout ?? CLASSIC_INSPECTION_LAYOUT),
      isBuiltIn: false,
    };
    onUpdate((current) => {
      current.templates.push(template);
      return current;
    });
    setEditingTemplateId(template.id);
  };
  const saveTemplate = (template: InspectionTemplate) => {
    onUpdate((current) => {
      current.templates = current.templates.map((item) => (item.id === template.id ? template : item));
      return current;
    });
    setEditingTemplateId(null);
  };
  const deleteTemplate = async (templateId: string) => {
    if (!(await confirmAction('Удалить пользовательский шаблон?'))) return;
    onUpdate((current) => {
      current.templates = current.templates.filter((template) => template.id !== templateId);
      return current;
    });
    setEditingTemplateId(null);
  };
  return (
    <section className="page-section settings-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">КОНФИГУРАЦИЯ</p>
          <h1>Настройки каталога</h1>
          <p className="muted">
            Базовые автомобили, пользовательские модели, потенциальные работы и шаблоны собраны по отдельным группам.
          </p>
        </div>
        {active && (
          <button type="button" className="primary-button" onClick={onApplyActive}>
            Применить к текущему осмотру
          </button>
        )}
      </div>
      <div className="info-strip">
        <span className="info-icon">i</span>
        <span>
          Изменения применяются к новым осмотрам. Уже созданный осмотр хранит собственный снимок конфигурации до явного
          применения текущих настроек.
        </span>
      </div>
      <div className="settings-grid">
        <div className="content-card">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">ОБЩИЕ ПРАВИЛА</p>
              <h2>Бюджет</h2>
            </div>
          </div>
          <div className="form-grid three">
            <Field label="Общий фонд, ₽">
              <input
                type="number"
                min="0"
                value={config.fund}
                onChange={(event) =>
                  onUpdate((current) => {
                    current.fund = numberValue(event.target.value);
                    return current;
                  })
                }
              />
            </Field>
            <Field label="Макс. объявления, ₽">
              <input
                type="number"
                min="0"
                value={config.maxAskingPrice}
                onChange={(event) =>
                  onUpdate((current) => {
                    current.maxAskingPrice = numberValue(event.target.value);
                    return current;
                  })
                }
              />
            </Field>
            <Field label="Целевая цена, ₽">
              <input
                type="number"
                min="0"
                value={config.targetPurchasePrice}
                onChange={(event) =>
                  onUpdate((current) => {
                    current.targetPurchasePrice = numberValue(event.target.value);
                    return current;
                  })
                }
              />
            </Field>
          </div>
          <div className="form-grid two">
            <Field label="Зелёная зона, %">
              <input
                type="number"
                min="0"
                value={config.greenReserveRatio * 100}
                onChange={(event) =>
                  onUpdate((current) => {
                    current.greenReserveRatio = numberValue(event.target.value) / 100;
                    return current;
                  })
                }
              />
            </Field>
            <Field label="Жёлтая зона, %">
              <input
                type="number"
                min="0"
                value={config.yellowReserveRatio * 100}
                onChange={(event) =>
                  onUpdate((current) => {
                    current.yellowReserveRatio = numberValue(event.target.value) / 100;
                    return current;
                  })
                }
              />
            </Field>
          </div>
        </div>
        <div className="content-card">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">ОБЩИЕ ПРАВИЛА</p>
              <h2>Сценарий эксплуатации</h2>
            </div>
          </div>
          <div className="form-grid three">
            <Field label="Лет">
              <input
                type="number"
                min="1"
                max="20"
                value={config.scenario.years}
                onChange={(event) =>
                  onUpdate((current) => {
                    current.scenario.years = numberValue(event.target.value);
                    return current;
                  })
                }
              />
            </Field>
            <Field label="Пробег в год, км">
              <input
                type="number"
                min="0"
                value={config.scenario.annualKm}
                onChange={(event) => setScenarioNumber('annualKm', numberValue(event.target.value))}
              />
            </Field>
            <Field label="АИ-95, ₽/л">
              <input
                type="number"
                min="0"
                step="0.1"
                value={config.scenario.fuelPrice}
                onChange={(event) => setScenarioNumber('fuelPrice', numberValue(event.target.value))}
              />
            </Field>
          </div>
          <div className="form-grid four">
            <Field label="Лимит в год, ₽">
              <input
                type="number"
                min="0"
                value={config.scenario.annualLimit}
                onChange={(event) => setScenarioNumber('annualLimit', numberValue(event.target.value))}
              />
            </Field>
            <Field label="Крупный ремонт, ₽">
              <input
                type="number"
                min="0"
                value={config.majorRepairThreshold}
                onChange={(event) =>
                  onUpdate((current) => {
                    current.majorRepairThreshold = numberValue(event.target.value);
                    return current;
                  })
                }
              />
            </Field>
            <Field label="Крупных в год">
              <input
                type="number"
                min="0"
                value={config.majorRepairsPerYearLimit}
                onChange={(event) =>
                  onUpdate((current) => {
                    current.majorRepairsPerYearLimit = numberValue(event.target.value);
                    return current;
                  })
                }
              />
            </Field>
            <Field label="Интервал, мес.">
              <input
                type="number"
                min="0"
                value={config.minMonthsBetweenMajorRepairs}
                onChange={(event) =>
                  onUpdate((current) => {
                    current.minMonthsBetweenMajorRepairs = numberValue(event.target.value);
                    return current;
                  })
                }
              />
            </Field>
          </div>
          <div className="year-inputs">
            <div className="year-header">
              <span>Расход</span>
              {Array.from({ length: Math.min(config.scenario.years, 5) }, (_, index) => (
                <span key={index}>Год {index + 1}</span>
              ))}
            </div>
            <YearInput
              label="ОСАГО"
              values={config.scenario.insuranceByYear}
              onChange={(index, value) => setArrayValue('insuranceByYear', index, value)}
            />
            <YearInput
              label="Плановое ТО"
              values={config.scenario.serviceByYear}
              onChange={(index, value) => setArrayValue('serviceByYear', index, value)}
            />
            <YearInput
              label="Жидкости"
              values={config.scenario.fluidsByYear}
              onChange={(index, value) => setArrayValue('fluidsByYear', index, value)}
            />
            <YearInput
              label="Расходники"
              values={config.scenario.consumablesByYear}
              onChange={(index, value) => setArrayValue('consumablesByYear', index, value)}
            />
            <YearInput
              label="Резина"
              values={config.scenario.tiresByYear}
              onChange={(index, value) => setArrayValue('tiresByYear', index, value)}
            />
            <YearInput
              label="Мойка"
              values={config.scenario.washingByYear}
              onChange={(index, value) => setArrayValue('washingByYear', index, value)}
            />
            <YearInput
              label="Штрафы"
              values={config.scenario.finesByYear}
              onChange={(index, value) => setArrayValue('finesByYear', index, value)}
            />
          </div>
        </div>
      </div>
      <div className="content-card full-width">
        <div className="section-heading compact-heading">
          <div>
            <p className="eyebrow">КАТАЛОГ АВТОМОБИЛЕЙ</p>
            <h2>Модели и конфигурации</h2>
            <p className="muted">
              Базовые три модели можно уточнять; свои модели добавляются в этот же каталог и доступны при старте
              осмотра.
            </p>
          </div>
          <button type="button" className="primary-button" onClick={addModel}>
            ＋ Добавить модель
          </button>
        </div>
        <div className="model-settings-groups">
          {config.models.map((model) => (
            <ModelSettingsCard
              key={model.id}
              model={model}
              config={config}
              onUpdateModel={updateModel}
              onUpdateVariant={updateVariant}
              onAddVariant={addVariant}
              onRemoveVariant={removeVariant}
              onAddEvent={addEvent}
              onUpdateEvent={updateEvent}
              onRemoveEvent={(eventId) => void removeEvent(eventId)}
              onRemoveModel={(modelId) => void removeModel(modelId)}
            />
          ))}
        </div>
      </div>
      <div className="content-card full-width">
        <div className="section-heading compact-heading">
          <div>
            <p className="eyebrow">ШАБЛОНЫ ОСМОТРА</p>
            <h2>Наборы этапов и элементов</h2>
            <p className="muted">
              Классические шаблоны и варианты под конкретный двигатель уже добавлены. Пользовательские шаблоны можно
              собрать из любого набора.
            </p>
          </div>
          <button type="button" className="primary-button" onClick={addTemplate}>
            ＋ Создать шаблон
          </button>
        </div>
        {editingTemplateId && (
          <TemplateEditorPanel
            template={config.templates.find((item) => item.id === editingTemplateId) ?? config.templates[0]}
            config={config}
            onSave={saveTemplate}
            onCancel={() => setEditingTemplateId(null)}
          />
        )}
        {!editingTemplateId && (
          <div className="template-library">
            {config.templates.map((template) => (
              <article className="template-card" key={template.id}>
                <div>
                  <span className="step-chip">{template.isBuiltIn ? 'БАЗОВЫЙ' : 'МОЙ ШАБЛОН'}</span>
                  <h3>{template.name}</h3>
                  <p>{template.description}</p>
                  <small>
                    {template.modelIds.map((id) => modelName(config, id)).join(' · ')} · {template.layout.length} этапов
                  </small>
                </div>
                <div className="button-row">
                  <button
                    type="button"
                    className="ghost-button compact-action"
                    onClick={() => startTemplateEdit(template)}
                  >
                    {template.isBuiltIn ? 'Дублировать и изменить' : 'Изменить'}
                  </button>
                  {!template.isBuiltIn && (
                    <button
                      type="button"
                      className="action-button danger-action"
                      onClick={() => void deleteTemplate(template.id)}
                    >
                      Удалить
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      <div className="content-card full-width">
        <div className="section-heading compact-heading">
          <div>
            <p className="eyebrow">ОБЩИЕ ПРАВИЛА</p>
            <h2>Рейтинг</h2>
          </div>
          <span className="muted">Сумма весов автоматически нормализуется до 100 баллов.</span>
        </div>
        <div className="coefficient-grid">
          {(Object.keys(config.ratingWeights) as Array<keyof AppConfig['ratingWeights']>).map((key) => (
            <label key={key}>
              <span>{RATING_WEIGHT_LABELS[key]}</span>
              <input
                type="number"
                min="0"
                value={config.ratingWeights[key]}
                onChange={(event) =>
                  onUpdate((current) => {
                    current.ratingWeights[key] = numberValue(event.target.value);
                    return current;
                  })
                }
              />
            </label>
          ))}
        </div>
      </div>
      <div className="content-card full-width">
        <div className="section-heading compact-heading">
          <div>
            <p className="eyebrow">ОБЩИЕ ПРАВИЛА</p>
            <h2>Коэффициенты неопределённости</h2>
          </div>
          <span className="muted">K увеличивает безопасную стоимость и не является вероятностью.</span>
        </div>
        <div className="coefficient-grid">
          {config.coefficients.map((rule) => (
            <label key={rule.id}>
              <span>{rule.label}</span>
              <input
                type="number"
                step="0.01"
                min="1"
                value={rule.coefficient}
                onChange={(event) =>
                  onUpdate((current) => {
                    const target = current.coefficients.find((item) => item.id === rule.id);
                    if (target) target.coefficient = numberValue(event.target.value);
                    return current;
                  })
                }
              />
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}
