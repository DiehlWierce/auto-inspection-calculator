import { useState } from 'react';
import { money, uid } from '../../utils';
import { MoneyInput } from '../../ui/NumberInput';
import { URGENCY_LABELS } from '../../domain/labels';
import { draftFromFact } from '../../domain/factory';
import { stageHasFact } from '../../domain/layout';
import type { InspectionStage, InspectionStageBlock, StageDraft, StageElementState } from '../../domain/layout';
import { MiniField } from '../../ui/primitives';
import type { CalculatedFact, Fact, FactUrgency } from '../../types';

export function StageReview({ stage, stepIndex, facts, onSaveFact, onDeleteFact }: { stage: InspectionStage; stepIndex: number; facts: CalculatedFact[]; onSaveFact: (fact: Fact) => void; onDeleteFact: (id: string) => void }) {
  const [drafts, setDrafts] = useState<Record<string, StageDraft>>({});
  const getDraft = (element: string) => drafts[element] ?? draftFromFact(stageHasFact(facts, stage, element));
  const updateDraft = (element: string, change: Partial<StageDraft>) => setDrafts((current) => ({ ...current, [element]: { ...(current[element] ?? draftFromFact(stageHasFact(facts, stage, element))), ...change } }));
  const saveElement = (block: InspectionStageBlock, element: string) => {
    const draft = getDraft(element);
    const existing = stageHasFact(facts, stage, element);
    if (draft.state === 'UNSET') {
      if (existing) onDeleteFact(existing.id);
      setDrafts((current) => ({ ...current, [element]: draftFromFact(undefined) }));
      return;
    }
    const now = new Date().toISOString();
    const isWork = draft.state === 'WORK';
    const fact: Fact = { id: existing?.id ?? uid(), sequence: existing?.sequence ?? Math.max(0, ...facts.map((item) => item.sequence)) + 1, kind: isWork ? 'WORK' : 'CONDITION', category: block.category, subcategory: block.subcategory, description: isWork ? `${element}: ${draft.details.trim() || 'требует ремонта'}` : `${element}: ${draft.state === 'GOOD' ? 'исправно' : 'требует проверки'}`, statedCost: isWork ? draft.cost ?? undefined : undefined, urgency: isWork ? draft.urgency : 'NOW', status: draft.state === 'QUESTION' ? 'QUESTION' : 'CONFIRMED', comment: draft.comment.trim(), bodyRisks: existing?.bodyRisks ?? [], group: stage.label, stageId: stage.id, blockId: block.id, elementId: element, createdAt: existing?.createdAt ?? now, updatedAt: now };
    if (isWork && (!fact.statedCost || fact.statedCost <= 0)) return;
    onSaveFact(fact);
    setDrafts((current) => ({ ...current, [element]: draft }));
  };
  return <section className="stage-review"><div className="stage-intro"><div><span className="step-chip">ЭТАП {stepIndex + 1}</span><h2>{stage.label}</h2><p>{stage.description}</p></div><span className="muted">Выберите состояние, заполните работу при необходимости и нажмите «Сохранить».</span></div>{stage.blocks.map((block) => <fieldset className="stage-block" key={block.id}><legend>{block.label}</legend><div className="stage-element-list">{block.elements.map((element) => { const draft = getDraft(element); const fact = stageHasFact(facts, stage, element); return <div className={`inspection-element ${fact ? 'saved' : ''}`} key={element}><div className="element-heading"><strong>{element}</strong>{fact && <span>Зафиксировано{fact.kind === 'WORK' ? ` · ${money(fact.statedCost)}` : ' · состояние'}</span>}</div><div className="element-fields"><MiniField label="Состояние"><select value={draft.state} onChange={(input) => updateDraft(element, { state: input.target.value as StageElementState })}><option value="UNSET">Не проверено</option><option value="GOOD">Исправно</option><option value="WORK">Нужна работа</option><option value="QUESTION">Под вопросом</option></select></MiniField>{draft.state === 'WORK' && <><MiniField label="Работа"><input value={draft.details} onChange={(input) => updateDraft(element, { details: input.target.value })} placeholder="Что сделать или заменить" /></MiniField><MiniField label="Стоимость, ₽"><MoneyInput allowEmpty value={draft.cost} onCommit={(value) => updateDraft(element, { cost: value })} placeholder="Введите сумму" /></MiniField><MiniField label="Срок"><select value={draft.urgency} onChange={(input) => updateDraft(element, { urgency: input.target.value as FactUrgency })}>{Object.entries(URGENCY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></MiniField></>}{draft.state === 'QUESTION' && <MiniField label="Что уточнить"><input value={draft.comment} onChange={(input) => updateDraft(element, { comment: input.target.value })} placeholder="Комментарий специалиста" /></MiniField>}{draft.state === 'GOOD' && <MiniField label="Комментарий"><input value={draft.comment} onChange={(input) => updateDraft(element, { comment: input.target.value })} placeholder="Необязательно" /></MiniField>}</div><div className="element-actions"><button className="action-button primary-action" onClick={() => saveElement(block, element)}>{fact ? 'Сохранить изменения' : 'Сохранить'}</button>{fact && <button className="action-button danger-action" onClick={() => { if (window.confirm('Удалить состояние этого элемента?')) { onDeleteFact(fact.id); setDrafts((current) => ({ ...current, [element]: draftFromFact(undefined) })); } }}>Удалить</button>}</div></div>; })}</div></fieldset>)}</section>;
}
