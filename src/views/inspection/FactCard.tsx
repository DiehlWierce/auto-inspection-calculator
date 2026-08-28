import { money } from '../../utils';
import { categoryName } from '../../calc';
import { BODY_RISK_LABELS, URGENCY_LABELS } from '../../domain/labels';
import type { CalculatedFact, Fact } from '../../types';

export function FactCard({ fact, onEdit, onDuplicate, onDelete, onToggleStatus }: { fact: CalculatedFact; onEdit: () => void; onDuplicate: () => void; onDelete: () => void; onToggleStatus: () => void }) {
  return <article className={`fact-card ${fact.status === 'QUESTION' ? 'question' : ''}`}><div className="fact-number">#{fact.sequence}</div><div className="fact-body"><div className="fact-top"><span className="category-tag">{categoryName(fact.category)}</span>{fact.group && <span className="group-tag">{fact.group}</span>}<span className={`mini-status ${fact.status.toLowerCase()}`}>{fact.status === 'QUESTION' ? 'под вопросом' : 'подтверждён'}</span><span className="fact-urgency">{URGENCY_LABELS[fact.urgency]}</span></div><h3>{fact.description}</h3><p className="fact-sub">{fact.subcategory}{fact.comment ? ` · ${fact.comment}` : ''}</p>{fact.bodyRisks.length > 0 && <div className="risk-line">! {fact.bodyRisks.map((risk) => BODY_RISK_LABELS[risk]).join(' · ')}</div>}</div><div className="fact-cost">{fact.kind === 'WORK' ? <><strong>{money(fact.safeCost)}</strong><span>{money(fact.statedCost)} × K {fact.coefficient.toFixed(2)}</span></> : <><strong className="ok-cost">Без ремонта</strong><span>Факт состояния</span></>}</div><div className="fact-actions"><button className="action-button secondary-action" onClick={onDuplicate}>Дублировать</button><button className="action-button secondary-action" onClick={onToggleStatus}>{fact.status === 'QUESTION' ? 'Подтвердить' : 'Под вопрос'}</button><button className="action-button secondary-action" onClick={onEdit}>Изменить</button><button className="action-button danger-action" onClick={onDelete}>Удалить</button></div></article>;
}

export function FactGroupSummary({ facts }: { facts: Fact[] }) {
  const groups = Array.from(new Set(facts.map((fact) => fact.group).filter(Boolean) as string[]));
  if (groups.length === 0) return null;
  return <div className="group-summary"><span className="group-summary-title">Блоки:</span>{groups.map((group) => <span className="group-chip" key={group}>{group} · {facts.filter((fact) => fact.group === group).length}</span>)}</div>;
}
