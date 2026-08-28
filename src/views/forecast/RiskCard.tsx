import { percent } from '../../utils';

export function RiskCard({ label, value }: { label: string; value: number | null }) {
  const tone = value === null ? 'pending' : value > 0 ? 'warn' : 'good';
  return <div className={`risk-card ${tone}`}><span>{label}</span><strong>{value === null ? '—' : percent(value)}</strong></div>;
}
