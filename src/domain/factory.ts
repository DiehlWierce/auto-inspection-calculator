import { CATEGORIES, cloneConfig } from '../config';
import { uid } from '../utils';
import { adaptTimingElement } from './layout';
import { engineVariant } from './vehicle';
import type { StageDraft } from './layout';
import type { AppConfig, BodyRisk, CategoryId, Fact, FactKind, FactStatus, FactUrgency, Inspection, InspectionLayout, ModelId, ModelProfile, RepairEvent, VehicleInfo } from '../types';

export function blankFact(categoryId: CategoryId = 'suspension') {
  const category = CATEGORIES.find((item) => item.id === categoryId)!;
  return {
    kind: 'WORK' as FactKind,
    category,
    subcategory: category.subcategories[0],
    description: '',
    statedCost: null as number | null,
    urgency: 'NOW' as FactUrgency,
    status: 'CONFIRMED' as FactStatus,
    comment: '',
    group: '',
    bodyRisks: [] as BodyRisk[],
  };
}

export function makeInspection(config: AppConfig, values: {
  modelId: ModelId;
  engineVariantId: string;
  year: number;
  mileage: number;
  askingPrice: number;
  expectedDiscount: number;
  actualPurchasePrice?: number;
  vin: string;
  plate: string;
  listingUrl: string;
  listingSource: string;
  documentsStatus: NonNullable<VehicleInfo['documentsStatus']>;
  keyCount?: number;
  accidentStatus: NonNullable<VehicleInfo['accidentStatus']>;
  accidentOutcomes: string[];
  accidentComment: string;
  templateId?: string;
  inspectionLayout: InspectionLayout;
}): Inspection {
  const now = new Date().toISOString();
  return {
    id: uid(),
    createdAt: now,
    updatedAt: now,
    status: 'IN_PROGRESS',
    vehicle: {
      modelId: values.modelId,
      engineVariantId: values.engineVariantId,
      year: values.year,
      mileage: values.mileage,
      vin: values.vin || undefined,
      plate: values.plate || undefined,
      listingUrl: values.listingUrl || undefined,
      listingSource: values.listingSource || undefined,
      documentsStatus: values.documentsStatus,
      keyCount: values.keyCount,
      accidentStatus: values.accidentStatus,
      accidentOutcomes: values.accidentOutcomes,
      accidentComment: values.accidentComment,
    },
    pricing: {
      askingPrice: values.askingPrice,
      expectedDiscount: values.expectedDiscount,
      actualPurchasePrice: values.actualPurchasePrice,
    },
    facts: [],
    eventOverrides: {},
    customEvents: [],
    templateId: values.templateId,
    inspectionLayout: adaptTimingElement(values.inspectionLayout, engineVariant(config, values)?.timingDrive ?? 'UNKNOWN'),
    configSnapshot: cloneConfig(config),
  };
}

export function makeCustomModel(): ModelProfile {
  return {
    id: `custom-model-${uid()}`,
    displayName: 'Новая модель',
    isBuiltIn: false,
    make: '',
    model: '',
    generation: '',
    engine: '',
    transmission: 'AT',
    engineVariants: [{ id: `variant-${uid()}`, label: 'Вариант двигателя', code: '', timingDrive: 'UNKNOWN', note: 'Уточните код двигателя и тип привода ГРМ.' }],
    consumptionLPer100Km: 9,
    taxAnnual: 2400,
    repairEventIds: [],
  };
}

export function makeCustomEvent(modelId: ModelId): RepairEvent {
  return { id: `custom-event-${uid()}`, modelIds: [modelId], category: 'other', name: 'Новая потенциальная работа', probability5y: 0.5, repairCost: 20000, coefficient: 1.2, maxCost: 30000, monthStart: 1, monthEnd: 60, mode: 'RISK' };
}

export function draftFromFact(fact: Fact | undefined): StageDraft {
  if (!fact) return { state: 'UNSET', details: '', cost: null, urgency: 'NOW', comment: '' };
  if (fact.kind === 'WORK') return { state: 'WORK', details: fact.description.split(': ').slice(1).join(': ') || fact.description, cost: fact.statedCost ?? null, urgency: fact.urgency, comment: fact.comment };
  return { state: fact.status === 'QUESTION' ? 'QUESTION' : 'GOOD', details: '', cost: null, urgency: fact.urgency, comment: fact.comment };
}
