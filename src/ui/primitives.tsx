import type { ReactNode } from 'react';

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="form-section"><h2>{title}</h2>{children}</section>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span className="field-label">{label}{hint && <small>{hint}</small>}</span>{children}</label>;
}

export function MiniField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="mini-field"><span>{label}</span>{children}</label>;
}

export function Metric({ label, value, accent }: { label: string; value: string; accent?: 'positive' | 'warning' | 'danger' }) {
  return <div className={`metric ${accent ?? ''}`}><span>{label}</span><strong>{value}</strong></div>;
}

export function RiskCard({ label, value, tone }: { label: string; value: string; tone: 'good' | 'warn' }) {
  return <div className={`risk-card ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}
