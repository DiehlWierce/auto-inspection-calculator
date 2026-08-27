import type { ReactNode } from 'react';
import { numberValue } from '../utils';

export function NavItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`nav-item ${active ? 'active' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </button>
  );
}

export function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-icon" aria-hidden="true">
        ⌁
      </div>
      <h2>Осмотров пока нет</h2>
      <p>Создайте карточку автомобиля и фиксируйте факты специалиста по одному.</p>
      <button type="button" className="primary-button" onClick={onNew}>
        Начать первый осмотр
      </button>
    </div>
  );
}

export function YearInput({
  label,
  values,
  onChange,
}: {
  label: string;
  values: number[];
  onChange: (index: number, value: number) => void;
}) {
  return (
    <div className="year-row">
      <span>{label}</span>
      {values.slice(0, 5).map((value, index) => (
        <input
          key={index}
          type="number"
          min="0"
          aria-label={`${label}, год ${index + 1}`}
          value={value}
          onChange={(event) => onChange(index, numberValue(event.target.value))}
        />
      ))}
    </div>
  );
}

export function RiskCard({ label, value, tone }: { label: string; value: string; tone: 'good' | 'warn' }) {
  return (
    <div className={`risk-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="form-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {children}
    </label>
  );
}

export function MiniField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mini-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'positive' | 'warning' | 'danger';
}) {
  return (
    <div className={`metric ${accent ?? ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
