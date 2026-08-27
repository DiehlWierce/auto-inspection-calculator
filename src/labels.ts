import type { BodyRisk, FactUrgency, AppConfig, TimingDrive } from './types';

export const BODY_RISK_LABELS: Record<BodyRisk, string> = {
  structural_corrosion: 'Силовая коррозия',
  longerons: 'Лонжероны',
  strut_towers: 'Стаканы',
  weak_sills: 'Порог с потерей прочности',
  floor: 'Днище',
  suspension_mounts: 'Крепления подвески',
  geometry: 'Нарушение геометрии',
  major_crash: 'Последствия тяжёлого ДТП',
  large_welding: 'Масштабная сварка',
  unestimable_scope: 'Неопределимый объём',
};

export const URGENCY_LABELS: Record<FactUrgency, string> = {
  NOW: 'Сразу',
  SOON: 'В ближайшее время',
  PLANNED: 'Планово',
  OPTIONAL: 'Желательно',
};

export const conditionOptions = ['Исправно', 'Неисправно', 'Неизвестно', 'Требует проверки'];

export const RATING_WEIGHT_LABELS: Record<keyof AppConfig['ratingWeights'], string> = {
  budget: 'Бюджет доведения',
  ownership: 'Стоимость владения',
  annualRisk: 'Годовой риск',
  frequency: 'Частота крупных ремонтов',
  maxRepair: 'Максимальный ремонт',
  engine: 'Риск двигателя',
  transmission: 'Риск АКПП',
  predictability: 'Предсказуемость',
  service: 'Ремонт и обслуживание',
  vehicleInfo: 'История и комплектность',
};

export const DOCUMENT_LABELS = {
  ORIGINAL: 'Оригинал ПТС',
  DUPLICATE_WITH_ORIGINAL: 'Дубликат с оригиналом',
  DUPLICATE_WITHOUT_ORIGINAL: 'Дубликат без оригинала',
  UNKNOWN: 'Не проверено',
} as const;

export const ACCIDENT_OUTCOME_LABELS: Record<string, string> = {
  geometry_change: 'Изменение геометрии',
  local_welding: 'Локальная сварка',
  straightening: 'Рихтовка',
  paintwork: 'Окрасы',
  structural_repair: 'Ремонт силовых элементов',
  airbag: 'Срабатывание подушек',
  unknown_extent: 'Объём ДТП неизвестен',
};

export const TIMING_DRIVE_LABELS: Record<TimingDrive, string> = {
  CHAIN: 'Цепь ГРМ',
  BELT: 'Ремень ГРМ',
  UNKNOWN: 'ГРМ не определён',
};

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
