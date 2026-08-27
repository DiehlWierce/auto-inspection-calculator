import type { FormEvent } from 'react';
import { CATEGORIES } from '../../config';
import { CRITICAL_BODY_RISKS, calculateInspection, categoryName } from '../../calculator';
import { money } from '../../utils';
import { BODY_RISK_LABELS, URGENCY_LABELS, conditionOptions } from '../../labels';
import { blankFact } from '../../domain/inspection';
import { Field } from '../../components/primitives';
import type { BodyRisk, CategoryId, Fact, FactKind, FactStatus, FactUrgency } from '../../types';

export function FactForm({
  form,
  editing,
  onChange,
  onCategoryChange,
  onToggleRisk,
  onCancel,
  onSubmit,
}: {
  form: ReturnType<typeof blankFact>;
  editing: boolean;
  onChange: (form: ReturnType<typeof blankFact>) => void;
  onCategoryChange: (category: CategoryId) => void;
  onToggleRisk: (risk: BodyRisk) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <form className="fact-form" onSubmit={onSubmit}>
      <div className="form-section-title">
        <div>
          <span className="step-chip">{editing ? 'РЕДАКТИРОВАНИЕ' : 'НОВЫЙ ФАКТ'}</span>
          <strong>{editing ? 'Изменить запись' : 'Добавить факт'}</strong>
        </div>
        {editing && (
          <button type="button" className="text-button" onClick={onCancel}>
            Сбросить
          </button>
        )}
      </div>
      <div className="form-grid two">
        <Field label="Тип факта">
          <select value={form.kind} onChange={(event) => onChange({ ...form, kind: event.target.value as FactKind })}>
            <option value="WORK">Нужна работа</option>
            <option value="CONDITION">Состояние / проверка</option>
          </select>
        </Field>
        <Field label="Статус">
          <select
            value={form.status}
            onChange={(event) => onChange({ ...form, status: event.target.value as FactStatus })}
          >
            <option value="CONFIRMED">Подтверждён</option>
            <option value="QUESTION">Под вопросом</option>
          </select>
        </Field>
      </div>
      <div className="form-grid two">
        <Field label="Категория">
          <select value={form.category.id} onChange={(event) => onCategoryChange(event.target.value as CategoryId)}>
            {CATEGORIES.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Подкатегория">
          <select value={form.subcategory} onChange={(event) => onChange({ ...form, subcategory: event.target.value })}>
            {form.category.subcategories.map((subcategory) => (
              <option key={subcategory}>{subcategory}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Группа / блок" hint="Например: кузов, левый бок, салон">
        <input
          value={form.group}
          onChange={(event) => onChange({ ...form, group: event.target.value })}
          placeholder={
            form.category.id === 'body'
              ? 'Кузов · левый бок'
              : form.category.id === 'interior'
                ? 'Салон'
                : 'Необязательно'
          }
        />
      </Field>
      {form.kind === 'CONDITION' && (
        <Field label="Состояние">
          <select value={form.description} onChange={(event) => onChange({ ...form, description: event.target.value })}>
            <option value="">Выберите состояние</option>
            {conditionOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label={form.kind === 'WORK' ? 'Что нужно сделать' : 'Описание факта'}>
        <input
          autoFocus={form.kind === 'WORK'}
          value={
            form.kind === 'CONDITION' && conditionOptions.includes(form.description)
              ? `${form.description}`
              : form.description
          }
          onChange={(event) => onChange({ ...form, description: event.target.value })}
          placeholder={form.kind === 'WORK' ? 'Например: передние стойки + опоры' : 'Например: АКПП работает нормально'}
          required
        />
      </Field>
      {form.kind === 'WORK' && (
        <div className="form-grid two">
          <Field label="Стоимость специалиста, ₽">
            <input
              type="number"
              min="1"
              value={form.statedCost}
              onChange={(event) => onChange({ ...form, statedCost: event.target.value })}
              required
            />
          </Field>
          <Field label="Срочность">
            <select
              value={form.urgency}
              onChange={(event) => onChange({ ...form, urgency: event.target.value as FactUrgency })}
            >
              {Object.entries(URGENCY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {form.kind === 'CONDITION' && (
        <Field label="Срочность">
          <select
            value={form.urgency}
            onChange={(event) => onChange({ ...form, urgency: event.target.value as FactUrgency })}
          >
            {Object.entries(URGENCY_LABELS).map(([value, label]) => (
              <option key={value}>{label}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Комментарий специалиста">
        <textarea
          value={form.comment}
          onChange={(event) => onChange({ ...form, comment: event.target.value })}
          placeholder="Что именно сказал специалист"
          rows={2}
        />
      </Field>
      {form.category.id === 'body' && (
        <div className="risk-picker">
          <span className="field-label">
            Кузовные риски
            <small>Отмеченные знаком «!» останавливают расчёт — их не заменяет денежная смета</small>
          </span>
          <div className="check-grid">
            {Object.entries(BODY_RISK_LABELS).map(([risk, label]) => {
              const critical = CRITICAL_BODY_RISKS.includes(risk as BodyRisk);
              return (
                <label key={risk} className={`check-item ${critical ? 'check-critical' : ''}`}>
                  <input
                    type="checkbox"
                    checked={form.bodyRisks.includes(risk as BodyRisk)}
                    onChange={() => onToggleRisk(risk as BodyRisk)}
                  />
                  {critical ? `! ${label}` : label}
                </label>
              );
            })}
          </div>
        </div>
      )}
      <div className="form-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>
          Отмена
        </button>
        <button type="submit" className="primary-button">
          {editing ? 'Сохранить изменения' : 'Добавить факт'}
        </button>
      </div>
    </form>
  );
}

export function FactCard({
  fact,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleStatus,
}: {
  fact: ReturnType<typeof calculateInspection>['calculatedFacts'][number];
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
}) {
  return (
    <article className={`fact-card ${fact.status === 'QUESTION' ? 'question' : ''}`}>
      <div className="fact-number">#{fact.sequence}</div>
      <div className="fact-body">
        <div className="fact-top">
          <span className="category-tag">{categoryName(fact.category)}</span>
          {fact.group && <span className="group-tag">{fact.group}</span>}
          <span className={`mini-status ${fact.status.toLowerCase()}`}>
            {fact.status === 'QUESTION' ? 'под вопросом' : 'подтверждён'}
          </span>
          <span className="fact-urgency">{URGENCY_LABELS[fact.urgency]}</span>
        </div>
        <h3>{fact.description}</h3>
        <p className="fact-sub">
          {fact.subcategory}
          {fact.comment ? ` · ${fact.comment}` : ''}
        </p>
        {fact.bodyRisks.length > 0 && (
          <div className="risk-line">! {fact.bodyRisks.map((risk) => BODY_RISK_LABELS[risk]).join(' · ')}</div>
        )}
      </div>
      <div className="fact-cost">
        {fact.kind === 'WORK' ? (
          <>
            <strong>{money(fact.safeCost)}</strong>
            <span>
              {money(fact.statedCost)} × K {fact.coefficient.toFixed(2)}
            </span>
          </>
        ) : (
          <>
            <strong className="ok-cost">Без ремонта</strong>
            <span>Факт состояния</span>
          </>
        )}
      </div>
      <div className="fact-actions">
        <button type="button" className="action-button secondary-action" onClick={onDuplicate}>
          Дублировать
        </button>
        <button type="button" className="action-button secondary-action" onClick={onToggleStatus}>
          {fact.status === 'QUESTION' ? 'Подтвердить' : 'Под вопрос'}
        </button>
        <button type="button" className="action-button secondary-action" onClick={onEdit}>
          Изменить
        </button>
        <button type="button" className="action-button danger-action" onClick={onDelete}>
          Удалить
        </button>
      </div>
    </article>
  );
}

export function FactGroupSummary({ facts }: { facts: Fact[] }) {
  const groups = Array.from(new Set(facts.map((fact) => fact.group).filter(Boolean) as string[]));
  if (groups.length === 0) return null;
  return (
    <div className="group-summary">
      <span className="group-summary-title">Блоки:</span>
      {groups.map((group) => (
        <span className="group-chip" key={group}>
          {group} · {facts.filter((fact) => fact.group === group).length}
        </span>
      ))}
    </div>
  );
}
