import { makeInspection } from '../domain/factory';
import { adaptTimingElement } from '../domain/layout';
import { applicableTemplates, engineVariant, modelName } from '../domain/vehicle';
import { CLASSIC_INSPECTION_LAYOUT } from '../inspectionTemplates';
import type { AppConfig, BodyRisk, CategoryId, Fact, FactUrgency, Inspection, InspectionLayout, ModelProfile, VehicleInfo } from '../types';

export type ListingState = 'GOOD' | 'WORK' | 'QUESTION';

export interface ListingFact {
  /** Название элемента осмотра из шаблона, например «Левый порог». Регистр и «ё» не важны. */
  element: string;
  state: ListingState;
  /** Что сделать — только для WORK. Идёт в описание факта после названия элемента. */
  details?: string;
  cost?: number | null;
  urgency?: FactUrgency;
  comment?: string;
  bodyRisks?: BodyRisk[];
}

export interface ListingCar {
  /** Ссылка на объявление. Служит ключом: повторный прогон того же URL не создаёт дубль. */
  url: string;
  /** Заголовок объявления. Нужен для отчёта в консоли. */
  title?: string;
  /** Идентификатор модели из конфигурации либо её название («Toyota Corolla»). */
  model?: string;
  engineVariant?: string;
  templateId?: string;
  year?: number;
  mileage?: number;
  askingPrice?: number;
  expectedDiscount?: number;
  actualPurchasePrice?: number;
  vin?: string;
  plate?: string;
  source?: string;
  documentsStatus?: VehicleInfo['documentsStatus'];
  keyCount?: number;
  accidentStatus?: VehicleInfo['accidentStatus'];
  accidentOutcomes?: string[];
  accidentComment?: string;
  facts?: ListingFact[];
}

export interface ListingBatch {
  /** Площадка: подставляется в объявления, где источник не указан отдельно. */
  source?: string;
  /** Значения по умолчанию для всех объявлений пачки. Поля самого объявления сильнее. */
  defaults?: Partial<ListingCar>;
  cars: ListingCar[];
}

export interface ScreeningReport {
  inspections: Inspection[];
  added: Inspection[];
  merged: Inspection[];
  skipped: string[];
}

export class ListingError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(problems.join('\n'));
    this.name = 'ListingError';
    this.problems = problems;
  }
}

const URGENCIES: FactUrgency[] = ['NOW', 'SOON', 'PLANNED', 'OPTIONAL'];
const DOCUMENTS: NonNullable<VehicleInfo['documentsStatus']>[] = ['ORIGINAL', 'DUPLICATE_WITH_ORIGINAL', 'DUPLICATE_WITHOUT_ORIGINAL', 'UNKNOWN'];
const ACCIDENTS: NonNullable<VehicleInfo['accidentStatus']>[] = ['NO', 'YES', 'UNKNOWN'];
const BODY_RISKS: BodyRisk[] = ['structural_corrosion', 'longerons', 'strut_towers', 'weak_sills', 'floor', 'suspension_mounts', 'geometry', 'major_crash', 'large_welding', 'unestimable_scope'];
const TIMING_ELEMENTS = ['Ремень ГРМ и ролики', 'Цепь ГРМ и натяжитель', 'ГРМ: уточнить тип и состояние'];

const key = (value: string): string => value.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');

/** Avito и Дром дописывают к ссылке контекст показа: он меняется от захода к заходу и ключом быть не может. */
export function listingKey(url: string): string {
  return url.trim().split('#')[0].split('?')[0].replace(/\/+$/, '').toLowerCase();
}

interface ElementSlot { stageId: string; stageLabel: string; blockId: string; category: CategoryId; subcategory: string; element: string }

function elementIndex(layout: InspectionLayout): Map<string, ElementSlot[]> {
  const index = new Map<string, ElementSlot[]>();
  const add = (alias: string, slot: ElementSlot) => index.set(alias, [...(index.get(alias) ?? []), slot]);
  for (const stage of layout) {
    for (const block of stage.blocks) {
      for (const element of block.elements) {
        const slot: ElementSlot = { stageId: stage.id, stageLabel: stage.label, blockId: block.id, category: block.category, subcategory: block.subcategory, element };
        add(key(element), slot);
        add(`${stage.id}|${key(element)}`, slot);
        // Название элемента ГРМ зависит от привода и подставляется при создании осмотра,
        // поэтому в пачке допустимо любое из трёх: элемент всё равно один и тот же.
        if (TIMING_ELEMENTS.includes(element)) for (const alias of TIMING_ELEMENTS) if (alias !== element) add(key(alias), slot);
      }
    }
  }
  return index;
}

function suggest(index: Map<string, ElementSlot[]>, wanted: string): string {
  const words = key(wanted).split(' ').filter((word) => word.length > 3);
  const near = [...new Set([...index.values()].flat().map((slot) => slot.element))].filter((element) => words.some((word) => key(element).includes(word))).slice(0, 5);
  return near.length ? ` Похожие элементы: ${near.join(', ')}.` : '';
}

interface Rejected { error: string }

const rejected = (value: unknown): value is Rejected => typeof value === 'object' && value !== null && 'error' in value;

function resolveModel(config: AppConfig, wanted: string | undefined): ModelProfile | Rejected {
  const list = config.models.map((model) => `${model.id} (${modelName(config, model.id)})`).join(', ');
  if (!wanted?.trim()) return { error: `не указана модель (model). Доступны: ${list}` };
  const exact = config.models.find((model) => model.id === wanted.trim());
  if (exact) return exact;
  const text = key(wanted);
  const byName = config.models.find((model) => key(`${model.make} ${model.model}`).includes(text) || text.includes(key(`${model.make} ${model.model}`)) || key(model.displayName ?? '') === text);
  return byName ?? { error: `модель «${wanted}» не найдена. Доступны: ${list}` };
}

function resolveVariant(model: ModelProfile, wanted: string | undefined): string | Rejected {
  const fallback = (model.engineVariants.find((item) => item.id === 'unknown') ?? model.engineVariants[0]).id;
  if (!wanted?.trim()) return fallback;
  const text = key(wanted);
  const found = model.engineVariants.find((variant) => variant.id === wanted.trim() || key(variant.code) === text || key(variant.label).includes(text));
  return found ? found.id : { error: `вариант двигателя «${wanted}» не найден у модели ${model.id}. Доступны: ${model.engineVariants.map((variant) => variant.id).join(', ')}` };
}

function checkEnum<T extends string>(value: string | undefined, allowed: T[], field: string, problems: string[], where: string): T | undefined {
  if (value === undefined) return undefined;
  if ((allowed as string[]).includes(value)) return value as T;
  problems.push(`${where}: ${field} = «${value}», допустимо: ${allowed.join(', ')}.`);
  return undefined;
}

/**
 * Собирает осмотры первого этапа из выгрузки объявлений.
 * Факты пишутся ровно так же, как их пишет экран осмотра: та же привязка к этапу,
 * блоку и элементу и тот же формат описания. Иначе приложение считало бы элемент
 * непроверенным и не показало бы его состояние в журнале.
 */
export function buildScreening(config: AppConfig, existing: Inspection[], batch: ListingBatch, options: { merge?: boolean } = {}): ScreeningReport {
  if (!Array.isArray(batch.cars)) throw new ListingError(['В пачке объявлений нет массива cars.']);
  const problems: string[] = [];
  const byUrl = new Map(existing.filter((inspection) => inspection.vehicle.listingUrl).map((inspection) => [listingKey(inspection.vehicle.listingUrl!), inspection]));
  const seen = new Set<string>();
  const report: ScreeningReport = { inspections: [...existing], added: [], merged: [], skipped: [] };

  batch.cars.forEach((raw, position) => {
    const car: ListingCar = { ...batch.defaults, ...raw };
    const label = car.title ?? car.url ?? `№${position + 1}`;
    const where = `Объявление ${label}`;
    if (!car.url?.trim()) { problems.push(`${where}: не указана ссылка (url).`); return; }
    const url = listingKey(car.url);
    if (seen.has(url)) { problems.push(`${where}: ссылка встречается в пачке дважды.`); return; }
    seen.add(url);

    const model = resolveModel(config, car.model);
    if (rejected(model)) { problems.push(`${where}: ${model.error}`); return; }
    const variantId = resolveVariant(model, car.engineVariant);
    if (rejected(variantId)) { problems.push(`${where}: ${variantId.error}`); return; }

    for (const [field, value] of [['year', car.year], ['mileage', car.mileage], ['askingPrice', car.askingPrice]] as const) {
      if (typeof value !== 'number' || !Number.isFinite(value)) problems.push(`${where}: не указано число в поле ${field}.`);
    }
    const documentsStatus = checkEnum(car.documentsStatus, DOCUMENTS, 'documentsStatus', problems, where) ?? 'UNKNOWN';
    const accidentStatus = checkEnum(car.accidentStatus, ACCIDENTS, 'accidentStatus', problems, where) ?? 'UNKNOWN';

    const previous = byUrl.get(url);
    if (previous && !options.merge) { report.skipped.push(label); return; }

    const templates = config.templates ?? [];
    const template = car.templateId ? templates.find((item) => item.id === car.templateId) : applicableTemplates(config, model.id, variantId)[0];
    if (car.templateId && !template) problems.push(`${where}: шаблон «${car.templateId}» не найден в конфигурации.`);
    const draft = previous ?? makeInspection(config, {
      modelId: model.id, engineVariantId: variantId,
      year: car.year ?? 0, mileage: car.mileage ?? 0,
      askingPrice: car.askingPrice ?? 0, expectedDiscount: car.expectedDiscount ?? 0, actualPurchasePrice: car.actualPurchasePrice,
      vin: car.vin ?? '', plate: car.plate ?? '',
      listingUrl: car.url.trim(), listingSource: car.source ?? batch.source ?? '',
      documentsStatus, keyCount: car.keyCount,
      accidentStatus, accidentOutcomes: car.accidentOutcomes ?? [], accidentComment: car.accidentComment ?? '',
      templateId: template?.id,
      inspectionLayout: template?.layout ?? CLASSIC_INSPECTION_LAYOUT,
    });

    const layout = draft.inspectionLayout ?? adaptTimingElement(CLASSIC_INSPECTION_LAYOUT, engineVariant(config, draft.vehicle).timingDrive);
    const index = elementIndex(layout);
    const listingFacts = car.facts ?? [];
    const now = new Date().toISOString();
    const touched = new Set<string>();
    const kept = previous ? previous.facts.filter((fact) => !listingFacts.some((item) => key(item.element) === key(fact.elementId ?? ''))) : [];
    let sequence = Math.max(0, ...kept.map((fact) => fact.sequence));
    const added = listingFacts.flatMap<Fact>((listingFact) => {
      const slots = index.get(key(listingFact.element)) ?? [];
      if (slots.length === 0) { problems.push(`${where}: элемента «${listingFact.element}» нет в шаблоне осмотра.${suggest(index, listingFact.element)}`); return []; }
      if (slots.length > 1) { problems.push(`${where}: элемент «${listingFact.element}» встречается в шаблоне ${slots.length} раза, уточните как «${slots[0].stageId}|${listingFact.element}».`); return []; }
      const slot = slots[0];
      if (touched.has(slot.element)) { problems.push(`${where}: элемент «${slot.element}» указан дважды.`); return []; }
      touched.add(slot.element);
      if (!checkEnum(listingFact.state, ['GOOD', 'WORK', 'QUESTION'], 'state', problems, where)) return [];
      const urgency = checkEnum(listingFact.urgency, URGENCIES, 'urgency', problems, where) ?? 'NOW';
      const risks = (listingFact.bodyRisks ?? []).filter((risk) => checkEnum(risk, BODY_RISKS, 'bodyRisks', problems, where));
      const isWork = listingFact.state === 'WORK';
      const existingFact = previous?.facts.find((fact) => key(fact.elementId ?? '') === key(slot.element));
      sequence += 1;
      return [{
        id: existingFact?.id ?? `${url.split('/').pop() ?? 'listing'}-${slot.blockId}-${sequence}`,
        sequence,
        kind: isWork ? 'WORK' : 'CONDITION',
        category: slot.category,
        subcategory: slot.subcategory,
        description: isWork
          ? `${slot.element}: ${listingFact.details?.trim() || 'требует ремонта'}`
          : `${slot.element}: ${listingFact.state === 'GOOD' ? 'исправно' : 'требует проверки'}`,
        statedCost: isWork ? listingFact.cost ?? undefined : undefined,
        urgency: isWork ? urgency : 'NOW',
        status: listingFact.state === 'QUESTION' ? 'QUESTION' : 'CONFIRMED',
        comment: listingFact.comment?.trim() ?? '',
        bodyRisks: risks,
        group: slot.stageLabel,
        stageId: slot.stageId,
        blockId: slot.blockId,
        elementId: slot.element,
        createdAt: existingFact?.createdAt ?? now,
        updatedAt: now,
      }];
    });

    const inspection: Inspection = {
      ...draft,
      updatedAt: now,
      vehicle: {
        ...draft.vehicle,
        year: car.year ?? draft.vehicle.year,
        mileage: car.mileage ?? draft.vehicle.mileage,
        vin: car.vin ?? draft.vehicle.vin,
        plate: car.plate ?? draft.vehicle.plate,
        listingSource: car.source ?? batch.source ?? draft.vehicle.listingSource,
        documentsStatus: car.documentsStatus ?? draft.vehicle.documentsStatus,
        keyCount: car.keyCount ?? draft.vehicle.keyCount,
        accidentStatus: car.accidentStatus ?? draft.vehicle.accidentStatus,
        accidentOutcomes: car.accidentOutcomes ?? draft.vehicle.accidentOutcomes,
        accidentComment: car.accidentComment ?? draft.vehicle.accidentComment,
      },
      pricing: {
        ...draft.pricing,
        askingPrice: car.askingPrice ?? draft.pricing.askingPrice,
        expectedDiscount: car.expectedDiscount ?? draft.pricing.expectedDiscount,
        actualPurchasePrice: car.actualPurchasePrice ?? draft.pricing.actualPurchasePrice,
      },
      facts: [...kept, ...added].sort((left, right) => left.sequence - right.sequence),
    };

    if (previous) {
      report.inspections = report.inspections.map((item) => item.id === previous.id ? inspection : item);
      report.merged.push(inspection);
    } else {
      report.inspections = [inspection, ...report.inspections];
      report.added.push(inspection);
    }
  });

  if (problems.length > 0) throw new ListingError(problems);
  return report;
}
