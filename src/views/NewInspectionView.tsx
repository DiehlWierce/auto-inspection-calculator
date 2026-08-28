import { useState } from 'react';
import type { FormEvent } from 'react';
import { money } from '../utils';
import { MoneyInput, NumberInput } from '../ui/NumberInput';
import { INSPECTION_STAGES } from '../domain/layout';
import { ACCIDENT_OUTCOME_LABELS, DOCUMENT_LABELS } from '../domain/labels';
import { makeInspection } from '../domain/factory';
import { applicableTemplates, modelName, modelProfile } from '../domain/vehicle';
import { Field, FormSection } from '../ui/primitives';
import type { AppConfig, Inspection, ModelId, VehicleInfo } from '../types';

export function NewInspectionView({ config, onCancel, onCreate }: { config: AppConfig; onCancel: () => void; onCreate: (inspection: Inspection) => void }) {
  const [modelId, setModelId] = useState<ModelId>('corolla-e120');
  const [engineVariantId, setEngineVariantId] = useState('3zz-fe');
  const [year, setYear] = useState(2006);
  const [mileage, setMileage] = useState(240000);
  const [asking, setAsking] = useState(390000);
  const [discount, setDiscount] = useState(20000);
  const [actual, setActual] = useState<number | null>(null);
  const [vin, setVin] = useState('');
  const [plate, setPlate] = useState('');
  const [url, setUrl] = useState('');
  const [source, setSource] = useState('Avito');
  const [documentsStatus, setDocumentsStatus] = useState<NonNullable<VehicleInfo['documentsStatus']>>('UNKNOWN');
  const [keyCount, setKeyCount] = useState<number | null>(null);
  const [accidentStatus, setAccidentStatus] = useState<NonNullable<VehicleInfo['accidentStatus']>>('UNKNOWN');
  const [accidentOutcomes, setAccidentOutcomes] = useState<string[]>([]);
  const [accidentComment, setAccidentComment] = useState('');
  const [templateId, setTemplateId] = useState('classic-corolla');
  const selectedModel = modelProfile(config, modelId);
  const selectedVariant = selectedModel.engineVariants.find((variant) => variant.id === engineVariantId) ?? selectedModel.engineVariants[0];
  const availableTemplates = applicableTemplates(config, modelId, engineVariantId);
  const selectedTemplate = availableTemplates.find((template) => template.id === templateId) ?? availableTemplates[0];
  const changeModel = (nextModelId: ModelId) => {
    const nextModel = modelProfile(config, nextModelId);
    setModelId(nextModelId);
    setEngineVariantId(nextModel.engineVariants[0]?.id ?? 'unknown');
    setTemplateId(applicableTemplates(config, nextModelId, nextModel.engineVariants[0]?.id)[0]?.id ?? '');
  };
  const toggleOutcome = (outcome: string) => setAccidentOutcomes((current) => current.includes(outcome) ? current.filter((item) => item !== outcome) : [...current, outcome]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onCreate(makeInspection(config, { modelId, engineVariantId, year, mileage, askingPrice: asking, expectedDiscount: discount, actualPurchasePrice: actual ?? undefined, vin, plate, listingUrl: url, listingSource: source, documentsStatus, keyCount: keyCount ?? undefined, accidentStatus, accidentOutcomes, accidentComment, templateId: selectedTemplate?.id, inspectionLayout: selectedTemplate?.layout ?? INSPECTION_STAGES }));
  };

  return <section className="page-section narrow-page">
    <div className="page-heading"><div><p className="eyebrow">ШАГ 1 / АВТОМОБИЛЬ</p><h1>Новый осмотр</h1><p className="muted">Выберите автомобиль из фиксированного пула и укажите цену сценария.</p></div><button className="ghost-button" onClick={onCancel}>Отмена</button></div>
    <form className="form-card" onSubmit={submit}>
      <FormSection title="Автомобиль">
        <div className="model-picker">{config.models.map((model) => <button type="button" key={model.id} className={`model-option ${model.id === modelId ? 'selected' : ''}`} onClick={() => changeModel(model.id)}><span className="model-radio"></span><span><strong>{modelName(config, model.id)}</strong><small>{model.engine} · {model.transmission} · демо-расход {model.consumptionLPer100Km} л/100 км</small></span></button>)}</div>
        <div className="form-grid four"><Field label="Год"><NumberInput min={1980} max={2030} step={1} value={year} onCommit={(value) => setYear(value ?? 0)} /></Field><Field label="Пробег, км"><NumberInput min={0} step={1000} value={mileage} onCommit={(value) => setMileage(value ?? 0)} /></Field><Field label="Источник"><input value={source} onChange={(event) => setSource(event.target.value)} placeholder="Avito" /></Field><Field label="Двигатель и ГРМ"><select value={engineVariantId} onChange={(event) => setEngineVariantId(event.target.value)}>{selectedModel.engineVariants.map((variant) => <option key={variant.id} value={variant.id}>{variant.label}</option>)}</select></Field></div>
        {selectedVariant?.note && <p className="field-note">{selectedVariant.note}</p>}
      </FormSection>
      <FormSection title="Шаблон осмотра">
        {availableTemplates.length > 0 ? <><Field label="Набор этапов и элементов"><select value={selectedTemplate?.id ?? ''} onChange={(event) => setTemplateId(event.target.value)}>{availableTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></Field><p className="field-note">{selectedTemplate?.description} Можно изменить структуру уже внутри осмотра.</p></> : <p className="field-note">Для этой модели пока нет сохранённого шаблона. Будет использован классический набор этапов, который можно настроить вручную.</p>}
      </FormSection>
      <FormSection title="Цена и объявление">
        <div className="form-grid three"><Field label="Цена объявления, ₽" hint={`Фильтр: ${money(config.maxAskingPrice)}`}><MoneyInput value={asking} onCommit={(value) => setAsking(value ?? 0)} required /></Field><Field label="Ожидаемый торг, ₽"><MoneyInput value={discount} onCommit={(value) => setDiscount(value ?? 0)} /></Field><Field label="Фактическая цена, ₽" hint="Необязательно"><MoneyInput allowEmpty value={actual} onCommit={setActual} placeholder="Пока неизвестна" /></Field></div>
        <div className="form-grid two"><Field label="VIN"><input value={vin} onChange={(event) => setVin(event.target.value)} /></Field><Field label="Госномер"><input value={plate} onChange={(event) => setPlate(event.target.value)} /></Field></div><Field label="Ссылка на объявление"><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" /></Field>
        <div className="form-grid three"><Field label="Документы"><select value={documentsStatus} onChange={(event) => setDocumentsStatus(event.target.value as NonNullable<VehicleInfo['documentsStatus']>)}>{Object.entries(DOCUMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Количество ключей"><NumberInput allowEmpty min={0} max={5} step={1} value={keyCount} onCommit={setKeyCount} placeholder="Неизвестно" /></Field><Field label="История ДТП"><select value={accidentStatus} onChange={(event) => setAccidentStatus(event.target.value as NonNullable<VehicleInfo['accidentStatus']>)}><option value="NO">Не было</option><option value="YES">Было</option><option value="UNKNOWN">Неизвестно</option></select></Field></div>
        {accidentStatus === 'YES' && <><div className="risk-picker"><span className="field-label">Результаты ДТП</span><div className="check-grid">{Object.entries(ACCIDENT_OUTCOME_LABELS).map(([outcome, label]) => <label key={outcome} className="check-item"><input type="checkbox" checked={accidentOutcomes.includes(outcome)} onChange={() => toggleOutcome(outcome)} />{label}</label>)}</div></div><Field label="Комментарий по ДТП"><textarea rows={2} value={accidentComment} onChange={(event) => setAccidentComment(event.target.value)} /></Field></>}
      </FormSection>
      <div className="form-actions"><button type="button" className="ghost-button" onClick={onCancel}>Назад</button><button type="submit" className="primary-button">Начать осмотр →</button></div>
    </form>
  </section>;
}
