import { CATEGORIES, cloneConfig, modelLabel } from '../config';
import { CLASSIC_INSPECTION_LAYOUT } from '../inspectionTemplates';
import { uid } from '../utils';
import type {
  AppConfig,
  BodyRisk,
  CategoryId,
  FactKind,
  FactStatus,
  FactUrgency,
  InspectionBlockConfig,
  InspectionLayout,
  InspectionStageConfig,
  Inspection,
  InspectionTemplate,
  ModelId,
  TimingDrive,
  VehicleInfo,
} from '../types';

export type InspectionStageId = string;
export type StageElementState = 'UNSET' | 'GOOD' | 'WORK' | 'QUESTION';
export type InspectionStageBlock = InspectionBlockConfig;
export type InspectionStage = InspectionStageConfig;

export interface StageDraft {
  state: StageElementState;
  details: string;
  cost: string;
  urgency: FactUrgency;
  comment: string;
}

export const INSPECTION_STAGES: InspectionStage[] = CLASSIC_INSPECTION_LAYOUT;

export function modelProfile(config: AppConfig, modelId: ModelId) {
  return config.models.find((model) => model.id === modelId) ?? config.models[0];
}

export function modelName(config: AppConfig, modelId: ModelId): string {
  const profile = config.models.find((model) => model.id === modelId);
  if (profile?.displayName?.trim()) return profile.displayName.trim();
  const known = modelLabel(modelId);
  if (known && known !== modelId) return known;
  return (
    [profile?.make, profile?.model, profile?.generation, profile?.engine, profile?.transmission]
      .filter(Boolean)
      .join(' ') || modelId
  );
}

export function applicableTemplates(
  config: AppConfig,
  modelId: ModelId,
  engineVariantId?: string,
): InspectionTemplate[] {
  const modelTemplates = (config.templates ?? []).filter((template) => template.modelIds.includes(modelId));
  const exact = modelTemplates.filter(
    (template) =>
      !template.engineVariantIds?.length || !engineVariantId || template.engineVariantIds.includes(engineVariantId),
  );
  return exact.length > 0 ? exact : modelTemplates.filter((template) => !template.engineVariantIds?.length);
}

export function engineVariant(config: AppConfig, vehicle: Pick<VehicleInfo, 'modelId' | 'engineVariantId'>) {
  const model = modelProfile(config, vehicle.modelId);
  return (
    model.engineVariants.find((variant) => variant.id === vehicle.engineVariantId) ??
    model.engineVariants.find((variant) => variant.id === 'unknown') ??
    model.engineVariants[0]
  );
}

export function cloneLayout(layout: InspectionLayout): InspectionLayout {
  return JSON.parse(JSON.stringify(layout)) as InspectionLayout;
}

export const TIMING_ELEMENT_LABELS: Record<TimingDrive, string> = {
  CHAIN: 'Цепь ГРМ и натяжитель',
  BELT: 'Ремень ГРМ и ролики',
  UNKNOWN: 'ГРМ: уточнить тип и состояние',
};

/** Элемент формы считается «про ГРМ», если в его названии есть это слово. */
const TIMING_ELEMENT_MARKER = /ГРМ/i;

/**
 * Подставляет в форму осмотра правильный элемент ГРМ: цепь, ремень или «уточнить».
 *
 * Поиск идёт по вхождению слова «ГРМ», а не по точному совпадению строки:
 * пользователь может переименовать элемент в редакторе формы, и адаптация
 * не должна из-за этого молча перестать работать.
 */
export function adaptTimingElement(layout: InspectionLayout, timingDrive: TimingDrive): InspectionLayout {
  const timingLabel = TIMING_ELEMENT_LABELS[timingDrive] ?? TIMING_ELEMENT_LABELS.UNKNOWN;
  return cloneLayout(layout).map((stage) => ({
    ...stage,
    blocks: stage.blocks.map((block) => ({
      ...block,
      elements: block.elements.map((element) => (TIMING_ELEMENT_MARKER.test(element) ? timingLabel : element)),
    })),
  }));
}

export function blankFact(categoryId: CategoryId = 'suspension') {
  const category = CATEGORIES.find((item) => item.id === categoryId)!;
  return {
    kind: 'WORK' as FactKind,
    category,
    subcategory: category.subcategories[0],
    description: '',
    statedCost: '',
    urgency: 'NOW' as FactUrgency,
    status: 'CONFIRMED' as FactStatus,
    comment: '',
    group: '',
    bodyRisks: [] as BodyRisk[],
  };
}

export function makeInspection(
  config: AppConfig,
  values: {
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
  },
): Inspection {
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
    inspectionLayout: adaptTimingElement(
      values.inspectionLayout,
      engineVariant(config, values)?.timingDrive ?? 'UNKNOWN',
    ),
    configSnapshot: cloneConfig(config),
  };
}
