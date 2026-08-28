export const money = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${Math.round(value).toLocaleString('ru-RU')} ₽`;
};

export const parseNumber = (value: string): number | null => {
  const text = value.replace(/\s/g, '').replace(',', '.');
  if (text === '' || text === '-' || text === '.' || text === '-.') return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
};

export const percent = (value: number | null | undefined, digits = 1): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(digits).replace('.', ',')}%`;
};

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const roundCurrency = (value: number): number => Math.round(value);

export const uid = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

export function downloadText(filename: string, content: string, mime = 'application/json'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
