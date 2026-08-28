export { formatDate, money, percent } from '../utils';

export function statusText(status: string): string {
  if (status === 'VALID') return 'Расчёт полный';
  if (status === 'BLOCKED') return 'Есть блокирующие риски';
  return 'Расчёт предварительный';
}

export function zoneText(zone: string): string {
  if (zone === 'GREEN') return 'Зелёная зона';
  if (zone === 'YELLOW') return 'Жёлтая зона';
  if (zone === 'FILTER_FAIL') return 'Фильтр не пройден';
  return 'Красная зона';
}
