import { useState } from 'react';
import { cloneLayout, modelName } from '../../domain/inspection';
import { Field } from '../../components/primitives';
import { InspectionLayoutEditor } from '../../components/InspectionLayoutEditor';
import type { AppConfig, InspectionTemplate, ModelId } from '../../types';

export function TemplateEditorPanel({
  template,
  config,
  onSave,
  onCancel,
}: {
  template: InspectionTemplate;
  config: AppConfig;
  onSave: (template: InspectionTemplate) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<InspectionTemplate>(() => ({
    ...template,
    modelIds: [...template.modelIds],
    engineVariantIds: template.engineVariantIds ? [...template.engineVariantIds] : undefined,
    layout: cloneLayout(template.layout),
    isBuiltIn: false,
  }));
  const selectedModels = config.models.filter((model) => draft.modelIds.includes(model.id));
  const variants = selectedModels.flatMap((model) =>
    model.engineVariants.map((variant) => ({ ...variant, modelId: model.id })),
  );
  const toggleModel = (modelId: ModelId) =>
    setDraft((current) => {
      const modelIds = current.modelIds.includes(modelId)
        ? current.modelIds.filter((id) => id !== modelId)
        : [...current.modelIds, modelId];
      return { ...current, modelIds: modelIds.length > 0 ? modelIds : [modelId], engineVariantIds: undefined };
    });
  const toggleVariant = (variantId: string) =>
    setDraft((current) => {
      const ids = current.engineVariantIds ?? [];
      const next = ids.includes(variantId) ? ids.filter((id) => id !== variantId) : [...ids, variantId];
      return { ...current, engineVariantIds: next.length > 0 ? next : undefined };
    });
  return (
    <div className="template-editor">
      <div className="form-section-title">
        <div>
          <span className="step-chip">КОНСТРУКТОР ШАБЛОНА</span>
          <strong>{draft.name}</strong>
        </div>
        <div className="button-row">
          <button type="button" className="ghost-button" onClick={onCancel}>
            Отмена
          </button>
          <button type="button" className="primary-button" onClick={() => onSave(draft)}>
            Сохранить шаблон
          </button>
        </div>
      </div>
      <div className="form-grid two">
        <Field label="Название шаблона">
          <input
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder="Название"
          />
        </Field>
        <Field label="Описание">
          <input
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            placeholder="Для какой проверки шаблон"
          />
        </Field>
      </div>
      <div className="template-targets">
        <div>
          <span className="field-label">Модели, для которых доступен шаблон</span>
          <div className="check-grid">
            {config.models.map((model) => (
              <label className="check-item" key={model.id}>
                <input
                  type="checkbox"
                  checked={draft.modelIds.includes(model.id)}
                  onChange={() => toggleModel(model.id)}
                />
                {modelName(config, model.id)}
              </label>
            ))}
          </div>
        </div>
        {variants.length > 0 && (
          <div>
            <span className="field-label">Ограничить вариантами двигателя (не выбирать — для всех)</span>
            <div className="check-grid">
              {variants.map((variant) => (
                <label className="check-item" key={`${variant.modelId}-${variant.id}`}>
                  <input
                    type="checkbox"
                    checked={draft.engineVariantIds?.includes(variant.id) ?? false}
                    onChange={() => toggleVariant(variant.id)}
                  />
                  {variant.code || variant.label} ·{' '}
                  {variant.timingDrive === 'CHAIN'
                    ? 'цепь'
                    : variant.timingDrive === 'BELT'
                      ? 'ремень'
                      : 'тип ГРМ не указан'}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
      <InspectionLayoutEditor
        layout={draft.layout}
        onCancel={onCancel}
        onSave={(layout) => setDraft({ ...draft, layout })}
      />
    </div>
  );
}
