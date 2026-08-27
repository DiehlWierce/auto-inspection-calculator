import { useState } from 'react';
import { CATEGORIES } from '../config';
import { confirmAction } from '../ui/confirm';
import { uid } from '../utils';
import { cloneLayout } from '../domain/inspection';
import type { CategoryId, InspectionBlockConfig, InspectionLayout, InspectionStageConfig } from '../types';

export function InspectionLayoutEditor({
  layout,
  onCancel,
  onSave,
}: {
  layout: InspectionLayout;
  onCancel: () => void;
  onSave: (layout: InspectionLayout) => void;
}) {
  const [draft, setDraft] = useState<InspectionLayout>(() => cloneLayout(layout));
  const updateStage = (stageId: string, change: Partial<InspectionStageConfig>) =>
    setDraft((current) => current.map((stage) => (stage.id === stageId ? { ...stage, ...change } : stage)));
  const updateBlock = (stageId: string, blockId: string, change: Partial<InspectionBlockConfig>) =>
    setDraft((current) =>
      current.map((stage) =>
        stage.id !== stageId
          ? stage
          : { ...stage, blocks: stage.blocks.map((block) => (block.id === blockId ? { ...block, ...change } : block)) },
      ),
    );
  const updateElement = (stageId: string, blockId: string, elementIndex: number, value: string) =>
    setDraft((current) =>
      current.map((stage) =>
        stage.id !== stageId
          ? stage
          : {
              ...stage,
              blocks: stage.blocks.map((block) =>
                block.id !== blockId
                  ? block
                  : {
                      ...block,
                      elements: block.elements.map((element, index) => (index === elementIndex ? value : element)),
                    },
              ),
            },
      ),
    );
  const removeStage = async (stageId: string) => {
    if (draft.length <= 1) return;
    const confirmed = await confirmAction({
      message: 'Удалить этот этап из формы осмотра?',
      detail: 'Уже сохранённые факты останутся в журнале.',
    });
    if (!confirmed) return;
    setDraft((current) => current.filter((stage) => stage.id !== stageId));
  };
  const removeBlock = async (stageId: string, blockId: string) => {
    const confirmed = await confirmAction({
      message: 'Удалить этот подблок из формы осмотра?',
      detail: 'Уже сохранённые факты останутся в журнале.',
    });
    if (!confirmed) return;
    setDraft((current) =>
      current.map((stage) =>
        stage.id !== stageId ? stage : { ...stage, blocks: stage.blocks.filter((block) => block.id !== blockId) },
      ),
    );
  };
  const addBlock = (stageId: string) =>
    setDraft((current) =>
      current.map((stage) =>
        stage.id !== stageId
          ? stage
          : {
              ...stage,
              blocks: [
                ...stage.blocks,
                {
                  id: `custom-block-${uid()}`,
                  label: 'Новый подблок',
                  category: 'other',
                  subcategory: 'Не классифицировано',
                  elements: ['Новый элемент'],
                },
              ],
            },
      ),
    );
  const addStage = () =>
    setDraft((current) => [
      ...current,
      {
        id: `custom-stage-${uid()}`,
        label: 'Новый этап',
        description: 'Дополнительные элементы осмотра.',
        categories: ['other'],
        blocks: [
          {
            id: `custom-block-${uid()}`,
            label: 'Новый подблок',
            category: 'other',
            subcategory: 'Не классифицировано',
            elements: ['Новый элемент'],
          },
        ],
      },
    ]);
  return (
    <section className="content-card layout-editor">
      <div className="section-heading compact-heading">
        <div>
          <p className="eyebrow">КОНСТРУКТОР ОСМОТРА</p>
          <h2>Этапы, подблоки и элементы</h2>
          <p className="muted">
            Добавляйте свои пункты вроде «цепь ГРМ», переименовывайте и удаляйте лишнее. Уже сохранённые факты не
            удаляются автоматически.
          </p>
        </div>
        <div className="button-row">
          <button type="button" className="ghost-button" onClick={onCancel}>
            Отмена
          </button>
          <button type="button" className="primary-button" onClick={() => onSave(draft)}>
            Сохранить структуру
          </button>
        </div>
      </div>
      <div className="layout-stage-list">
        {draft.map((stage, stageIndex) => (
          <article className="layout-stage" key={stage.id}>
            <div className="layout-stage-header">
              <span className="stage-index">{String(stageIndex + 1).padStart(2, '0')}</span>
              <div className="layout-stage-fields">
                <input
                  value={stage.label}
                  onChange={(event) => updateStage(stage.id, { label: event.target.value })}
                  placeholder="Название этапа"
                />
                <input
                  value={stage.description}
                  onChange={(event) => updateStage(stage.id, { description: event.target.value })}
                  placeholder="Краткое описание"
                />
              </div>
              <button type="button" className="action-button danger-action" onClick={() => void removeStage(stage.id)}>
                Удалить этап
              </button>
            </div>
            <div className="layout-block-list">
              {stage.blocks.map((block) => (
                <div className="layout-block" key={block.id}>
                  <div className="layout-block-header">
                    <input
                      value={block.label}
                      onChange={(event) => updateBlock(stage.id, block.id, { label: event.target.value })}
                      placeholder="Название подблока"
                    />
                    <select
                      value={block.category}
                      onChange={(event) =>
                        updateBlock(stage.id, block.id, { category: event.target.value as CategoryId })
                      }
                    >
                      {CATEGORIES.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                    <input
                      value={block.subcategory}
                      onChange={(event) => updateBlock(stage.id, block.id, { subcategory: event.target.value })}
                      placeholder="Подкатегория"
                    />
                    <button
                      type="button"
                      className="action-button danger-action"
                      onClick={() => void removeBlock(stage.id, block.id)}
                    >
                      Удалить подблок
                    </button>
                  </div>
                  <div className="layout-element-list">
                    {block.elements.map((element, elementIndex) => (
                      <div className="layout-element" key={`${block.id}-${elementIndex}`}>
                        <input
                          value={element}
                          onChange={(event) => updateElement(stage.id, block.id, elementIndex, event.target.value)}
                          placeholder="Элемент автомобиля"
                        />
                        <button
                          type="button"
                          className="action-button danger-action"
                          onClick={() =>
                            updateBlock(stage.id, block.id, {
                              elements: block.elements.filter((_, index) => index !== elementIndex),
                            })
                          }
                        >
                          Удалить
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="ghost-button compact-action"
                    onClick={() => updateBlock(stage.id, block.id, { elements: [...block.elements, 'Новый элемент'] })}
                  >
                    ＋ Добавить элемент
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="ghost-button compact-action" onClick={() => addBlock(stage.id)}>
              ＋ Добавить подблок
            </button>
          </article>
        ))}
      </div>
      <button type="button" className="ghost-button" onClick={addStage}>
        ＋ Добавить этап
      </button>
    </section>
  );
}
