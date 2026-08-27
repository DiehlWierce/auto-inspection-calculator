import { useState } from 'react';
import type { FormEvent } from 'react';
import { CATEGORIES } from '../config';
import { calculateInspection } from '../calculator';
import { confirmAction } from '../ui/confirm';
import { numberValue, uid } from '../utils';
import { INSPECTION_STAGES, adaptTimingElement, blankFact, engineVariant, modelName } from '../domain/inspection';
import type { InspectionStageId } from '../domain/inspection';
import { InspectionLayoutEditor } from '../components/InspectionLayoutEditor';
import { StageReview, StageTab } from './inspection/StageReview';
import { FactCard, FactForm, FactGroupSummary } from './inspection/FactPanel';
import { CriticalPoint, Summary } from './inspection/Summary';
import { VehicleEditor, VehicleInfoSummary } from './inspection/VehicleEditor';
import type { BodyRisk, CategoryId, Fact, Inspection, View } from '../types';

export function InspectionView({
  inspection,
  result,
  onUpdate,
  onNavigate,
}: {
  inspection: Inspection;
  result: ReturnType<typeof calculateInspection>;
  onUpdate: (inspection: Inspection) => void;
  onNavigate: (view: View) => void;
}) {
  const [showFreeForm, setShowFreeForm] = useState(false);
  const [showVehicleEditor, setShowVehicleEditor] = useState(false);
  const [showLayoutEditor, setShowLayoutEditor] = useState(false);
  const [criticalDismissed, setCriticalDismissed] = useState(false);
  const [activeStageId, setActiveStageId] = useState<InspectionStageId>('body');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(blankFact());
  const stages = inspection.inspectionLayout?.length
    ? inspection.inspectionLayout
    : adaptTimingElement(INSPECTION_STAGES, engineVariant(inspection.configSnapshot, inspection.vehicle).timingDrive);
  const activeStage = stages.find((stage) => stage.id === activeStageId) ?? stages[0];
  const hasCriticalPoint =
    result.zone === 'RED' || result.zone === 'FILTER_FAIL' || result.rating.hardBlocks.length > 0;

  const resetForm = () => {
    setForm(blankFact());
    setEditingId(null);
  };
  const changeCategory = (category: CategoryId) => {
    const option = CATEGORIES.find((item) => item.id === category)!;
    setForm((current) => ({
      ...current,
      category: option,
      subcategory: option.subcategories[0],
      group: category === 'body' ? 'Кузов' : category === 'interior' ? 'Салон' : current.group,
      bodyRisks: category === 'body' ? current.bodyRisks : [],
    }));
  };
  const toggleRisk = (risk: BodyRisk) =>
    setForm((current) => ({
      ...current,
      bodyRisks: current.bodyRisks.includes(risk)
        ? current.bodyRisks.filter((item) => item !== risk)
        : [...current.bodyRisks, risk],
    }));
  const upsertFact = (fact: Fact) =>
    onUpdate({
      ...inspection,
      facts: inspection.facts.some((item) => item.id === fact.id)
        ? inspection.facts.map((item) => (item.id === fact.id ? fact : item))
        : [...inspection.facts, fact],
    });
  const saveFact = (event: FormEvent) => {
    event.preventDefault();
    if (!form.description.trim()) return;
    if (form.kind === 'WORK' && numberValue(form.statedCost) <= 0) return;
    const now = new Date().toISOString();
    const previous = editingId ? inspection.facts.find((item) => item.id === editingId) : undefined;
    const fact: Fact = {
      id: editingId ?? uid(),
      sequence: previous?.sequence ?? Math.max(0, ...inspection.facts.map((item) => item.sequence)) + 1,
      kind: form.kind,
      category: form.category.id,
      subcategory: form.subcategory,
      description: form.description.trim(),
      statedCost: form.kind === 'WORK' ? numberValue(form.statedCost) : undefined,
      urgency: form.urgency,
      status: form.status,
      comment: form.comment.trim(),
      bodyRisks: form.bodyRisks,
      group: form.group.trim() || undefined,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    upsertFact(fact);
    resetForm();
    setShowFreeForm(true);
  };
  const editFact = (fact: Fact, duplicate = false) => {
    const category = CATEGORIES.find((item) => item.id === fact.category)!;
    const stage = stages.find((item) => item.categories.includes(fact.category));
    if (stage) setActiveStageId(stage.id);
    setEditingId(duplicate ? null : fact.id);
    setForm({
      kind: fact.kind,
      category,
      subcategory: fact.subcategory,
      description: fact.description,
      statedCost: fact.statedCost?.toString() ?? '',
      urgency: fact.urgency,
      status: fact.status,
      comment: duplicate ? '' : fact.comment,
      group: fact.group ?? '',
      bodyRisks: fact.bodyRisks,
    });
    setShowFreeForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const deleteFact = async (id: string) => {
    if (!(await confirmAction('Удалить факт из журнала?'))) return;
    onUpdate({ ...inspection, facts: inspection.facts.filter((fact) => fact.id !== id) });
  };
  const toggleStatus = (fact: Fact) =>
    onUpdate({
      ...inspection,
      facts: inspection.facts.map((item) =>
        item.id === fact.id
          ? {
              ...item,
              status: item.status === 'CONFIRMED' ? 'QUESTION' : 'CONFIRMED',
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    });
  const finish = (status: 'FINISHED_CANDIDATE' | 'FINISHED_REJECTED') => {
    onUpdate({ ...inspection, status });
    onNavigate('history');
  };

  return (
    <section className="page-section inspection-page">
      <div className="inspection-heading">
        <div>
          <button type="button" className="back-link" onClick={() => onNavigate('history')}>
            ← Все осмотры
          </button>
          <h1>{modelName(inspection.configSnapshot, inspection.vehicle.modelId)}</h1>
          <p className="vehicle-meta">
            {inspection.vehicle.year} ·{' '}
            {engineVariant(inspection.configSnapshot, inspection.vehicle)?.code || 'двигатель не указан'} ·{' '}
            {inspection.vehicle.mileage.toLocaleString('ru-RU')} км ·{' '}
            {inspection.vehicle.listingSource || 'Источник не указан'}
            {inspection.vehicle.vin ? ` · VIN ${inspection.vehicle.vin}` : ''}
          </p>
        </div>
        <div className="heading-actions">
          <button type="button" className="ghost-button" onClick={() => setShowVehicleEditor((value) => !value)}>
            Данные авто
          </button>
          <button type="button" className="ghost-button" onClick={() => onNavigate('forecast')}>
            Прогноз 5 лет
          </button>
          <button type="button" className="ghost-button" onClick={() => onNavigate('settings')}>
            Настройки
          </button>
        </div>
      </div>
      {showVehicleEditor && (
        <VehicleEditor
          inspection={inspection}
          onSave={(next) => {
            onUpdate(next);
            setShowVehicleEditor(false);
          }}
          onCancel={() => setShowVehicleEditor(false)}
        />
      )}
      <VehicleInfoSummary
        vehicle={inspection.vehicle}
        config={inspection.configSnapshot}
        onEdit={() => setShowVehicleEditor(true)}
      />
      <Summary result={result} inspection={inspection} onForecast={() => onNavigate('forecast')} />
      {hasCriticalPoint && !criticalDismissed && (
        <CriticalPoint
          result={result}
          onReject={() => finish('FINISHED_REJECTED')}
          onContinue={() => setCriticalDismissed(true)}
        />
      )}
      {hasCriticalPoint && criticalDismissed && (
        <div className="critical-minibar">
          <span>Критическая точка учтена.</span>
          <button type="button" className="text-button" onClick={() => setCriticalDismissed(false)}>
            Показать детали
          </button>
        </div>
      )}
      {showLayoutEditor && (
        <InspectionLayoutEditor
          layout={stages}
          onCancel={() => setShowLayoutEditor(false)}
          onSave={(layout) => {
            onUpdate({ ...inspection, inspectionLayout: layout });
            setShowLayoutEditor(false);
          }}
        />
      )}
      <div className="inspection-progress">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ПОШАГОВЫЙ ОСМОТР</p>
            <h2>
              Этапы автомобиля <span className="count-badge">{inspection.facts.length} фактов</span>
            </h2>
          </div>
          <div className="button-row">
            <span className="muted">Сохранённые элементы сразу попадают в общий расчёт.</span>
            <button
              type="button"
              className="ghost-button compact-action"
              onClick={() => setShowLayoutEditor((value) => !value)}
            >
              {showLayoutEditor ? 'Закрыть настройку' : 'Настроить блоки'}
            </button>
          </div>
        </div>
        <div className="stage-tabs">
          {stages.map((stage, index) => (
            <StageTab
              key={stage.id}
              stage={stage}
              index={index}
              facts={result.calculatedFacts}
              active={stage.id === activeStage.id}
              onClick={() => setActiveStageId(stage.id)}
            />
          ))}
        </div>
      </div>
      {activeStage && (
        <StageReview
          key={activeStage.id}
          stage={activeStage}
          stepIndex={stages.findIndex((item) => item.id === activeStage.id)}
          facts={result.calculatedFacts}
          onSaveFact={upsertFact}
          onDeleteFact={(id) => void deleteFact(id)}
        />
      )}
      <div className="section-heading all-facts-heading">
        <div>
          <p className="eyebrow">ОБЩИЙ ЖУРНАЛ</p>
          <h2>
            Все факты <span className="count-badge">{inspection.facts.length}</span>
          </h2>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            resetForm();
            setShowFreeForm((value) => !value);
          }}
        >
          {showFreeForm ? 'Скрыть свободную форму' : '＋ Свободный факт'}
        </button>
      </div>
      <FactGroupSummary facts={inspection.facts} />
      {showFreeForm && (
        <FactForm
          form={form}
          editing={Boolean(editingId)}
          onChange={setForm}
          onCategoryChange={changeCategory}
          onToggleRisk={toggleRisk}
          onCancel={resetForm}
          onSubmit={saveFact}
        />
      )}
      <div className="fact-list">
        {result.calculatedFacts.length === 0 ? (
          <div className="subtle-empty">
            Выберите этап и сохраняйте состояние каждого элемента. Для нестандартного замечания используйте свободный
            факт.
          </div>
        ) : (
          result.calculatedFacts.map((fact) => (
            <FactCard
              key={fact.id}
              fact={fact}
              onEdit={() => editFact(fact)}
              onDuplicate={() => editFact(fact, true)}
              onDelete={() => void deleteFact(fact.id)}
              onToggleStatus={() => toggleStatus(fact)}
            />
          ))
        )}
      </div>
      <div className="finish-bar">
        <div>
          <strong>
            {inspection.status === 'IN_PROGRESS'
              ? 'Осмотр в процессе'
              : inspection.status === 'FINISHED_REJECTED'
                ? 'Осмотр завершён отказом'
                : 'Осмотр завершён: кандидат'}
          </strong>
          <span className="muted">Решение сохранится, форма закроется, и откроется список осмотров.</span>
        </div>
        <div className="button-row">
          <button type="button" className="ghost-button" onClick={() => finish('FINISHED_REJECTED')}>
            Завершить — отказ
          </button>
          <button type="button" className="primary-button" onClick={() => finish('FINISHED_CANDIDATE')}>
            Завершить — кандидат
          </button>
        </div>
      </div>
    </section>
  );
}
