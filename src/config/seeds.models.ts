import type { ModelProfile } from '../types';

export const MODELS: ModelProfile[] = [
  {
    id: 'corolla-e120', isBuiltIn: true, make: 'Toyota', model: 'Corolla', generation: 'E120', engine: '1.6', transmission: 'AT',
    engineVariants: [
      { id: '3zz-fe', label: '3ZZ-FE 1.6 VVT-i — цепь ГРМ', code: '3ZZ-FE', timingDrive: 'CHAIN', note: 'Основная европейская 1.6-литровая версия E120.' },
      { id: 'unknown', label: 'Код двигателя не установлен', code: '', timingDrive: 'UNKNOWN', note: 'Уточнить по VIN и маркировке двигателя.' },
    ],
    consumptionLPer100Km: 8.5, taxAnnual: 2400, repairEventIds: ['corolla-engine', 'corolla-transmission', 'corolla-suspension', 'corolla-ac', 'corolla-electrics', 'corolla-timing-chain'],
  },
  {
    id: 'cerato-ld', isBuiltIn: true, make: 'Kia', model: 'Cerato', generation: 'LD', engine: '1.6', transmission: 'AT',
    engineVariants: [
      { id: 'g4ed', label: 'G4ED 1.6 — ремень ГРМ', code: 'G4ED', timingDrive: 'BELT', note: 'Для этой версии важно подтвердить дату последней замены комплекта ГРМ.' },
      { id: 'unknown', label: 'Код двигателя не установлен', code: '', timingDrive: 'UNKNOWN', note: 'Уточнить по VIN и маркировке двигателя.' },
    ],
    consumptionLPer100Km: 9.0, taxAnnual: 2400, repairEventIds: ['cerato-engine', 'cerato-transmission', 'cerato-suspension', 'cerato-ac', 'cerato-electrics', 'timing-belt'],
  },
  {
    id: 'lacetti-hatch', isBuiltIn: true, make: 'Chevrolet', model: 'Lacetti Hatch', generation: 'J200', engine: '1.6', transmission: 'AT',
    engineVariants: [
      { id: 'f16d3', label: 'F16D3 1.6 16V — ремень ГРМ', code: 'F16D3', timingDrive: 'BELT', note: 'Проверить комплект ГРМ, ролики и помпу по истории обслуживания.' },
      { id: 'unknown', label: 'Код двигателя не установлен', code: '', timingDrive: 'UNKNOWN', note: 'Уточнить по VIN и маркировке двигателя.' },
    ],
    consumptionLPer100Km: 9.5, taxAnnual: 2400, repairEventIds: ['lacetti-engine', 'lacetti-transmission', 'lacetti-suspension', 'lacetti-ac', 'lacetti-electrics', 'timing-belt'],
  },
];
