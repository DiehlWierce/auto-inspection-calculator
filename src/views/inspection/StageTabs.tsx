import { stageHasFact } from '../../domain/layout';
import type { InspectionStage } from '../../domain/layout';
import type { Fact } from '../../types';

export function StageTab({ stage, index, facts, active, onClick }: { stage: InspectionStage; index: number; facts: Fact[]; active: boolean; onClick: () => void }) {
  const total = stage.blocks.reduce((sum, block) => sum + block.elements.length, 0);
  const completed = stage.blocks.reduce((sum, block) => sum + block.elements.filter((element) => stageHasFact(facts, stage, element)).length, 0);
  return <button className={`stage-tab ${active ? 'active' : ''} ${completed > 0 ? 'started' : ''}`} onClick={onClick}><span className="stage-index">{String(index + 1).padStart(2, '0')}</span><span><strong>{stage.label}</strong><small>{completed}/{total} элементов</small></span></button>;
}
