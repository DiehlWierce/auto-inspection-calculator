import { CLASSIC_INSPECTION_LAYOUT } from '../inspectionTemplates';
import type { Fact, FactUrgency, InspectionBlockConfig, InspectionLayout, InspectionStageConfig, TimingDrive } from '../types';

export type InspectionStageId = string;

export type StageElementState = 'UNSET' | 'GOOD' | 'WORK' | 'QUESTION';

export type InspectionStageBlock = InspectionBlockConfig;

export type InspectionStage = InspectionStageConfig;

export interface StageDraft {
  state: StageElementState;
  details: string;
  cost: number | null;
  urgency: FactUrgency;
  comment: string;
}

export const INSPECTION_STAGES: InspectionStage[] = CLASSIC_INSPECTION_LAYOUT;

export function cloneLayout(layout: InspectionLayout): InspectionLayout {
  return JSON.parse(JSON.stringify(layout)) as InspectionLayout;
}

export function adaptTimingElement(layout: InspectionLayout, timingDrive: TimingDrive): InspectionLayout {
  const timingLabel = timingDrive === 'CHAIN'
    ? 'Цепь ГРМ и натяжитель'
    : timingDrive === 'BELT'
      ? 'Ремень ГРМ и ролики'
      : 'ГРМ: уточнить тип и состояние';
  return cloneLayout(layout).map((stage) => ({
    ...stage,
    blocks: stage.blocks.map((block) => ({
      ...block,
      elements: block.elements.map((element) => ['Ремень ГРМ и ролики', 'Цепь ГРМ и натяжитель', 'ГРМ: уточнить тип и состояние'].includes(element) ? timingLabel : element),
    })),
  }));
}

export function stageHasFact(facts: Fact[], stage: InspectionStage, element: string): Fact | undefined {
  return facts.find((fact) => fact.stageId === stage.id && fact.elementId === element)
    ?? facts.find((fact) => fact.group === stage.label && fact.description.startsWith(`${element}:`));
}
