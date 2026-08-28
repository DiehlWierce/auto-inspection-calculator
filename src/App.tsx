import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { CATEGORIES, DEFAULT_CONFIG, cloneConfig, modelLabel } from './config';
import { calculateInspection, categoryName } from './calculator';
import { CLASSIC_INSPECTION_LAYOUT } from './inspectionTemplates';
import { loadConfig, saveConfig } from './storage/config';
import { deleteInspection, loadInspections, saveInspection } from './storage/inspections';
import { normalizeConfig } from './storage/normalize';
import { downloadText, formatDate, money, numberValue, percent, uid } from './utils';
import type {
  AppConfig,
  BodyRisk,
  CategoryId,
  Fact,
  FactKind,
  FactStatus,
  FactUrgency,
  InspectionBlockConfig,
  InspectionLayout,
  InspectionStageConfig,
  Inspection,
  InspectionTemplate,
  ModelId,
  ModelProfile,
  RepairEvent,
  TimingDrive,
  View,
  VehicleInfo,
} from './types';

const BODY_RISK_LABELS: Record<BodyRisk, string> = {
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

const URGENCY_LABELS: Record<FactUrgency, string> = {
  NOW: 'Сразу',
  SOON: 'В ближайшее время',
  PLANNED: 'Планово',
  OPTIONAL: 'Желательно',
};

const conditionOptions = ['Исправно', 'Неисправно', 'Неизвестно', 'Требует проверки'];

type InspectionStageId = string;
type StageElementState = 'UNSET' | 'GOOD' | 'WORK' | 'QUESTION';
type InspectionStageBlock = InspectionBlockConfig;
type InspectionStage = InspectionStageConfig;

interface StageDraft {
  state: StageElementState;
  details: string;
  cost: string;
  urgency: FactUrgency;
  comment: string;
}

const INSPECTION_STAGES: InspectionStage[] = CLASSIC_INSPECTION_LAYOUT;

const RATING_WEIGHT_LABELS: Record<keyof AppConfig['ratingWeights'], string> = {
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

const DOCUMENT_LABELS = {
  ORIGINAL: 'Оригинал ПТС',
  DUPLICATE_WITH_ORIGINAL: 'Дубликат с оригиналом',
  DUPLICATE_WITHOUT_ORIGINAL: 'Дубликат без оригинала',
  UNKNOWN: 'Не проверено',
} as const;

const ACCIDENT_OUTCOME_LABELS: Record<string, string> = {
  geometry_change: 'Изменение геометрии',
  local_welding: 'Локальная сварка',
  straightening: 'Рихтовка',
  paintwork: 'Окрасы',
  structural_repair: 'Ремонт силовых элементов',
  airbag: 'Срабатывание подушек',
  unknown_extent: 'Объём ДТП неизвестен',
};

const TIMING_DRIVE_LABELS: Record<TimingDrive, string> = {
  CHAIN: 'Цепь ГРМ',
  BELT: 'Ремень ГРМ',
  UNKNOWN: 'ГРМ не определён',
};

function modelProfile(config: AppConfig, modelId: ModelId) {
  return config.models.find((model) => model.id === modelId) ?? config.models[0];
}

function modelName(config: AppConfig, modelId: ModelId): string {
  const profile = config.models.find((model) => model.id === modelId);
  if (profile?.displayName?.trim()) return profile.displayName.trim();
  const known = modelLabel(modelId);
  if (known && known !== modelId) return known;
  return [profile?.make, profile?.model, profile?.generation, profile?.engine, profile?.transmission]
    .filter(Boolean)
    .join(' ') || modelId;
}

function applicableTemplates(config: AppConfig, modelId: ModelId, engineVariantId?: string): InspectionTemplate[] {
  const modelTemplates = (config.templates ?? []).filter((template) => template.modelIds.includes(modelId));
  const exact = modelTemplates.filter((template) => !template.engineVariantIds?.length || !engineVariantId || template.engineVariantIds.includes(engineVariantId));
  return exact.length > 0 ? exact : modelTemplates.filter((template) => !template.engineVariantIds?.length);
}

function engineVariant(config: AppConfig, vehicle: Pick<VehicleInfo, 'modelId' | 'engineVariantId'>) {
  const model = modelProfile(config, vehicle.modelId);
  return model.engineVariants.find((variant) => variant.id === vehicle.engineVariantId)
    ?? model.engineVariants.find((variant) => variant.id === 'unknown')
    ?? model.engineVariants[0];
}

function cloneLayout(layout: InspectionLayout): InspectionLayout {
  return JSON.parse(JSON.stringify(layout)) as InspectionLayout;
}

function adaptTimingElement(layout: InspectionLayout, timingDrive: TimingDrive): InspectionLayout {
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

function blankFact(categoryId: CategoryId = 'suspension') {
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

function makeInspection(config: AppConfig, values: {
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

function statusText(status: string): string {
  if (status === 'VALID') return 'Расчёт полный';
  if (status === 'BLOCKED') return 'Есть блокирующие риски';
  return 'Расчёт предварительный';
}

function zoneText(zone: string): string {
  if (zone === 'GREEN') return 'Зелёная зона';
  if (zone === 'YELLOW') return 'Жёлтая зона';
  if (zone === 'FILTER_FAIL') return 'Фильтр не пройден';
  return 'Красная зона';
}

function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<View>('history');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([loadConfig(), loadInspections()]).then(([loadedConfig, loadedInspections]) => {
      setConfig(loadedConfig);
      setInspections(loadedInspections);
      setLoading(false);
    }).catch(() => {
      setConfig(cloneConfig(DEFAULT_CONFIG));
      setLoading(false);
    });
  }, []);

  const active = inspections.find((inspection) => inspection.id === activeId) ?? null;

  const updateInspection = (next: Inspection) => {
    const saved = { ...next, updatedAt: new Date().toISOString() };
    setInspections((items) => items.map((item) => item.id === saved.id ? saved : item));
    void saveInspection(saved);
  };

  const createInspection = (next: Inspection) => {
    setInspections((items) => [next, ...items]);
    setActiveId(next.id);
    setView('inspection');
    void saveInspection(next);
  };

  const removeInspection = (id: string) => {
    if (!window.confirm('Удалить этот осмотр? Действие нельзя отменить.')) return;
    setInspections((items) => items.filter((item) => item.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setView('history');
    }
    void deleteInspection(id);
  };

  const updateConfig = (updater: (current: AppConfig) => AppConfig) => {
    setConfig((current) => {
      if (!current) return current;
      const next = updater(cloneConfig(current));
      next.version = `manual-${Date.now()}`;
      void saveConfig(next);
      return next;
    });
  };

  const applyCurrentConfigToActive = () => {
    if (!active || !config) return;
    updateInspection({ ...active, configSnapshot: cloneConfig(config) });
  };

  const exportBackup = () => {
    if (!config) return;
    downloadText('автоосмотр-backup.json', JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), config, inspections }, null, 2));
  };

  const importBackup = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as { config?: AppConfig; inspections?: Inspection[] };
        if (parsed.config) {
          const normalizedConfig = normalizeConfig(parsed.config);
          setConfig(normalizedConfig);
          void saveConfig(normalizedConfig);
        }
        if (parsed.inspections) {
          const normalizedInspections = parsed.inspections.map((inspection) => ({
            ...inspection,
            configSnapshot: normalizeConfig(inspection.configSnapshot),
          }));
          setInspections(normalizedInspections);
          normalizedInspections.forEach((inspection) => void saveInspection(inspection));
        }
      } catch {
        window.alert('Не удалось прочитать резервную копию JSON.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  if (loading || !config) return <div className="loading-screen">Загрузка локального хранилища…</div>;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" onClick={() => setView('history')} role="button" tabIndex={0}>
          <span className="brand-mark">⌁</span>
          <span><strong>Автоосмотр</strong><small>детерминированный калькулятор</small></span>
        </div>
        <div className="topbar-actions">
          <label className="ghost-button compact">Импорт<input type="file" accept="application/json" onChange={importBackup} hidden /></label>
          <button className="ghost-button compact" onClick={exportBackup}>Экспорт</button>
        </div>
      </header>

      <main className="main-content">
        {view === 'history' && <HistoryView inspections={inspections} config={config} onOpen={(id) => { setActiveId(id); setView('inspection'); }} onNew={() => setView('new')} onDelete={removeInspection} />}
        {view === 'new' && <NewInspectionView config={config} onCancel={() => setView('history')} onCreate={createInspection} />}
        {view === 'inspection' && active && <InspectionView inspection={active} result={calculateInspection(active)} onUpdate={updateInspection} onNavigate={setView} />}
        {view === 'forecast' && active && <ForecastView inspection={active} result={calculateInspection(active)} onUpdate={updateInspection} onApplyConfig={applyCurrentConfigToActive} onBack={() => setView('inspection')} />}
        {view === 'compare' && <CompareView inspections={inspections} config={config} onOpen={(id) => { setActiveId(id); setView('inspection'); }} />}
        {view === 'settings' && <SettingsViewV2 config={config} active={active} onUpdate={updateConfig} onApplyActive={applyCurrentConfigToActive} />}
        {view === 'faq' && <FAQView />}
      </main>

      <nav className="bottom-nav">
        <NavItem icon="⌂" label="Осмотры" active={view === 'history' || view === 'new'} onClick={() => setView('history')} />
        <NavItem icon="▦" label="Сравнить" active={view === 'compare'} onClick={() => setView('compare')} />
        <NavItem icon="⚙" label="Настройки" active={view === 'settings'} onClick={() => setView('settings')} />
        <NavItem icon="?" label="FAQ" active={view === 'faq'} onClick={() => setView('faq')} />
      </nav>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}><span>{icon}</span>{label}</button>;
}

function HistoryView({ inspections, config, onOpen, onNew, onDelete }: { inspections: Inspection[]; config: AppConfig; onOpen: (id: string) => void; onNew: () => void; onDelete: (id: string) => void }) {
  return <section className="page-section">
    <div className="page-heading">
      <div><p className="eyebrow">LOCAL-FIRST / ОФЛАЙН</p><h1>Осмотры автомобилей</h1><p className="muted">Базовый каталог: Toyota Corolla E120, Kia Cerato LD и Chevrolet Lacetti Hatch. Можно добавлять свои модели.</p></div>
      <button className="primary-button" onClick={onNew}>＋ Новый осмотр</button>
    </div>
    <div className="info-strip"><span className="info-icon">i</span><span>Все расчёты выполняются локально. Текущая конфигурация: фонд <strong>{money(config.fund)}</strong>, лимит объявления <strong>{money(config.maxAskingPrice)}</strong>.</span></div>
    {inspections.length === 0 ? <EmptyState onNew={onNew} /> : <div className="inspection-grid">{inspections.map((inspection) => {
      const result = calculateInspection(inspection);
      return <InspectionCard key={inspection.id} inspection={inspection} result={result} config={config} onOpen={() => onOpen(inspection.id)} onDelete={() => onDelete(inspection.id)} />;
    })}</div>}
  </section>;
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return <div className="empty-state"><div className="empty-icon">⌁</div><h2>Осмотров пока нет</h2><p>Создайте карточку автомобиля и фиксируйте факты специалиста по одному.</p><button className="primary-button" onClick={onNew}>Начать первый осмотр</button></div>;
}

function InspectionCard({ inspection, result, config, onOpen, onDelete }: { inspection: Inspection; result: ReturnType<typeof calculateInspection>; config: AppConfig; onOpen: () => void; onDelete: () => void }) {
  return <article className="inspection-card" onClick={onOpen}>
    <div className="card-topline"><span className={`zone-dot ${result.zone.toLowerCase()}`}></span><span>{zoneText(result.zone)}</span><span className="card-date">{formatDate(inspection.updatedAt)}</span></div>
    <h2>{modelName(config, inspection.vehicle.modelId)}</h2>
    <p className="vehicle-meta">{inspection.vehicle.year || 'Год не указан'} · {inspection.vehicle.mileage.toLocaleString('ru-RU')} км · {inspection.facts.length} фактов</p>
    <div className="card-metrics"><Metric label="Цена расчёта" value={money(result.calculationPrice)} /><Metric label="Доведение" value={money(result.safeRestoreCost)} /><Metric label="Рейтинг" value={result.rating.score === null ? '—' : `${result.rating.score}/100`} /></div>
    <div className="card-bottom"><span className={`status-pill ${result.rating.status.toLowerCase()}`}>{statusText(result.rating.status)}</span><button className="icon-button" onClick={(event) => { event.stopPropagation(); onDelete(); }} aria-label="Удалить осмотр">×</button></div>
  </article>;
}

function NewInspectionView({ config, onCancel, onCreate }: { config: AppConfig; onCancel: () => void; onCreate: (inspection: Inspection) => void }) {
  const [modelId, setModelId] = useState<ModelId>('corolla-e120');
  const [engineVariantId, setEngineVariantId] = useState('3zz-fe');
  const [year, setYear] = useState(2006);
  const [mileage, setMileage] = useState(240000);
  const [asking, setAsking] = useState(390000);
  const [discount, setDiscount] = useState(20000);
  const [actual, setActual] = useState('');
  const [vin, setVin] = useState('');
  const [plate, setPlate] = useState('');
  const [url, setUrl] = useState('');
  const [source, setSource] = useState('Avito');
  const [documentsStatus, setDocumentsStatus] = useState<NonNullable<VehicleInfo['documentsStatus']>>('UNKNOWN');
  const [keyCount, setKeyCount] = useState('');
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
    onCreate(makeInspection(config, { modelId, engineVariantId, year, mileage, askingPrice: asking, expectedDiscount: discount, actualPurchasePrice: actual ? numberValue(actual) : undefined, vin, plate, listingUrl: url, listingSource: source, documentsStatus, keyCount: keyCount === '' ? undefined : numberValue(keyCount), accidentStatus, accidentOutcomes, accidentComment, templateId: selectedTemplate?.id, inspectionLayout: selectedTemplate?.layout ?? INSPECTION_STAGES }));
  };

  return <section className="page-section narrow-page">
    <div className="page-heading"><div><p className="eyebrow">ШАГ 1 / АВТОМОБИЛЬ</p><h1>Новый осмотр</h1><p className="muted">Выберите автомобиль из фиксированного пула и укажите цену сценария.</p></div><button className="ghost-button" onClick={onCancel}>Отмена</button></div>
    <form className="form-card" onSubmit={submit}>
      <FormSection title="Автомобиль">
        <div className="model-picker">{config.models.map((model) => <button type="button" key={model.id} className={`model-option ${model.id === modelId ? 'selected' : ''}`} onClick={() => changeModel(model.id)}><span className="model-radio"></span><span><strong>{modelName(config, model.id)}</strong><small>{model.engine} · {model.transmission} · демо-расход {model.consumptionLPer100Km} л/100 км</small></span></button>)}</div>
        <div className="form-grid four"><Field label="Год"><input type="number" min="1980" max="2030" value={year} onChange={(event) => setYear(numberValue(event.target.value))} /></Field><Field label="Пробег, км"><input type="number" min="0" value={mileage} onChange={(event) => setMileage(numberValue(event.target.value))} /></Field><Field label="Источник"><input value={source} onChange={(event) => setSource(event.target.value)} placeholder="Avito" /></Field><Field label="Двигатель и ГРМ"><select value={engineVariantId} onChange={(event) => setEngineVariantId(event.target.value)}>{selectedModel.engineVariants.map((variant) => <option key={variant.id} value={variant.id}>{variant.label}</option>)}</select></Field></div>
        {selectedVariant?.note && <p className="field-note">{selectedVariant.note}</p>}
      </FormSection>
      <FormSection title="Шаблон осмотра">
        {availableTemplates.length > 0 ? <><Field label="Набор этапов и элементов"><select value={selectedTemplate?.id ?? ''} onChange={(event) => setTemplateId(event.target.value)}>{availableTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></Field><p className="field-note">{selectedTemplate?.description} Можно изменить структуру уже внутри осмотра.</p></> : <p className="field-note">Для этой модели пока нет сохранённого шаблона. Будет использован классический набор этапов, который можно настроить вручную.</p>}
      </FormSection>
      <FormSection title="Цена и объявление">
        <div className="form-grid three"><Field label="Цена объявления, ₽" hint={`Фильтр: ${money(config.maxAskingPrice)}`}><input type="number" min="0" value={asking} onChange={(event) => setAsking(numberValue(event.target.value))} required /></Field><Field label="Ожидаемый торг, ₽"><input type="number" min="0" value={discount} onChange={(event) => setDiscount(numberValue(event.target.value))} /></Field><Field label="Фактическая цена, ₽" hint="Необязательно"><input type="number" min="0" value={actual} onChange={(event) => setActual(event.target.value)} placeholder="Пока неизвестна" /></Field></div>
        <div className="form-grid two"><Field label="VIN"><input value={vin} onChange={(event) => setVin(event.target.value)} /></Field><Field label="Госномер"><input value={plate} onChange={(event) => setPlate(event.target.value)} /></Field></div><Field label="Ссылка на объявление"><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" /></Field>
        <div className="form-grid three"><Field label="Документы"><select value={documentsStatus} onChange={(event) => setDocumentsStatus(event.target.value as NonNullable<VehicleInfo['documentsStatus']>)}>{Object.entries(DOCUMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Количество ключей"><input type="number" min="0" max="5" value={keyCount} onChange={(event) => setKeyCount(event.target.value)} placeholder="Неизвестно" /></Field><Field label="История ДТП"><select value={accidentStatus} onChange={(event) => setAccidentStatus(event.target.value as NonNullable<VehicleInfo['accidentStatus']>)}><option value="NO">Не было</option><option value="YES">Было</option><option value="UNKNOWN">Неизвестно</option></select></Field></div>
        {accidentStatus === 'YES' && <><div className="risk-picker"><span className="field-label">Результаты ДТП</span><div className="check-grid">{Object.entries(ACCIDENT_OUTCOME_LABELS).map(([outcome, label]) => <label key={outcome} className="check-item"><input type="checkbox" checked={accidentOutcomes.includes(outcome)} onChange={() => toggleOutcome(outcome)} />{label}</label>)}</div></div><Field label="Комментарий по ДТП"><textarea rows={2} value={accidentComment} onChange={(event) => setAccidentComment(event.target.value)} /></Field></>}
      </FormSection>
      <div className="form-actions"><button type="button" className="ghost-button" onClick={onCancel}>Назад</button><button type="submit" className="primary-button">Начать осмотр →</button></div>
    </form>
  </section>;
}

function InspectionView({ inspection, result, onUpdate, onNavigate }: { inspection: Inspection; result: ReturnType<typeof calculateInspection>; onUpdate: (inspection: Inspection) => void; onNavigate: (view: View) => void }) {
  const [showFreeForm, setShowFreeForm] = useState(false);
  const [showVehicleEditor, setShowVehicleEditor] = useState(false);
  const [showLayoutEditor, setShowLayoutEditor] = useState(false);
  const [criticalDismissed, setCriticalDismissed] = useState(false);
  const [activeStageId, setActiveStageId] = useState<InspectionStageId>('body');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(blankFact());
  const stages = inspection.inspectionLayout?.length ? inspection.inspectionLayout : adaptTimingElement(INSPECTION_STAGES, engineVariant(inspection.configSnapshot, inspection.vehicle).timingDrive);
  const activeStage = stages.find((stage) => stage.id === activeStageId) ?? stages[0];
  const hasCriticalPoint = result.zone === 'RED' || result.zone === 'FILTER_FAIL' || result.rating.hardBlocks.length > 0;

  const resetForm = () => { setForm(blankFact()); setEditingId(null); };
  const changeCategory = (category: CategoryId) => {
    const option = CATEGORIES.find((item) => item.id === category)!;
    setForm((current) => ({ ...current, category: option, subcategory: option.subcategories[0], group: category === 'body' ? 'Кузов' : category === 'interior' ? 'Салон' : current.group, bodyRisks: category === 'body' ? current.bodyRisks : [] }));
  };
  const toggleRisk = (risk: BodyRisk) => setForm((current) => ({ ...current, bodyRisks: current.bodyRisks.includes(risk) ? current.bodyRisks.filter((item) => item !== risk) : [...current.bodyRisks, risk] }));
  const upsertFact = (fact: Fact) => onUpdate({ ...inspection, facts: inspection.facts.some((item) => item.id === fact.id) ? inspection.facts.map((item) => item.id === fact.id ? fact : item) : [...inspection.facts, fact] });
  const saveFact = (event: FormEvent) => {
    event.preventDefault();
    if (!form.description.trim()) return;
    if (form.kind === 'WORK' && numberValue(form.statedCost) <= 0) return;
    const now = new Date().toISOString();
    const previous = editingId ? inspection.facts.find((item) => item.id === editingId) : undefined;
    const fact: Fact = { id: editingId ?? uid(), sequence: previous?.sequence ?? Math.max(0, ...inspection.facts.map((item) => item.sequence)) + 1, kind: form.kind, category: form.category.id, subcategory: form.subcategory, description: form.description.trim(), statedCost: form.kind === 'WORK' ? numberValue(form.statedCost) : undefined, urgency: form.urgency, status: form.status, comment: form.comment.trim(), bodyRisks: form.bodyRisks, group: form.group.trim() || undefined, createdAt: previous?.createdAt ?? now, updatedAt: now };
    upsertFact(fact);
    resetForm();
    setShowFreeForm(true);
  };
  const editFact = (fact: Fact, duplicate = false) => {
    const category = CATEGORIES.find((item) => item.id === fact.category)!;
    const stage = stages.find((item) => item.categories.includes(fact.category));
    if (stage) setActiveStageId(stage.id);
    setEditingId(duplicate ? null : fact.id);
    setForm({ kind: fact.kind, category, subcategory: fact.subcategory, description: fact.description, statedCost: fact.statedCost?.toString() ?? '', urgency: fact.urgency, status: fact.status, comment: duplicate ? '' : fact.comment, group: fact.group ?? '', bodyRisks: fact.bodyRisks });
    setShowFreeForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const deleteFact = (id: string) => {
    if (!window.confirm('Удалить факт из журнала?')) return;
    onUpdate({ ...inspection, facts: inspection.facts.filter((fact) => fact.id !== id) });
  };
  const toggleStatus = (fact: Fact) => onUpdate({ ...inspection, facts: inspection.facts.map((item) => item.id === fact.id ? { ...item, status: item.status === 'CONFIRMED' ? 'QUESTION' : 'CONFIRMED', updatedAt: new Date().toISOString() } : item) });
  const finish = (status: 'FINISHED_CANDIDATE' | 'FINISHED_REJECTED') => { onUpdate({ ...inspection, status }); onNavigate('history'); };

  return <section className="page-section inspection-page">
    <div className="inspection-heading"><div><button className="back-link" onClick={() => onNavigate('history')}>← Все осмотры</button><h1>{modelName(inspection.configSnapshot, inspection.vehicle.modelId)}</h1><p className="vehicle-meta">{inspection.vehicle.year} · {engineVariant(inspection.configSnapshot, inspection.vehicle)?.code || 'двигатель не указан'} · {inspection.vehicle.mileage.toLocaleString('ru-RU')} км · {inspection.vehicle.listingSource || 'Источник не указан'}{inspection.vehicle.vin ? ` · VIN ${inspection.vehicle.vin}` : ''}</p></div><div className="heading-actions"><button className="ghost-button" onClick={() => setShowVehicleEditor((value) => !value)}>Данные авто</button><button className="ghost-button" onClick={() => onNavigate('forecast')}>Прогноз 5 лет</button><button className="ghost-button" onClick={() => onNavigate('settings')}>Настройки</button></div></div>
    {showVehicleEditor && <VehicleEditor inspection={inspection} onSave={(next) => { onUpdate(next); setShowVehicleEditor(false); }} onCancel={() => setShowVehicleEditor(false)} />}
    <VehicleInfoSummary vehicle={inspection.vehicle} config={inspection.configSnapshot} onEdit={() => setShowVehicleEditor(true)} />
    <Summary result={result} inspection={inspection} onForecast={() => onNavigate('forecast')} />
    {hasCriticalPoint && !criticalDismissed && <CriticalPoint result={result} onReject={() => finish('FINISHED_REJECTED')} onContinue={() => setCriticalDismissed(true)} />}
    {hasCriticalPoint && criticalDismissed && <div className="critical-minibar"><span>Критическая точка учтена.</span><button className="text-button" onClick={() => setCriticalDismissed(false)}>Показать детали</button></div>}
    {showLayoutEditor && <InspectionLayoutEditor layout={stages} onCancel={() => setShowLayoutEditor(false)} onSave={(layout) => { onUpdate({ ...inspection, inspectionLayout: layout }); setShowLayoutEditor(false); }} />}
    <div className="inspection-progress"><div className="section-heading"><div><p className="eyebrow">ПОШАГОВЫЙ ОСМОТР</p><h2>Этапы автомобиля <span className="count-badge">{inspection.facts.length} фактов</span></h2></div><div className="button-row"><span className="muted">Сохранённые элементы сразу попадают в общий расчёт.</span><button className="ghost-button compact-action" onClick={() => setShowLayoutEditor((value) => !value)}>{showLayoutEditor ? 'Закрыть настройку' : 'Настроить блоки'}</button></div></div><div className="stage-tabs">{stages.map((stage, index) => <StageTab key={stage.id} stage={stage} index={index} facts={result.calculatedFacts} active={stage.id === activeStage.id} onClick={() => setActiveStageId(stage.id)} />)}</div></div>
    {activeStage && <StageReview key={activeStage.id} stage={activeStage} stepIndex={stages.findIndex((item) => item.id === activeStage.id)} facts={result.calculatedFacts} onSaveFact={upsertFact} onDeleteFact={deleteFact} />}
    <div className="section-heading all-facts-heading"><div><p className="eyebrow">ОБЩИЙ ЖУРНАЛ</p><h2>Все факты <span className="count-badge">{inspection.facts.length}</span></h2></div><button className="primary-button" onClick={() => { resetForm(); setShowFreeForm((value) => !value); }}>{showFreeForm ? 'Скрыть свободную форму' : '＋ Свободный факт'}</button></div>
    <FactGroupSummary facts={inspection.facts} />
    {showFreeForm && <FactForm form={form} editing={Boolean(editingId)} onChange={setForm} onCategoryChange={changeCategory} onToggleRisk={toggleRisk} onCancel={resetForm} onSubmit={saveFact} />}
    <div className="fact-list">{result.calculatedFacts.length === 0 ? <div className="subtle-empty">Выберите этап и сохраняйте состояние каждого элемента. Для нестандартного замечания используйте свободный факт.</div> : result.calculatedFacts.map((fact) => <FactCard key={fact.id} fact={fact} onEdit={() => editFact(fact)} onDuplicate={() => editFact(fact, true)} onDelete={() => deleteFact(fact.id)} onToggleStatus={() => toggleStatus(fact)} />)}</div>
    <div className="finish-bar"><div><strong>{inspection.status === 'IN_PROGRESS' ? 'Осмотр в процессе' : inspection.status === 'FINISHED_REJECTED' ? 'Осмотр завершён отказом' : 'Осмотр завершён: кандидат'}</strong><span className="muted">Решение сохранится, форма закроется, и откроется список осмотров.</span></div><div className="button-row"><button className="ghost-button" onClick={() => finish('FINISHED_REJECTED')}>Завершить — отказ</button><button className="primary-button" onClick={() => finish('FINISHED_CANDIDATE')}>Завершить — кандидат</button></div></div>
  </section>;
}

function stageHasFact(facts: Fact[], stage: InspectionStage, element: string): Fact | undefined {
  return facts.find((fact) => fact.stageId === stage.id && fact.elementId === element)
    ?? facts.find((fact) => fact.group === stage.label && fact.description.startsWith(`${element}:`));
}

function StageTab({ stage, index, facts, active, onClick }: { stage: InspectionStage; index: number; facts: Fact[]; active: boolean; onClick: () => void }) {
  const total = stage.blocks.reduce((sum, block) => sum + block.elements.length, 0);
  const completed = stage.blocks.reduce((sum, block) => sum + block.elements.filter((element) => stageHasFact(facts, stage, element)).length, 0);
  return <button className={`stage-tab ${active ? 'active' : ''} ${completed > 0 ? 'started' : ''}`} onClick={onClick}><span className="stage-index">{String(index + 1).padStart(2, '0')}</span><span><strong>{stage.label}</strong><small>{completed}/{total} элементов</small></span></button>;
}

function draftFromFact(fact: Fact | undefined): StageDraft {
  if (!fact) return { state: 'UNSET', details: '', cost: '', urgency: 'NOW', comment: '' };
  if (fact.kind === 'WORK') return { state: 'WORK', details: fact.description.split(': ').slice(1).join(': ') || fact.description, cost: fact.statedCost?.toString() ?? '', urgency: fact.urgency, comment: fact.comment };
  return { state: fact.status === 'QUESTION' ? 'QUESTION' : 'GOOD', details: '', cost: '', urgency: fact.urgency, comment: fact.comment };
}

function StageReview({ stage, stepIndex, facts, onSaveFact, onDeleteFact }: { stage: InspectionStage; stepIndex: number; facts: ReturnType<typeof calculateInspection>['calculatedFacts']; onSaveFact: (fact: Fact) => void; onDeleteFact: (id: string) => void }) {
  const [drafts, setDrafts] = useState<Record<string, StageDraft>>({});
  const getDraft = (element: string) => drafts[element] ?? draftFromFact(stageHasFact(facts, stage, element));
  const updateDraft = (element: string, change: Partial<StageDraft>) => setDrafts((current) => ({ ...current, [element]: { ...(current[element] ?? draftFromFact(stageHasFact(facts, stage, element))), ...change } }));
  const saveElement = (block: InspectionStageBlock, element: string) => {
    const draft = getDraft(element);
    const existing = stageHasFact(facts, stage, element);
    if (draft.state === 'UNSET') {
      if (existing) onDeleteFact(existing.id);
      setDrafts((current) => ({ ...current, [element]: draftFromFact(undefined) }));
      return;
    }
    const now = new Date().toISOString();
    const isWork = draft.state === 'WORK';
    const fact: Fact = { id: existing?.id ?? uid(), sequence: existing?.sequence ?? Math.max(0, ...facts.map((item) => item.sequence)) + 1, kind: isWork ? 'WORK' : 'CONDITION', category: block.category, subcategory: block.subcategory, description: isWork ? `${element}: ${draft.details.trim() || 'требует ремонта'}` : `${element}: ${draft.state === 'GOOD' ? 'исправно' : 'требует проверки'}`, statedCost: isWork ? numberValue(draft.cost) : undefined, urgency: isWork ? draft.urgency : 'NOW', status: draft.state === 'QUESTION' ? 'QUESTION' : 'CONFIRMED', comment: draft.comment.trim(), bodyRisks: existing?.bodyRisks ?? [], group: stage.label, stageId: stage.id, blockId: block.id, elementId: element, createdAt: existing?.createdAt ?? now, updatedAt: now };
    if (isWork && (!fact.statedCost || fact.statedCost <= 0)) return;
    onSaveFact(fact);
    setDrafts((current) => ({ ...current, [element]: draft }));
  };
  return <section className="stage-review"><div className="stage-intro"><div><span className="step-chip">ЭТАП {stepIndex + 1}</span><h2>{stage.label}</h2><p>{stage.description}</p></div><span className="muted">Выберите состояние, заполните работу при необходимости и нажмите «Сохранить».</span></div>{stage.blocks.map((block) => <fieldset className="stage-block" key={block.id}><legend>{block.label}</legend><div className="stage-element-list">{block.elements.map((element) => { const draft = getDraft(element); const fact = stageHasFact(facts, stage, element); return <div className={`inspection-element ${fact ? 'saved' : ''}`} key={element}><div className="element-heading"><strong>{element}</strong>{fact && <span>Зафиксировано{fact.kind === 'WORK' ? ` · ${money(fact.statedCost)}` : ' · состояние'}</span>}</div><div className="element-fields"><MiniField label="Состояние"><select value={draft.state} onChange={(input) => updateDraft(element, { state: input.target.value as StageElementState })}><option value="UNSET">Не проверено</option><option value="GOOD">Исправно</option><option value="WORK">Нужна работа</option><option value="QUESTION">Под вопросом</option></select></MiniField>{draft.state === 'WORK' && <><MiniField label="Работа"><input value={draft.details} onChange={(input) => updateDraft(element, { details: input.target.value })} placeholder="Что сделать или заменить" /></MiniField><MiniField label="Стоимость, ₽"><input type="number" min="1" value={draft.cost} onChange={(input) => updateDraft(element, { cost: input.target.value })} placeholder="Введите сумму" /></MiniField><MiniField label="Срок"><select value={draft.urgency} onChange={(input) => updateDraft(element, { urgency: input.target.value as FactUrgency })}>{Object.entries(URGENCY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></MiniField></>}{draft.state === 'QUESTION' && <MiniField label="Что уточнить"><input value={draft.comment} onChange={(input) => updateDraft(element, { comment: input.target.value })} placeholder="Комментарий специалиста" /></MiniField>}{draft.state === 'GOOD' && <MiniField label="Комментарий"><input value={draft.comment} onChange={(input) => updateDraft(element, { comment: input.target.value })} placeholder="Необязательно" /></MiniField>}</div><div className="element-actions"><button className="action-button primary-action" onClick={() => saveElement(block, element)}>{fact ? 'Сохранить изменения' : 'Сохранить'}</button>{fact && <button className="action-button danger-action" onClick={() => { if (window.confirm('Удалить состояние этого элемента?')) { onDeleteFact(fact.id); setDrafts((current) => ({ ...current, [element]: draftFromFact(undefined) })); } }}>Удалить</button>}</div></div>; })}</div></fieldset>)}</section>;
}

function InspectionLayoutEditor({ layout, onCancel, onSave }: { layout: InspectionLayout; onCancel: () => void; onSave: (layout: InspectionLayout) => void }) {
  const [draft, setDraft] = useState<InspectionLayout>(() => cloneLayout(layout));
  const updateStage = (stageId: string, change: Partial<InspectionStageConfig>) => setDraft((current) => current.map((stage) => stage.id === stageId ? { ...stage, ...change } : stage));
  const updateBlock = (stageId: string, blockId: string, change: Partial<InspectionBlockConfig>) => setDraft((current) => current.map((stage) => stage.id !== stageId ? stage : { ...stage, blocks: stage.blocks.map((block) => block.id === blockId ? { ...block, ...change } : block) }));
  const updateElement = (stageId: string, blockId: string, elementIndex: number, value: string) => setDraft((current) => current.map((stage) => stage.id !== stageId ? stage : { ...stage, blocks: stage.blocks.map((block) => block.id !== blockId ? block : { ...block, elements: block.elements.map((element, index) => index === elementIndex ? value : element) }) }));
  const removeStage = (stageId: string) => {
    if (draft.length <= 1 || !window.confirm('Удалить этот этап из формы осмотра? Уже сохранённые факты останутся в журнале.')) return;
    setDraft((current) => current.filter((stage) => stage.id !== stageId));
  };
  const removeBlock = (stageId: string, blockId: string) => {
    if (!window.confirm('Удалить этот подблок из формы осмотра? Уже сохранённые факты останутся в журнале.')) return;
    setDraft((current) => current.map((stage) => stage.id !== stageId ? stage : { ...stage, blocks: stage.blocks.filter((block) => block.id !== blockId) }));
  };
  const addBlock = (stageId: string) => setDraft((current) => current.map((stage) => stage.id !== stageId ? stage : { ...stage, blocks: [...stage.blocks, { id: `custom-block-${uid()}`, label: 'Новый подблок', category: 'other', subcategory: 'Не классифицировано', elements: ['Новый элемент'] }] }));
  const addStage = () => setDraft((current) => [...current, { id: `custom-stage-${uid()}`, label: 'Новый этап', description: 'Дополнительные элементы осмотра.', categories: ['other'], blocks: [{ id: `custom-block-${uid()}`, label: 'Новый подблок', category: 'other', subcategory: 'Не классифицировано', elements: ['Новый элемент'] }] }]);
  return <section className="content-card layout-editor">
    <div className="section-heading compact-heading"><div><p className="eyebrow">КОНСТРУКТОР ОСМОТРА</p><h2>Этапы, подблоки и элементы</h2><p className="muted">Добавляйте свои пункты вроде «цепь ГРМ», переименовывайте и удаляйте лишнее. Уже сохранённые факты не удаляются автоматически.</p></div><div className="button-row"><button className="ghost-button" onClick={onCancel}>Отмена</button><button className="primary-button" onClick={() => onSave(draft)}>Сохранить структуру</button></div></div>
    <div className="layout-stage-list">{draft.map((stage, stageIndex) => <article className="layout-stage" key={stage.id}>
      <div className="layout-stage-header"><span className="stage-index">{String(stageIndex + 1).padStart(2, '0')}</span><div className="layout-stage-fields"><input value={stage.label} onChange={(event) => updateStage(stage.id, { label: event.target.value })} placeholder="Название этапа" /><input value={stage.description} onChange={(event) => updateStage(stage.id, { description: event.target.value })} placeholder="Краткое описание" /></div><button className="action-button danger-action" onClick={() => removeStage(stage.id)}>Удалить этап</button></div>
      <div className="layout-block-list">{stage.blocks.map((block) => <div className="layout-block" key={block.id}>
        <div className="layout-block-header"><input value={block.label} onChange={(event) => updateBlock(stage.id, block.id, { label: event.target.value })} placeholder="Название подблока" /><select value={block.category} onChange={(event) => updateBlock(stage.id, block.id, { category: event.target.value as CategoryId })}>{CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select><input value={block.subcategory} onChange={(event) => updateBlock(stage.id, block.id, { subcategory: event.target.value })} placeholder="Подкатегория" /><button className="action-button danger-action" onClick={() => removeBlock(stage.id, block.id)}>Удалить подблок</button></div>
        <div className="layout-element-list">{block.elements.map((element, elementIndex) => <div className="layout-element" key={`${block.id}-${elementIndex}`}><input value={element} onChange={(event) => updateElement(stage.id, block.id, elementIndex, event.target.value)} placeholder="Элемент автомобиля" /><button className="action-button danger-action" onClick={() => updateBlock(stage.id, block.id, { elements: block.elements.filter((_, index) => index !== elementIndex) })}>Удалить</button></div>)}</div>
        <button className="ghost-button compact-action" onClick={() => updateBlock(stage.id, block.id, { elements: [...block.elements, 'Новый элемент'] })}>＋ Добавить элемент</button>
      </div>)}</div>
      <button className="ghost-button compact-action" onClick={() => addBlock(stage.id)}>＋ Добавить подблок</button>
    </article>)}</div>
    <button className="ghost-button" onClick={addStage}>＋ Добавить этап</button>
  </section>;
}

function VehicleInfoSummary({ vehicle, config, onEdit }: { vehicle: Inspection['vehicle']; config: AppConfig; onEdit: () => void }) {
  const variant = engineVariant(config, vehicle);
  const accidentLabel = vehicle.accidentStatus === 'YES' ? 'ДТП было' : vehicle.accidentStatus === 'NO' ? 'ДТП не заявлено' : 'ДТП не проверено';
  const hasAttention = vehicle.documentsStatus === 'DUPLICATE_WITHOUT_ORIGINAL' || (vehicle.keyCount !== undefined && vehicle.keyCount < 2) || vehicle.accidentStatus === 'YES' || vehicle.accidentStatus === 'UNKNOWN';
  return <div className={`vehicle-info-summary ${hasAttention ? 'attention' : ''}`}><div><span className="summary-label">ИНФОРМАЦИЯ ДЛЯ РЕШЕНИЯ</span><strong>{DOCUMENT_LABELS[vehicle.documentsStatus ?? 'UNKNOWN']}</strong></div><div><span>Двигатель / ГРМ</span><strong>{variant ? `${variant.code || 'Код не указан'} · ${TIMING_DRIVE_LABELS[variant.timingDrive]}` : 'Не указано'}</strong></div><div><span>Ключи</span><strong>{vehicle.keyCount === undefined ? 'Не указано' : `${vehicle.keyCount} шт.`}</strong></div><div><span>История ДТП</span><strong>{accidentLabel}</strong></div>{vehicle.accidentStatus === 'YES' && <div className="accident-outcomes"><span>Результат</span><strong>{vehicle.accidentOutcomes?.length ? vehicle.accidentOutcomes.map((outcome) => ACCIDENT_OUTCOME_LABELS[outcome] ?? outcome).join(' · ') : 'Не описан'}</strong></div>}{vehicle.listingUrl && <a className="listing-link" href={vehicle.listingUrl} target="_blank" rel="noreferrer">Открыть объявление</a>}<button className="text-button" onClick={onEdit}>Изменить</button></div>;
}

function VehicleEditor({ inspection, onSave, onCancel }: { inspection: Inspection; onSave: (inspection: Inspection) => void; onCancel: () => void }) {
  const [vehicle, setVehicle] = useState({ ...inspection.vehicle, accidentOutcomes: inspection.vehicle.accidentOutcomes ?? [] });
  const [pricing, setPricing] = useState({ ...inspection.pricing, actualPurchasePrice: inspection.pricing.actualPurchasePrice?.toString() ?? '' });
  const selectedModel = modelProfile(inspection.configSnapshot, vehicle.modelId);
  const selectedVariant = engineVariant(inspection.configSnapshot, vehicle);
  const changeModel = (modelId: ModelId) => setVehicle((current) => ({ ...current, modelId, engineVariantId: modelProfile(inspection.configSnapshot, modelId).engineVariants[0]?.id ?? 'unknown' }));
  const toggleOutcome = (outcome: string) => setVehicle((current) => ({ ...current, accidentOutcomes: current.accidentOutcomes.includes(outcome) ? current.accidentOutcomes.filter((item) => item !== outcome) : [...current.accidentOutcomes, outcome] }));
  const save = (event: FormEvent) => {
    event.preventDefault();
    onSave({ ...inspection, vehicle: { ...vehicle, accidentOutcomes: vehicle.accidentOutcomes }, pricing: { askingPrice: numberValue(String(pricing.askingPrice)), expectedDiscount: numberValue(String(pricing.expectedDiscount)), actualPurchasePrice: pricing.actualPurchasePrice ? numberValue(pricing.actualPurchasePrice) : undefined } });
  };
  return <form className="vehicle-editor" onSubmit={save}>
    <div className="form-section-title"><div><span className="step-chip">КАРТОЧКА АВТОМОБИЛЯ</span><strong>Дополнить или исправить данные</strong></div><button type="button" className="text-button" onClick={onCancel}>Закрыть</button></div>
    <div className="form-grid three"><Field label="Модель"><select value={vehicle.modelId} onChange={(event) => changeModel(event.target.value as ModelId)}>{inspection.configSnapshot.models.map((model) => <option key={model.id} value={model.id}>{modelName(inspection.configSnapshot, model.id)}</option>)}</select></Field><Field label="Год"><input type="number" value={vehicle.year} onChange={(event) => setVehicle({ ...vehicle, year: numberValue(event.target.value) })} /></Field><Field label="Пробег, км"><input type="number" value={vehicle.mileage} onChange={(event) => setVehicle({ ...vehicle, mileage: numberValue(event.target.value) })} /></Field></div>
    <div className="form-grid two"><Field label="Двигатель и ГРМ"><select value={selectedVariant?.id ?? ''} onChange={(event) => setVehicle({ ...vehicle, engineVariantId: event.target.value })}>{selectedModel.engineVariants.map((variant) => <option key={variant.id} value={variant.id}>{variant.label}</option>)}</select></Field><div className="engine-fact"><span>Текущий выбор</span><strong>{selectedVariant ? `${selectedVariant.code || 'Код не указан'} · ${TIMING_DRIVE_LABELS[selectedVariant.timingDrive]}` : 'Не определён'}</strong></div></div>
    <div className="form-grid three"><Field label="VIN"><input value={vehicle.vin ?? ''} onChange={(event) => setVehicle({ ...vehicle, vin: event.target.value })} /></Field><Field label="Госномер"><input value={vehicle.plate ?? ''} onChange={(event) => setVehicle({ ...vehicle, plate: event.target.value })} /></Field><Field label="Источник"><input value={vehicle.listingSource ?? ''} onChange={(event) => setVehicle({ ...vehicle, listingSource: event.target.value })} /></Field></div>
    <Field label="Ссылка на объявление"><input type="url" value={vehicle.listingUrl ?? ''} onChange={(event) => setVehicle({ ...vehicle, listingUrl: event.target.value || undefined })} placeholder="https://…" /></Field>
    <div className="form-grid three"><Field label="Цена объявления, ₽"><input type="number" value={pricing.askingPrice} onChange={(event) => setPricing({ ...pricing, askingPrice: numberValue(event.target.value) })} /></Field><Field label="Ожидаемый торг, ₽"><input type="number" value={pricing.expectedDiscount} onChange={(event) => setPricing({ ...pricing, expectedDiscount: numberValue(event.target.value) })} /></Field><Field label="Фактическая цена, ₽"><input type="number" value={pricing.actualPurchasePrice} onChange={(event) => setPricing({ ...pricing, actualPurchasePrice: event.target.value })} placeholder="Пока неизвестна" /></Field></div>
    <div className="form-grid three"><Field label="Документы"><select value={vehicle.documentsStatus ?? 'UNKNOWN'} onChange={(event) => setVehicle({ ...vehicle, documentsStatus: event.target.value as typeof vehicle.documentsStatus })}>{Object.entries(DOCUMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Количество ключей"><input type="number" min="0" max="5" value={vehicle.keyCount ?? ''} onChange={(event) => setVehicle({ ...vehicle, keyCount: event.target.value === '' ? undefined : numberValue(event.target.value) })} /></Field><Field label="ДТП"><select value={vehicle.accidentStatus ?? 'UNKNOWN'} onChange={(event) => setVehicle({ ...vehicle, accidentStatus: event.target.value as typeof vehicle.accidentStatus })}><option value="NO">Не было</option><option value="YES">Было</option><option value="UNKNOWN">Неизвестно</option></select></Field></div>
    {vehicle.accidentStatus === 'YES' && <><div className="risk-picker"><span className="field-label">Результаты ДТП</span><div className="check-grid">{Object.entries(ACCIDENT_OUTCOME_LABELS).map(([outcome, label]) => <label key={outcome} className="check-item"><input type="checkbox" checked={vehicle.accidentOutcomes.includes(outcome)} onChange={() => toggleOutcome(outcome)} />{label}</label>)}</div></div><Field label="Комментарий по ДТП"><textarea rows={2} value={vehicle.accidentComment ?? ''} onChange={(event) => setVehicle({ ...vehicle, accidentComment: event.target.value })} /></Field></>}
    <div className="form-actions"><button type="button" className="ghost-button" onClick={onCancel}>Отмена</button><button type="submit" className="primary-button">Сохранить данные</button></div>
  </form>;
}

function Summary({ result, inspection, onForecast }: { result: ReturnType<typeof calculateInspection>; inspection: Inspection; onForecast: () => void }) {
  const ratio = result.reserveRatio === null ? '—' : percent(result.reserveRatio);
  const informationText = inspection.facts.length === 0
    ? 'Фактов пока нет: итоговая оценка предварительная.'
    : result.questionFactsCount > 0
      ? `Под вопросом ${result.questionFactsCount} из ${inspection.facts.length} фактов (${percent(result.questionShare)}). Это не штраф и не добавляет выдуманные расходы — данные требуют подтверждения.`
      : 'Все сохранённые факты подтверждены.';
  return <div className={`summary-card ${result.zone.toLowerCase()}`}>
    <div className="summary-main"><div><span className="summary-label">ФИНАНСОВАЯ СВОДКА</span><div className="summary-zone"><span className={`zone-dot ${result.zone.toLowerCase()}`}></span><strong>{zoneText(result.zone)}</strong></div></div><div className="summary-rating"><span>Рейтинг</span><strong>{result.rating.score === null ? '—' : result.rating.score}</strong><small>/100</small></div></div>
    <div className="summary-stats"><Metric label={result.priceSource === 'ACTUAL' ? 'Фактическая цена' : 'Цена расчёта'} value={money(result.calculationPrice)} /><Metric label="Фонд доведения" value={money(result.restoreBudget)} /><Metric label="Безопасная смета" value={money(result.safeRestoreCost)} /><Metric label="Остаток" value={money(result.remainingBudget)} accent={result.remainingBudget < 0 ? 'danger' : undefined} /><Metric label="Запас" value={ratio} accent={result.zone === 'GREEN' ? 'positive' : result.zone === 'RED' ? 'danger' : 'warning'} /></div>
    <div className="summary-footer"><span>Заявлено {money(result.statedRestoreCost)} · надбавка неопределённости {money(result.uncertaintyPremium)} · {inspection.facts.length} фактов</span><button className="text-button" onClick={onForecast}>Посмотреть прогноз →</button></div>
    <div className="summary-schedule"><span>Сразу после покупки <strong>{money(result.immediateSafeRestoreCost)}</strong></span><span>Сразу + ближайшее время <strong>{money(result.nearTermSafeRestoreCost)}</strong></span><span>Полный план работ <strong>{money(result.fullSafeRestoreCost)}</strong></span></div>
    <div className={`information-note ${result.questionFactsCount > 0 ? 'question-note' : ''}`}><strong>Определённость осмотра</strong><span>{informationText}</span></div>
    {result.fullRemainingBudget < 0 && <div className="summary-note warning-note">Полный план всех отложенных работ превышает фонд на {money(Math.abs(result.fullRemainingBudget))}. Эти траты не включены в текущую точку сразу после покупки и показаны отдельно.</div>}
    {result.calculationPrice > inspection.configSnapshot.targetPurchasePrice && <div className="summary-note warning-note">Цена расчёта выше целевой отметки {money(inspection.configSnapshot.targetPurchasePrice)}. Осмотр не блокируется, если общий сценарий укладывается в фонд.</div>}
  </div>;
}

function CriticalPoint({ result, onReject, onContinue }: { result: ReturnType<typeof calculateInspection>; onReject: () => void; onContinue: () => void }) {
  const reason = result.remainingBudget < 0
    ? `Безопасная стоимость доведения составляет ${money(result.safeRestoreCost)} при доступном бюджете ${money(result.restoreBudget)}.`
    : result.zone === 'FILTER_FAIL'
      ? 'Цена объявления выше установленного предела первичного фильтра.'
      : result.criticalBodyRisks.length > 0
        ? 'Обнаружен критический кузовной или геометрический риск. Денежная смета не заменяет экспертную оценку.'
        : result.rating.hardBlocks[0] ?? 'Текущий сценарий требует дополнительной проверки.';
  return <div className="critical-point"><div className="critical-icon">!</div><div><strong>Критическая точка</strong><p>{reason} {result.reserveRatio !== null && `Запас ${percent(result.reserveRatio)}.`}</p></div><div className="button-row"><button className="danger-button" onClick={onReject}>Завершить — отказ</button><button className="continue-button" onClick={onContinue}>Понятно, продолжить</button></div></div>;
}

function FactForm({ form, editing, onChange, onCategoryChange, onToggleRisk, onCancel, onSubmit }: { form: ReturnType<typeof blankFact>; editing: boolean; onChange: (form: ReturnType<typeof blankFact>) => void; onCategoryChange: (category: CategoryId) => void; onToggleRisk: (risk: BodyRisk) => void; onCancel: () => void; onSubmit: (event: FormEvent) => void }) {
  return <form className="fact-form" onSubmit={onSubmit}><div className="form-section-title"><div><span className="step-chip">{editing ? 'РЕДАКТИРОВАНИЕ' : 'НОВЫЙ ФАКТ'}</span><strong>{editing ? 'Изменить запись' : 'Добавить факт'}</strong></div>{editing && <button type="button" className="text-button" onClick={onCancel}>Сбросить</button>}</div><div className="form-grid two"><Field label="Тип факта"><select value={form.kind} onChange={(event) => onChange({ ...form, kind: event.target.value as FactKind })}><option value="WORK">Нужна работа</option><option value="CONDITION">Состояние / проверка</option></select></Field><Field label="Статус"><select value={form.status} onChange={(event) => onChange({ ...form, status: event.target.value as FactStatus })}><option value="CONFIRMED">Подтверждён</option><option value="QUESTION">Под вопросом</option></select></Field></div><div className="form-grid two"><Field label="Категория"><select value={form.category.id} onChange={(event) => onCategoryChange(event.target.value as CategoryId)}>{CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></Field><Field label="Подкатегория"><select value={form.subcategory} onChange={(event) => onChange({ ...form, subcategory: event.target.value })}>{form.category.subcategories.map((subcategory) => <option key={subcategory}>{subcategory}</option>)}</select></Field></div><Field label="Группа / блок" hint="Например: кузов, левый бок, салон"><input value={form.group} onChange={(event) => onChange({ ...form, group: event.target.value })} placeholder={form.category.id === 'body' ? 'Кузов · левый бок' : form.category.id === 'interior' ? 'Салон' : 'Необязательно'} /></Field>{form.kind === 'CONDITION' && <Field label="Состояние"><select value={form.description} onChange={(event) => onChange({ ...form, description: event.target.value })}><option value="">Выберите состояние</option>{conditionOptions.map((option) => <option key={option}>{option}</option>)}</select></Field>}<Field label={form.kind === 'WORK' ? 'Что нужно сделать' : 'Описание факта'}><input autoFocus={form.kind === 'WORK'} value={form.kind === 'CONDITION' && conditionOptions.includes(form.description) ? `${form.description}` : form.description} onChange={(event) => onChange({ ...form, description: event.target.value })} placeholder={form.kind === 'WORK' ? 'Например: передние стойки + опоры' : 'Например: АКПП работает нормально'} required /></Field>{form.kind === 'WORK' && <div className="form-grid two"><Field label="Стоимость специалиста, ₽"><input type="number" min="1" value={form.statedCost} onChange={(event) => onChange({ ...form, statedCost: event.target.value })} required /></Field><Field label="Срочность"><select value={form.urgency} onChange={(event) => onChange({ ...form, urgency: event.target.value as FactUrgency })}>{Object.entries(URGENCY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div>}{form.kind === 'CONDITION' && <Field label="Срочность"><select value={form.urgency} onChange={(event) => onChange({ ...form, urgency: event.target.value as FactUrgency })}>{Object.entries(URGENCY_LABELS).map(([value, label]) => <option key={value}>{label}</option>)}</select></Field>}<Field label="Комментарий специалиста"><textarea value={form.comment} onChange={(event) => onChange({ ...form, comment: event.target.value })} placeholder="Что именно сказал специалист" rows={2} /></Field>{form.category.id === 'body' && <div className="risk-picker"><span className="field-label">Критические кузовные признаки</span><div className="check-grid">{Object.entries(BODY_RISK_LABELS).map(([risk, label]) => <label key={risk} className="check-item"><input type="checkbox" checked={form.bodyRisks.includes(risk as BodyRisk)} onChange={() => onToggleRisk(risk as BodyRisk)} />{label}</label>)}</div></div>}<div className="form-actions"><button type="button" className="ghost-button" onClick={onCancel}>Отмена</button><button type="submit" className="primary-button">{editing ? 'Сохранить изменения' : 'Добавить факт'}</button></div></form>;
}

function FactCard({ fact, onEdit, onDuplicate, onDelete, onToggleStatus }: { fact: ReturnType<typeof calculateInspection>['calculatedFacts'][number]; onEdit: () => void; onDuplicate: () => void; onDelete: () => void; onToggleStatus: () => void }) {
  return <article className={`fact-card ${fact.status === 'QUESTION' ? 'question' : ''}`}><div className="fact-number">#{fact.sequence}</div><div className="fact-body"><div className="fact-top"><span className="category-tag">{categoryName(fact.category)}</span>{fact.group && <span className="group-tag">{fact.group}</span>}<span className={`mini-status ${fact.status.toLowerCase()}`}>{fact.status === 'QUESTION' ? 'под вопросом' : 'подтверждён'}</span><span className="fact-urgency">{URGENCY_LABELS[fact.urgency]}</span></div><h3>{fact.description}</h3><p className="fact-sub">{fact.subcategory}{fact.comment ? ` · ${fact.comment}` : ''}</p>{fact.bodyRisks.length > 0 && <div className="risk-line">! {fact.bodyRisks.map((risk) => BODY_RISK_LABELS[risk]).join(' · ')}</div>}</div><div className="fact-cost">{fact.kind === 'WORK' ? <><strong>{money(fact.safeCost)}</strong><span>{money(fact.statedCost)} × K {fact.coefficient.toFixed(2)}</span></> : <><strong className="ok-cost">Без ремонта</strong><span>Факт состояния</span></>}</div><div className="fact-actions"><button className="action-button secondary-action" onClick={onDuplicate}>Дублировать</button><button className="action-button secondary-action" onClick={onToggleStatus}>{fact.status === 'QUESTION' ? 'Подтвердить' : 'Под вопрос'}</button><button className="action-button secondary-action" onClick={onEdit}>Изменить</button><button className="action-button danger-action" onClick={onDelete}>Удалить</button></div></article>;
}

function FactGroupSummary({ facts }: { facts: Fact[] }) {
  const groups = Array.from(new Set(facts.map((fact) => fact.group).filter(Boolean) as string[]));
  if (groups.length === 0) return null;
  return <div className="group-summary"><span className="group-summary-title">Блоки:</span>{groups.map((group) => <span className="group-chip" key={group}>{group} · {facts.filter((fact) => fact.group === group).length}</span>)}</div>;
}

function ForecastView({ inspection, result, onUpdate, onApplyConfig, onBack }: { inspection: Inspection; result: ReturnType<typeof calculateInspection>; onUpdate: (inspection: Inspection) => void; onApplyConfig: () => void; onBack: () => void }) {
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const forecast = result.forecast;
  const config = inspection.configSnapshot;
  const customEventIds = new Set((inspection.customEvents ?? []).map((event) => event.id));
  const toggleEvent = (eventId: string, enabled: boolean) => onUpdate({ ...inspection, eventOverrides: { ...inspection.eventOverrides, [eventId]: { ...inspection.eventOverrides[eventId], enabled } } });
  const deleteEvent = (eventId: string) => {
    const event = forecast.eventRows.find((row) => row.event.id === eventId)?.event;
    if (!event || !window.confirm(`Удалить событие «${event.name}» из этого прогноза?`)) return;
    if (customEventIds.has(eventId)) {
      onUpdate({ ...inspection, customEvents: (inspection.customEvents ?? []).filter((item) => item.id !== eventId) });
    } else {
      onUpdate({ ...inspection, eventOverrides: { ...inspection.eventOverrides, [eventId]: { ...inspection.eventOverrides[eventId], removed: true } } });
    }
    if (editingEventId === eventId) setEditingEventId(null);
  };
  const saveEvent = (updated: RepairEvent) => {
    if (customEventIds.has(updated.id)) {
      onUpdate({ ...inspection, customEvents: (inspection.customEvents ?? []).map((item) => item.id === updated.id ? updated : item) });
    } else {
      onUpdate({ ...inspection, eventOverrides: { ...inspection.eventOverrides, [updated.id]: { ...inspection.eventOverrides[updated.id], name: updated.name, category: updated.category, mode: updated.mode, scheduledMonth: updated.scheduledMonth, probability5y: updated.probability5y, repairCost: updated.repairCost, coefficient: updated.coefficient, maxCost: updated.maxCost, monthStart: updated.monthStart, monthEnd: updated.monthEnd } } });
    }
    setEditingEventId(null);
  };
  return <section className="page-section">
    <div className="page-heading"><div><button className="back-link" onClick={onBack}>← Назад к осмотру</button><p className="eyebrow">ПРОГНОЗ / 60 МЕСЯЦЕВ</p><h1>Стоимость эксплуатации</h1><p className="muted">Модельные вероятности являются редактируемыми сценарными параметрами.</p></div><button className="ghost-button" onClick={onApplyConfig}>Применить текущие настройки</button></div>
    <div className="forecast-hero"><Metric label="Операционные расходы за 5 лет" value={money(forecast.totalCost)} /><Metric label="Операционные ₽/мес" value={money(forecast.averageMonthlyCost)} /><Metric label="Полная стоимость за 5 лет" value={money(forecast.fullFiveYearCost)} /><Metric label="Полные ₽/мес" value={money(forecast.fullAverageMonthlyCost)} /></div>
    <div className="initial-outlay-note"><strong>Сразу после покупки: {money(result.safeRestoreCost)}</strong><span>Эта сумма уже входит в полную стоимость, но не смешивается с ежемесячными эксплуатационными расходами.</span></div>
    <div className="risk-grid"><RiskCard label="Хотя бы один крупный ремонт" value={percent(forecast.probabilityAnyMajorRepair)} tone={forecast.probabilityAnyMajorRepair > 0 ? 'warn' : 'good'} /><RiskCard label="Превышение лимита 300k/год" value={percent(forecast.probabilityAnyLimitViolation)} tone={forecast.probabilityAnyLimitViolation > 0 ? 'warn' : 'good'} /><RiskCard label="Больше 4 крупных ремонтов" value={percent(forecast.probabilityAnyMajorRepairLimitViolation)} tone={forecast.probabilityAnyMajorRepairLimitViolation > 0 ? 'warn' : 'good'} /><RiskCard label="Ремонты ближе 3 месяцев" value={percent(forecast.probabilityCloseMajorRepairs)} tone={forecast.probabilityCloseMajorRepairs > 0 ? 'warn' : 'good'} /><RiskCard label="Ремонт >120k" value={percent(forecast.probabilityCriticalRepair)} tone={forecast.probabilityCriticalRepair > 0 ? 'warn' : 'good'} /></div>
    <div className="forecast-note"><strong>Откуда берётся риск крупных ремонтов.</strong><span>Симуляция перебирает активные события: крупным считается событие с максимальной сценарной стоимостью не ниже {money(config.majorRepairThreshold)}. Поэтому показатель меняется при добавлении, удалении, отключении или редактировании P, максимальной стоимости и срока события.</span></div>
    {forecast.questionFactsCount > 0 && <div className="forecast-note neutral-note"><strong>В осмотре {forecast.questionFactsCount} фактов под вопросом.</strong> Они не увеличивают вероятность крупных ремонтов автоматически: приложение не выдумывает статистику. Влияние видно как уровень определённости, а конкретный риск появится в прогнозе только после добавления работы, стоимости или отдельного потенциального события.</div>}
    <div className="content-card"><div className="section-heading compact-heading"><div><p className="eyebrow">ПО ГОДАМ И МЕСЯЦАМ</p><h2>Детализация денежных потоков</h2></div><span className="muted">Лимит: {money(config.scenario.annualLimit)} / год</span></div><div className="forecast-legend"><span><strong>P</strong> — вероятность события за 5 лет.</span><span><strong>K</strong> — множитель неопределённости стоимости, не вероятность.</span><span><strong>Плановый бюджет</strong> = регулярные расходы + ежемесячное пополнение резерва.</span><span><strong>Ожидаемо всего</strong> = регулярные расходы + траты в конкретном месяце.</span></div><ForecastBreakdown forecast={forecast} /></div>
    <div className="content-card"><div className="section-heading compact-heading"><div><p className="eyebrow">МОДЕЛЬ РЕМОНТОВ</p><h2>Потенциальные события</h2></div><div className="button-row"><span className="muted">События можно отключить, изменить или удалить.</span><button className="primary-button" onClick={() => setShowCustomForm((value) => !value)}>＋ Добавить работу</button></div></div>{showCustomForm && <CustomEventForm modelId={inspection.vehicle.modelId} onCancel={() => setShowCustomForm(false)} onAdd={(event) => { onUpdate({ ...inspection, customEvents: [...(inspection.customEvents ?? []), event] }); setShowCustomForm(false); }} /> }<div className="event-list">{forecast.eventRows.length === 0 && <div className="subtle-empty">В этом прогнозе нет потенциальных событий. Добавьте работу вручную — стандартный каталог конфигурации при этом не меняется.</div>}{forecast.eventRows.map(({ event, enabled, expectedCost, riskCost, mode }) => <div className="event-entry" key={event.id}><div className={`event-row ${enabled ? '' : 'disabled'}`}><label className="switch-label"><input type="checkbox" checked={enabled} onChange={(input) => toggleEvent(event.id, input.target.checked)} /><span className="switch"></span></label><div className="event-name"><strong>{event.name}</strong><span>{categoryName(event.category)} · {mode === 'SCHEDULED' ? `запланировано на ${event.monthStart}-й месяц` : `окно ${event.monthStart}–${event.monthEnd} мес.`}</span></div><div><span className="event-stat">{mode === 'SCHEDULED' ? 'Срок 100%' : `P ${percent(event.probability5y)}`}</span><small>ожидаемо {money(expectedCost)}</small></div><div><span className="event-stat">max {money(riskCost)}</span><small>K {event.coefficient.toFixed(2)}</small></div><div className="event-actions"><button className="action-button secondary-action" onClick={() => setEditingEventId(editingEventId === event.id ? null : event.id)}>{editingEventId === event.id ? 'Закрыть' : 'Изменить'}</button><button className="action-button danger-action" onClick={() => deleteEvent(event.id)}>Удалить</button></div></div>{editingEventId === event.id && <EventEditor event={event} allowMode onCancel={() => setEditingEventId(null)} onSave={saveEvent} />}</div>)}</div></div>
  </section>;
}

function ForecastBreakdown({ forecast }: { forecast: ReturnType<typeof calculateInspection>['forecast'] }) {
  const [expandedYears, setExpandedYears] = useState<Record<number, boolean>>({ 1: true });
  const toggleYear = (year: number) => setExpandedYears((current) => ({ ...current, [year]: !current[year] }));
  return <div className="forecast-breakdown"><div className="table-scroll"><table className="year-summary-table"><thead><tr><th>Год</th><th>Регулярные расходы</th><th>В резерв</th><th>Плановый бюджет</th><th>Отложенные работы</th><th>События</th><th>Ожидаемо всего</th><th>Крупный ремонт</th><th>Риск лимита</th></tr></thead>{forecast.years.map((year) => { const months = forecast.months.filter((month) => month.year === year.year); const regular = months.reduce((sum, month) => sum + month.regularExpenses, 0); const reserve = months.reduce((sum, month) => sum + month.plannedReserve, 0); const planned = months.reduce((sum, month) => sum + month.plannedBudget, 0); const scheduled = months.reduce((sum, month) => sum + month.scheduledEvents + month.expectedRepairs, 0); return <tbody key={year.year}><tr><td><button className="year-toggle" onClick={() => toggleYear(year.year)}>{expandedYears[year.year] ? '−' : '+'} Год {year.year}</button></td><td>{money(regular)}</td><td>{money(reserve)}</td><td className="forecast-plan-cell">{money(planned)}</td><td>{money(year.deferredFacts)}</td><td>{money(scheduled)}</td><td><strong>{money(year.expectedTotal)}</strong></td><td><span className={year.probabilityAnyMajorRepair > 0 ? 'table-warn' : 'table-good'}>{percent(year.probabilityAnyMajorRepair)}</span></td><td><span className={year.probabilityLimitViolation > 0 ? 'table-warn' : 'table-good'}>{percent(year.probabilityLimitViolation)}</span></td></tr>{expandedYears[year.year] && <tr><td colSpan={9}><MonthlyForecastTable months={months} /></td></tr>}</tbody>; })}</table></div><p className="forecast-footnote">«Плановый бюджет» — регулярные расходы плюс текущие отчисления в резерв. «Ожидаемо всего» — регулярные расходы плюс разовые траты в месяце события. После наступления события его отчисление прекращается.</p></div>;
}

function MonthlyForecastTable({ months }: { months: ReturnType<typeof calculateInspection>['forecast']['months'] }) {
  return <div className="monthly-table-wrap"><table className="monthly-table"><thead><tr><th>Месяц</th><th>Бензин</th><th>ОСАГО</th><th>Налог</th><th>Плановое ТО</th><th>Жидкости</th><th>Расходники</th><th>Резина</th><th>Мойка</th><th>Штрафы</th><th>Регулярно</th><th>В резерв</th><th>Плановый бюджет</th><th>Отложенные</th><th>По сроку</th><th>Риски, ожидаемо</th><th>Всего</th><th>Баланс резерва</th></tr></thead><tbody>{months.map((month) => <tr key={month.month}><td><strong>{month.month}</strong></td><td>{money(month.fuel)}</td><td>{money(month.insurance)}</td><td>{money(month.tax)}</td><td>{money(month.service)}</td><td>{money(month.fluids)}</td><td>{money(month.consumables)}</td><td>{money(month.tires)}</td><td>{money(month.washing)}</td><td>{money(month.fines)}</td><td>{money(month.regularExpenses)}</td><td className="reserve-cell">{money(month.plannedReserve)}</td><td className="forecast-plan-cell">{money(month.plannedBudget)}</td><td>{month.deferredFacts > 0 ? money(month.deferredFacts) : '—'}</td><td>{month.scheduledEvents > 0 ? money(month.scheduledEvents) : '—'}</td><td>{month.expectedRepairs > 0 ? money(month.expectedRepairs) : '—'}</td><td><strong>{money(month.expectedTotal)}</strong></td><td className={month.reserveBalance < 0 ? 'table-warn' : 'table-good'}>{money(month.reserveBalance)}</td></tr>)}</tbody></table></div>;
}

function EventEditor({ event, allowMode, onCancel, onSave }: { event: RepairEvent; allowMode: boolean; onCancel: () => void; onSave: (event: RepairEvent) => void }) {
  const [name, setName] = useState(event.name);
  const [category, setCategory] = useState<CategoryId>(event.category);
  const [mode, setMode] = useState<'RISK' | 'SCHEDULED'>(event.mode ?? 'RISK');
  const [probability, setProbability] = useState(Math.round(event.probability5y * 100));
  const [cost, setCost] = useState(event.repairCost);
  const [coefficient, setCoefficient] = useState(event.coefficient);
  const [maxCost, setMaxCost] = useState(event.maxCost);
  const [monthStart, setMonthStart] = useState(event.mode === 'SCHEDULED' ? event.scheduledMonth ?? event.monthStart : event.monthStart);
  const [monthEnd, setMonthEnd] = useState(event.monthEnd);
  const save = (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    const scheduledMonth = Math.max(1, Math.min(60, Math.round(monthStart)));
    if (!name.trim()) return;
    onSave({ ...event, name: name.trim(), category, mode, probability5y: mode === 'SCHEDULED' ? 1 : Math.min(100, Math.max(0, probability)) / 100, repairCost: Math.max(0, cost), coefficient: Math.max(0, coefficient), maxCost: Math.max(0, maxCost), monthStart: mode === 'SCHEDULED' ? scheduledMonth : Math.max(1, Math.round(monthStart)), monthEnd: mode === 'SCHEDULED' ? scheduledMonth : Math.max(Math.round(monthStart), Math.round(monthEnd)), scheduledMonth: mode === 'SCHEDULED' ? scheduledMonth : undefined });
  };
  return <form className="event-editor" onSubmit={save}>
    <div className="form-grid two">
      <Field label="Название работы"><input value={name} onChange={(input) => setName(input.target.value)} required /></Field>
      <Field label="Категория"><select value={category} onChange={(input) => setCategory(input.target.value as CategoryId)}>{CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
    </div>
    <div className="form-grid four">
      <Field label="Тип"><select disabled={!allowMode} value={mode} onChange={(input) => setMode(input.target.value as 'RISK' | 'SCHEDULED')}><option value="RISK">Вероятностное</option><option value="SCHEDULED">Известный срок</option></select></Field>
      {mode === 'RISK' ? <Field label="Вероятность, %"><input type="number" min="0" max="100" value={probability} onChange={(input) => setProbability(numberValue(input.target.value))} /></Field> : <Field label="Через сколько месяцев"><input type="number" min="1" max="60" value={monthStart} onChange={(input) => setMonthStart(numberValue(input.target.value))} /></Field>}
      <Field label="Стоимость, ₽"><input type="number" min="0" value={cost} onChange={(input) => setCost(numberValue(input.target.value))} /></Field>
      <Field label="Коэффициент K"><input type="number" min="0" step="0.01" value={coefficient} onChange={(input) => setCoefficient(numberValue(input.target.value))} /></Field>
    </div>
    <div className="form-grid three">
      <Field label="Максимальная стоимость, ₽"><input type="number" min="0" value={maxCost} onChange={(input) => setMaxCost(numberValue(input.target.value))} /></Field>
      {mode === 'RISK' && <><Field label="Начало окна, мес."><input type="number" min="1" max="60" value={monthStart} onChange={(input) => setMonthStart(numberValue(input.target.value))} /></Field><Field label="Конец окна, мес."><input type="number" min="1" max="60" value={monthEnd} onChange={(input) => setMonthEnd(numberValue(input.target.value))} /></Field></>}
    </div>
    <div className="form-actions"><button type="button" className="ghost-button" onClick={onCancel}>Отмена</button><button type="submit" className="primary-button">Сохранить событие</button></div>
  </form>;
}

function CustomEventForm({ modelId, onCancel, onAdd }: { modelId: ModelId; onCancel: () => void; onAdd: (event: RepairEvent) => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<CategoryId>('other');
  const [mode, setMode] = useState<'RISK' | 'SCHEDULED'>('RISK');
  const [probability, setProbability] = useState(50);
  const [month, setMonth] = useState(4);
  const [cost, setCost] = useState(20000);
  const [coefficient, setCoefficient] = useState(1.2);
  const [maxCost, setMaxCost] = useState(30000);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || cost <= 0) return;
    onAdd({ id: `custom-${uid()}`, modelIds: [modelId], category, name: name.trim(), probability5y: mode === 'SCHEDULED' ? 1 : Math.min(100, Math.max(0, probability)) / 100, repairCost: cost, coefficient, maxCost, monthStart: mode === 'SCHEDULED' ? month : 1, monthEnd: mode === 'SCHEDULED' ? month : 60, mode, scheduledMonth: mode === 'SCHEDULED' ? month : undefined });
  };
  return <form className="custom-event-form" onSubmit={submit}><div className="form-grid two"><Field label="Название работы"><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Например: замена радиатора печки" required /></Field><Field label="Категория"><select value={category} onChange={(event) => setCategory(event.target.value as CategoryId)}>{CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field></div><div className="form-grid three"><Field label="Тип события"><select value={mode} onChange={(event) => setMode(event.target.value as 'RISK' | 'SCHEDULED')}><option value="RISK">Вероятностное</option><option value="SCHEDULED">Известный срок</option></select></Field>{mode === 'RISK' ? <Field label="Вероятность, %"><input type="number" min="0" max="100" value={probability} onChange={(event) => setProbability(numberValue(event.target.value))} /></Field> : <Field label="Через сколько месяцев"><input type="number" min="1" max="60" value={month} onChange={(event) => setMonth(numberValue(event.target.value))} /></Field>}<Field label="Стоимость, ₽"><input type="number" min="1" value={cost} onChange={(event) => setCost(numberValue(event.target.value))} /></Field></div><div className="form-grid two"><Field label="Коэффициент K"><input type="number" min="1" step="0.01" value={coefficient} onChange={(event) => setCoefficient(numberValue(event.target.value))} /></Field><Field label="Максимальная стоимость, ₽"><input type="number" min="0" value={maxCost} onChange={(event) => setMaxCost(numberValue(event.target.value))} /></Field></div><div className="form-actions"><button type="button" className="ghost-button" onClick={onCancel}>Отмена</button><button type="submit" className="primary-button">Добавить в прогноз</button></div></form>;
}

function FAQView() {
  return <section className="page-section faq-page"><div className="page-heading"><div><p className="eyebrow">СПРАВКА / МЕТОДИКА</p><h1>Как работает «Автоосмотр»</h1><p className="muted">Расчёт строится из сохранённых фактов и видимых параметров каталога.</p></div></div><div className="faq-lead"><strong>Принцип:</strong> факты специалиста → детерминированные формулы → бюджетная зона → прогноз → рейтинг. ИИ не принимает финансовое решение вместо пользователя.</div><div className="faq-grid"><article className="content-card faq-card"><p className="eyebrow">01 / ОСМОТР</p><h2>Шаблоны и этапы</h2><p>При создании осмотра можно выбрать классический шаблон, вариант под конкретный двигатель или пользовательский шаблон. В настройках можно создать свою модель, добавить варианты двигателя и собрать собственные этапы, подблоки и элементы.</p><p>Внутри осмотра каждый элемент сохраняется отдельно. Если пункта нет в выбранном шаблоне, используйте «Свободный факт», а затем при необходимости добавьте пункт в шаблон.</p></article><article className="content-card faq-card"><p className="eyebrow">02 / БЮДЖЕТ</p><h2>Как считается доведение</h2><div className="formula">Цена расчёта = фактическая цена<br />или цена объявления − ожидаемый торг<br />Безопасная стоимость = цена специалиста × K<br />Остаток = фонд доведения − работы «Сразу»</div><p>Работа со статусом «под вопросом» с указанной стоимостью учитывается в смете. Состояние под вопросом без стоимости не создаёт выдуманного ремонта, но оставляет расчёт предварительным.</p></article><article className="content-card faq-card"><p className="eyebrow">03 / P И K</p><h2>Вероятность и коэффициент — разное</h2><p><strong>P</strong> — вероятность события за весь сценарный период. <strong>K</strong> — запас к названной стоимости. Например: P 20%, стоимость 65 000 ₽, K 1,2 → ожидаемо 15 600 ₽. K не означает 120% вероятности.</p></article><article className="content-card faq-card"><p className="eyebrow">04 / МЕСЯЦЫ</p><h2>Как читается прогноз</h2><p>Регулярные расходы показываются отдельно: бензин, ОСАГО, налог, ТО, жидкости, расходники, резина, мойка и штрафы. Для каждого ремонта ожидаемая сумма резервируется до собственного срока: стоимость / число месяцев до события.</p><p>В месяце события появляется разовая трата. После этого события его отчисление в резерв прекращается. Поэтому «Плановый бюджет» показывает регулярные расходы + активные отчисления, а «Ожидаемо всего» — регулярные расходы + траты, наступившие именно в этом месяце.</p></article><article className="content-card faq-card"><p className="eyebrow">05 / РИСК</p><h2>Откуда берётся вероятность крупных ремонтов</h2><p>Для каждого активного события симуляция бросает вероятность P и выбирает месяц внутри заданного окна. Событие считается крупным, если его максимальная стоимость достигает порога. Поэтому показатель меняется при добавлении, удалении, отключении, изменении P, максимальной цены и временного окна.</p><p>Факты «под вопросом» не повышают риск автоматически: это было бы выдуманной статистикой. Их влияние — в финансовом учёте, счётчике неопределённости и статусе «предварительный расчёт».</p></article><article className="content-card faq-card"><p className="eyebrow">06 / ДАННЫЕ</p><h2>Что можно менять</h2><ul><li>Общий фонд, лимиты, пробег, топливо и ежегодные базовые расходы.</li><li>Модели, варианты двигателя и тип ГРМ.</li><li>Потенциальные события: название, категория, P или срок, стоимость, K и максимум.</li><li>Шаблоны осмотра: этапы, подблоки, категории и элементы.</li></ul><p>Стандартные значения можно отключить или удалить из каталога. Старые осмотры сохраняют снимок конфигурации, пока вы явно не примените новую.</p></article><article className="content-card faq-card"><p className="eyebrow">07 / ЗОНЫ</p><h2>Как читать итог</h2><table className="faq-table"><thead><tr><th>Зона</th><th>Условие</th><th>Смысл</th></tr></thead><tbody><tr><td className="faq-green">Зелёная</td><td>Запас ≥ 20%</td><td>Есть рабочий резерв</td></tr><tr><td className="faq-yellow">Жёлтая</td><td>10–20%</td><td>Нужна осторожность</td></tr><tr><td className="faq-red">Красная</td><td>&lt; 10% или минус</td><td>Остановиться и перепроверить</td></tr></tbody></table></article><article className="content-card faq-card"><p className="eyebrow">08 / ВАЖНО</p><h2>Что не заменяет приложение</h2><p>Зелёная зона не гарантирует исправность автомобиля. Структурная коррозия, нарушение геометрии, неизвестный объём ДТП и сомнительная диагностика требуют решения специалиста независимо от суммы. Приложение помогает сравнить сценарии и не скрывает исходные коэффициенты.</p></article></div></section>;
}

function CompareView({ inspections, config, onOpen }: { inspections: Inspection[]; config: AppConfig; onOpen: (id: string) => void }) {
  const [sort, setSort] = useState('score');
  const rows = useMemo(() => inspections.map((inspection) => ({ inspection, result: calculateInspection(inspection) })).sort((left, right) => {
    if (sort === 'price') return left.result.calculationPrice - right.result.calculationPrice;
    if (sort === 'restore') return left.result.safeRestoreCost - right.result.safeRestoreCost;
    if (sort === 'remaining') return right.result.remainingBudget - left.result.remainingBudget;
    if (sort === 'ownership') return left.result.forecast.totalCost - right.result.forecast.totalCost;
    return (right.result.rating.score ?? -1) - (left.result.rating.score ?? -1);
  }), [inspections, sort]);
  return <section className="page-section"><div className="page-heading"><div><p className="eyebrow">ИСТОРИЯ / СРАВНЕНИЕ</p><h1>Сравнить автомобили</h1><p className="muted">Модели из текущего каталога и пользовательские профили.</p></div><label className="sort-control">Сортировать <select value={sort} onChange={(event) => setSort(event.target.value)}><option value="score">по рейтингу</option><option value="price">по цене</option><option value="restore">по доведению</option><option value="remaining">по остатку</option><option value="ownership">по владению</option></select></label></div>{rows.length === 0 ? <div className="empty-state"><div className="empty-icon">▦</div><h2>Сравнивать пока нечего</h2><p>Создайте хотя бы один осмотр, и он появится в этой таблице.</p></div> : <div className="content-card table-card"><div className="table-scroll"><table><thead><tr><th>Автомобиль</th><th>Цена</th><th>Доведение</th><th>Остаток</th><th>Опер. ₽/мес</th><th>Полные ₽/мес</th><th>Рейтинг</th><th>Зона</th></tr></thead><tbody>{rows.map(({ inspection, result }) => <tr key={inspection.id} className="clickable-row" onClick={() => onOpen(inspection.id)}><td><strong>{modelName(config, inspection.vehicle.modelId)}</strong><small>{inspection.vehicle.year} · {inspection.vehicle.mileage.toLocaleString('ru-RU')} км</small></td><td>{money(result.calculationPrice)}</td><td>{money(result.safeRestoreCost)}</td><td className={result.remainingBudget < 0 ? 'table-warn' : ''}>{money(result.remainingBudget)}</td><td>{money(result.forecast.averageMonthlyCost)}</td><td>{money(result.forecast.fullAverageMonthlyCost)}</td><td><strong>{result.rating.score ?? '—'}</strong></td><td><span className={`table-zone ${result.zone.toLowerCase()}`}>{zoneText(result.zone)}</span></td></tr>)}</tbody></table></div></div>}</section>;
}

function makeCustomModel(): ModelProfile {
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

function makeCustomEvent(modelId: ModelId): RepairEvent {
  return { id: `custom-event-${uid()}`, modelIds: [modelId], category: 'other', name: 'Новая потенциальная работа', probability5y: 0.5, repairCost: 20000, coefficient: 1.2, maxCost: 30000, monthStart: 1, monthEnd: 60, mode: 'RISK' };
}

function SettingsViewV2({ config, active, onUpdate, onApplyActive }: { config: AppConfig; active: Inspection | null; onUpdate: (updater: (config: AppConfig) => AppConfig) => void; onApplyActive: () => void }) {
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const setScenarioNumber = (key: 'annualKm' | 'fuelPrice' | 'annualLimit', value: number) => onUpdate((current) => { current.scenario[key] = value; return current; });
  const setArrayValue = (key: 'insuranceByYear' | 'serviceByYear' | 'fluidsByYear' | 'consumablesByYear' | 'tiresByYear' | 'washingByYear' | 'finesByYear', index: number, value: number) => onUpdate((current) => { current.scenario[key][index] = value; return current; });
  const updateModel = (modelId: ModelId, change: Partial<ModelProfile>) => onUpdate((current) => { const model = current.models.find((item) => item.id === modelId); if (model) Object.assign(model, change); return current; });
  const updateVariant = (modelId: ModelId, variantId: string, change: Partial<ModelProfile['engineVariants'][number]>) => onUpdate((current) => { const model = current.models.find((item) => item.id === modelId); const variant = model?.engineVariants.find((item) => item.id === variantId); if (variant) Object.assign(variant, change); return current; });
  const addVariant = (modelId: ModelId) => onUpdate((current) => { const model = current.models.find((item) => item.id === modelId); if (model) model.engineVariants.push({ id: `variant-${uid()}`, label: 'Новый вариант двигателя', code: '', timingDrive: 'UNKNOWN' }); return current; });
  const removeVariant = (modelId: ModelId, variantId: string) => onUpdate((current) => { const model = current.models.find((item) => item.id === modelId); if (model && model.engineVariants.length > 1) model.engineVariants = model.engineVariants.filter((item) => item.id !== variantId); return current; });
  const updateEvent = (eventId: string, change: Partial<RepairEvent>) => onUpdate((current) => { const event = current.repairEvents.find((item) => item.id === eventId); if (event) Object.assign(event, change); return current; });
  const addEvent = (modelId: ModelId) => onUpdate((current) => { const event = makeCustomEvent(modelId); current.repairEvents.push(event); const model = current.models.find((item) => item.id === modelId); if (model) model.repairEventIds = [...model.repairEventIds, event.id]; return current; });
  const removeEvent = (eventId: string) => { if (!window.confirm('Удалить потенциальное событие из каталога?')) return; onUpdate((current) => { current.repairEvents = current.repairEvents.filter((event) => event.id !== eventId); current.models.forEach((model) => { model.repairEventIds = model.repairEventIds.filter((id) => id !== eventId); }); return current; }); };
  const addModel = () => onUpdate((current) => { current.models.push(makeCustomModel()); return current; });
  const removeModel = (modelId: ModelId) => { if (!window.confirm('Удалить пользовательскую модель и её события из каталога?')) return; onUpdate((current) => { current.models = current.models.filter((model) => model.id !== modelId); current.repairEvents = current.repairEvents.filter((event) => !event.modelIds.includes(modelId)); current.templates = current.templates.map((template) => ({ ...template, modelIds: template.modelIds.filter((id) => id !== modelId) })).filter((template) => template.modelIds.length > 0); return current; }); };
  const startTemplateEdit = (template: InspectionTemplate) => {
    if (!template.isBuiltIn) { setEditingTemplateId(template.id); return; }
    const copy: InspectionTemplate = { ...template, id: `custom-template-${uid()}`, name: `${template.name} · мой вариант`, modelIds: [...template.modelIds], engineVariantIds: template.engineVariantIds ? [...template.engineVariantIds] : undefined, layout: cloneLayout(template.layout), isBuiltIn: false };
    onUpdate((current) => { current.templates.push(copy); return current; });
    setEditingTemplateId(copy.id);
  };
  const addTemplate = () => {
    const source = config.templates[0];
    const template: InspectionTemplate = { id: `custom-template-${uid()}`, name: 'Новый шаблон осмотра', description: 'Пользовательский набор этапов, подблоков и элементов.', modelIds: [config.models[0]?.id ?? ''], layout: cloneLayout(source?.layout ?? CLASSIC_INSPECTION_LAYOUT), isBuiltIn: false };
    onUpdate((current) => { current.templates.push(template); return current; });
    setEditingTemplateId(template.id);
  };
  const saveTemplate = (template: InspectionTemplate) => { onUpdate((current) => { current.templates = current.templates.map((item) => item.id === template.id ? template : item); return current; }); setEditingTemplateId(null); };
  const deleteTemplate = (templateId: string) => { if (!window.confirm('Удалить пользовательский шаблон?')) return; onUpdate((current) => { current.templates = current.templates.filter((template) => template.id !== templateId); return current; }); setEditingTemplateId(null); };
  return <section className="page-section settings-page">
    <div className="page-heading"><div><p className="eyebrow">КОНФИГУРАЦИЯ</p><h1>Настройки каталога</h1><p className="muted">Базовые автомобили, пользовательские модели, потенциальные работы и шаблоны собраны по отдельным группам.</p></div>{active && <button className="primary-button" onClick={onApplyActive}>Применить к текущему осмотру</button>}</div>
    <div className="info-strip"><span className="info-icon">i</span><span>Изменения применяются к новым осмотрам. Уже созданный осмотр хранит собственный снимок конфигурации до явного применения текущих настроек.</span></div>
    <div className="settings-grid"><div className="content-card"><div className="section-heading compact-heading"><div><p className="eyebrow">ОБЩИЕ ПРАВИЛА</p><h2>Бюджет</h2></div></div><div className="form-grid three"><Field label="Общий фонд, ₽"><input type="number" value={config.fund} onChange={(event) => onUpdate((current) => { current.fund = numberValue(event.target.value); return current; })} /></Field><Field label="Макс. объявления, ₽"><input type="number" value={config.maxAskingPrice} onChange={(event) => onUpdate((current) => { current.maxAskingPrice = numberValue(event.target.value); return current; })} /></Field><Field label="Целевая цена, ₽"><input type="number" value={config.targetPurchasePrice} onChange={(event) => onUpdate((current) => { current.targetPurchasePrice = numberValue(event.target.value); return current; })} /></Field></div><div className="form-grid two"><Field label="Зелёная зона, %"><input type="number" value={config.greenReserveRatio * 100} onChange={(event) => onUpdate((current) => { current.greenReserveRatio = numberValue(event.target.value) / 100; return current; })} /></Field><Field label="Жёлтая зона, %"><input type="number" value={config.yellowReserveRatio * 100} onChange={(event) => onUpdate((current) => { current.yellowReserveRatio = numberValue(event.target.value) / 100; return current; })} /></Field></div></div><div className="content-card"><div className="section-heading compact-heading"><div><p className="eyebrow">ОБЩИЕ ПРАВИЛА</p><h2>Сценарий эксплуатации</h2></div></div><div className="form-grid three"><Field label="Лет"><input type="number" min="1" max="20" value={config.scenario.years} onChange={(event) => onUpdate((current) => { current.scenario.years = numberValue(event.target.value); return current; })} /></Field><Field label="Пробег в год, км"><input type="number" value={config.scenario.annualKm} onChange={(event) => setScenarioNumber('annualKm', numberValue(event.target.value))} /></Field><Field label="АИ-95, ₽/л"><input type="number" step="0.1" value={config.scenario.fuelPrice} onChange={(event) => setScenarioNumber('fuelPrice', numberValue(event.target.value))} /></Field></div><div className="form-grid four"><Field label="Лимит в год, ₽"><input type="number" value={config.scenario.annualLimit} onChange={(event) => setScenarioNumber('annualLimit', numberValue(event.target.value))} /></Field><Field label="Крупный ремонт, ₽"><input type="number" value={config.majorRepairThreshold} onChange={(event) => onUpdate((current) => { current.majorRepairThreshold = numberValue(event.target.value); return current; })} /></Field><Field label="Крупных в год"><input type="number" value={config.majorRepairsPerYearLimit} onChange={(event) => onUpdate((current) => { current.majorRepairsPerYearLimit = numberValue(event.target.value); return current; })} /></Field><Field label="Интервал, мес."><input type="number" value={config.minMonthsBetweenMajorRepairs} onChange={(event) => onUpdate((current) => { current.minMonthsBetweenMajorRepairs = numberValue(event.target.value); return current; })} /></Field></div><div className="year-inputs"><div className="year-header"><span>Расход</span>{Array.from({ length: Math.min(config.scenario.years, 5) }, (_, index) => <span key={index}>Год {index + 1}</span>)}</div><YearInput label="ОСАГО" values={config.scenario.insuranceByYear} onChange={(index, value) => setArrayValue('insuranceByYear', index, value)} /><YearInput label="Плановое ТО" values={config.scenario.serviceByYear} onChange={(index, value) => setArrayValue('serviceByYear', index, value)} /><YearInput label="Жидкости" values={config.scenario.fluidsByYear} onChange={(index, value) => setArrayValue('fluidsByYear', index, value)} /><YearInput label="Расходники" values={config.scenario.consumablesByYear} onChange={(index, value) => setArrayValue('consumablesByYear', index, value)} /><YearInput label="Резина" values={config.scenario.tiresByYear} onChange={(index, value) => setArrayValue('tiresByYear', index, value)} /><YearInput label="Мойка" values={config.scenario.washingByYear} onChange={(index, value) => setArrayValue('washingByYear', index, value)} /><YearInput label="Штрафы" values={config.scenario.finesByYear} onChange={(index, value) => setArrayValue('finesByYear', index, value)} /></div></div></div>
    <div className="content-card full-width"><div className="section-heading compact-heading"><div><p className="eyebrow">КАТАЛОГ АВТОМОБИЛЕЙ</p><h2>Модели и конфигурации</h2><p className="muted">Базовые три модели можно уточнять; свои модели добавляются в этот же каталог и доступны при старте осмотра.</p></div><button className="primary-button" onClick={addModel}>＋ Добавить модель</button></div><div className="model-settings-groups">{config.models.map((model) => <ModelSettingsCard key={model.id} model={model} config={config} onUpdateModel={updateModel} onUpdateVariant={updateVariant} onAddVariant={addVariant} onRemoveVariant={removeVariant} onAddEvent={addEvent} onUpdateEvent={updateEvent} onRemoveEvent={removeEvent} onRemoveModel={removeModel} />)}</div></div>
    <div className="content-card full-width"><div className="section-heading compact-heading"><div><p className="eyebrow">ШАБЛОНЫ ОСМОТРА</p><h2>Наборы этапов и элементов</h2><p className="muted">Классические шаблоны и варианты под конкретный двигатель уже добавлены. Пользовательские шаблоны можно собрать из любого набора.</p></div><button className="primary-button" onClick={addTemplate}>＋ Создать шаблон</button></div>{editingTemplateId && <TemplateEditorPanel template={config.templates.find((item) => item.id === editingTemplateId) ?? config.templates[0]} config={config} onSave={saveTemplate} onCancel={() => setEditingTemplateId(null)} />}{!editingTemplateId && <div className="template-library">{config.templates.map((template) => <article className="template-card" key={template.id}><div><span className="step-chip">{template.isBuiltIn ? 'БАЗОВЫЙ' : 'МОЙ ШАБЛОН'}</span><h3>{template.name}</h3><p>{template.description}</p><small>{template.modelIds.map((id) => modelName(config, id)).join(' · ')} · {template.layout.length} этапов</small></div><div className="button-row"><button className="ghost-button compact-action" onClick={() => startTemplateEdit(template)}>{template.isBuiltIn ? 'Дублировать и изменить' : 'Изменить'}</button>{!template.isBuiltIn && <button className="action-button danger-action" onClick={() => deleteTemplate(template.id)}>Удалить</button>}</div></article>)}</div>}</div>
    <div className="content-card full-width"><div className="section-heading compact-heading"><div><p className="eyebrow">ОБЩИЕ ПРАВИЛА</p><h2>Рейтинг</h2></div><span className="muted">Сумма весов автоматически нормализуется до 100 баллов.</span></div><div className="coefficient-grid">{(Object.keys(config.ratingWeights) as Array<keyof AppConfig['ratingWeights']>).map((key) => <label key={key}><span>{RATING_WEIGHT_LABELS[key]}</span><input type="number" min="0" value={config.ratingWeights[key]} onChange={(event) => onUpdate((current) => { current.ratingWeights[key] = numberValue(event.target.value); return current; })} /></label>)}</div></div>
    <div className="content-card full-width"><div className="section-heading compact-heading"><div><p className="eyebrow">ОБЩИЕ ПРАВИЛА</p><h2>Коэффициенты неопределённости</h2></div><span className="muted">K увеличивает безопасную стоимость и не является вероятностью.</span></div><div className="coefficient-grid">{config.coefficients.map((rule) => <label key={rule.id}><span>{rule.label}</span><input type="number" step="0.01" min="1" value={rule.coefficient} onChange={(event) => onUpdate((current) => { const target = current.coefficients.find((item) => item.id === rule.id); if (target) target.coefficient = numberValue(event.target.value); return current; })} /></label>)}</div></div>
  </section>;
}

function ModelSettingsCard({ model, config, onUpdateModel, onUpdateVariant, onAddVariant, onRemoveVariant, onAddEvent, onUpdateEvent, onRemoveEvent, onRemoveModel }: { model: ModelProfile; config: AppConfig; onUpdateModel: (modelId: ModelId, change: Partial<ModelProfile>) => void; onUpdateVariant: (modelId: ModelId, variantId: string, change: Partial<ModelProfile['engineVariants'][number]>) => void; onAddVariant: (modelId: ModelId) => void; onRemoveVariant: (modelId: ModelId, variantId: string) => void; onAddEvent: (modelId: ModelId) => void; onUpdateEvent: (eventId: string, change: Partial<RepairEvent>) => void; onRemoveEvent: (eventId: string) => void; onRemoveModel: (modelId: ModelId) => void }) {
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const events = config.repairEvents.filter((event) => event.modelIds.includes(model.id));
  const updateRow = (event: RepairEvent, updater: (config: AppConfig) => AppConfig) => { const draft = { ...event }; const next = updater({ ...config, repairEvents: [draft] }).repairEvents[0]; if (next) onUpdateEvent(event.id, next); };
  return <article className="model-settings-card"><div className="model-settings-title"><div><span className="step-chip">{model.isBuiltIn ? 'БАЗОВАЯ МОДЕЛЬ' : 'ПОЛЬЗОВАТЕЛЬСКАЯ'}</span><h3>{modelName(config, model.id)}</h3><p>{model.generation || 'Поколение не указано'} · {model.engine || 'Двигатель не указан'} · {model.transmission || 'Коробка не указана'}</p></div>{!model.isBuiltIn && <button className="action-button danger-action" onClick={() => onRemoveModel(model.id)}>Удалить модель</button>}</div><div className="form-grid two model-profile-fields"><Field label="Отображаемое название"><input value={model.displayName ?? ''} onChange={(event) => onUpdateModel(model.id, { displayName: event.target.value })} placeholder="Например: Honda Civic VII" /></Field><Field label="Марка"><input value={model.make} onChange={(event) => onUpdateModel(model.id, { make: event.target.value })} placeholder="Марка" /></Field><Field label="Модель"><input value={model.model} onChange={(event) => onUpdateModel(model.id, { model: event.target.value })} placeholder="Модель" /></Field><Field label="Поколение"><input value={model.generation} onChange={(event) => onUpdateModel(model.id, { generation: event.target.value })} placeholder="Поколение" /></Field><Field label="Двигатель по умолчанию"><input value={model.engine} onChange={(event) => onUpdateModel(model.id, { engine: event.target.value })} placeholder="1.6" /></Field><Field label="Коробка"><input value={model.transmission} onChange={(event) => onUpdateModel(model.id, { transmission: event.target.value })} placeholder="AT" /></Field><Field label="Расход, л/100 км"><input type="number" step="0.1" value={model.consumptionLPer100Km} onChange={(event) => onUpdateModel(model.id, { consumptionLPer100Km: numberValue(event.target.value) })} /></Field><Field label="Налог, ₽/год"><input type="number" value={model.taxAnnual} onChange={(event) => onUpdateModel(model.id, { taxAnnual: numberValue(event.target.value) })} /></Field></div><div className="engine-variant-list"><div className="section-heading compact-heading"><strong>Варианты двигателя и ГРМ</strong><button className="ghost-button compact-action" onClick={() => onAddVariant(model.id)}>＋ Добавить вариант</button></div>{model.engineVariants.map((variant) => <div className="variant-editor" key={variant.id}><Field label="Название"><input value={variant.label} onChange={(event) => onUpdateVariant(model.id, variant.id, { label: event.target.value })} /></Field><Field label="Код"><input value={variant.code} onChange={(event) => onUpdateVariant(model.id, variant.id, { code: event.target.value })} placeholder="Например, 3ZZ-FE" /></Field><Field label="ГРМ"><select value={variant.timingDrive} onChange={(event) => onUpdateVariant(model.id, variant.id, { timingDrive: event.target.value as ModelProfile['engineVariants'][number]['timingDrive'] })}><option value="CHAIN">Цепь</option><option value="BELT">Ремень</option><option value="UNKNOWN">Неизвестно</option></select></Field><button className="action-button danger-action" onClick={() => onRemoveVariant(model.id, variant.id)}>Удалить</button></div>)}</div><div className="model-event-group"><div className="section-heading compact-heading"><div><p className="eyebrow">СОБЫТИЯ МОДЕЛИ</p><h3>Потенциальные работы</h3><p className="muted">P — вероятность за весь срок, K — запас к стоимости. Известный срок задаётся в месяцах.</p></div><button className="ghost-button compact-action" onClick={() => onAddEvent(model.id)}>＋ Добавить</button></div><div className="event-settings">{events.length === 0 && <div className="subtle-empty">Событий нет. Добавьте только те работы, которые нужны для этой модели.</div>}{events.map((event) => <div key={event.id}><SettingsEventRow event={event} onUpdate={(updater) => updateRow(event, updater)} onEdit={() => setEditingEventId(editingEventId === event.id ? null : event.id)} onRemove={() => onRemoveEvent(event.id)} />{editingEventId === event.id && <EventEditor event={event} allowMode onCancel={() => setEditingEventId(null)} onSave={(updated) => { onUpdateEvent(event.id, updated); setEditingEventId(null); }} />}</div>)}</div></div></article>;
}

function TemplateEditorPanel({ template, config, onSave, onCancel }: { template: InspectionTemplate; config: AppConfig; onSave: (template: InspectionTemplate) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<InspectionTemplate>(() => ({ ...template, modelIds: [...template.modelIds], engineVariantIds: template.engineVariantIds ? [...template.engineVariantIds] : undefined, layout: cloneLayout(template.layout), isBuiltIn: false }));
  const selectedModels = config.models.filter((model) => draft.modelIds.includes(model.id));
  const variants = selectedModels.flatMap((model) => model.engineVariants.map((variant) => ({ ...variant, modelId: model.id })));
  const toggleModel = (modelId: ModelId) => setDraft((current) => { const modelIds = current.modelIds.includes(modelId) ? current.modelIds.filter((id) => id !== modelId) : [...current.modelIds, modelId]; return { ...current, modelIds: modelIds.length > 0 ? modelIds : [modelId], engineVariantIds: undefined }; });
  const toggleVariant = (variantId: string) => setDraft((current) => { const ids = current.engineVariantIds ?? []; const next = ids.includes(variantId) ? ids.filter((id) => id !== variantId) : [...ids, variantId]; return { ...current, engineVariantIds: next.length > 0 ? next : undefined }; });
  return <div className="template-editor"><div className="form-section-title"><div><span className="step-chip">КОНСТРУКТОР ШАБЛОНА</span><strong>{draft.name}</strong></div><div className="button-row"><button className="ghost-button" onClick={onCancel}>Отмена</button><button className="primary-button" onClick={() => onSave(draft)}>Сохранить шаблон</button></div></div><div className="form-grid two"><Field label="Название шаблона"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Название" /></Field><Field label="Описание"><input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Для какой проверки шаблон" /></Field></div><div className="template-targets"><div><span className="field-label">Модели, для которых доступен шаблон</span><div className="check-grid">{config.models.map((model) => <label className="check-item" key={model.id}><input type="checkbox" checked={draft.modelIds.includes(model.id)} onChange={() => toggleModel(model.id)} />{modelName(config, model.id)}</label>)}</div></div>{variants.length > 0 && <div><span className="field-label">Ограничить вариантами двигателя (не выбирать — для всех)</span><div className="check-grid">{variants.map((variant) => <label className="check-item" key={`${variant.modelId}-${variant.id}`}><input type="checkbox" checked={draft.engineVariantIds?.includes(variant.id) ?? false} onChange={() => toggleVariant(variant.id)} />{variant.code || variant.label} · {variant.timingDrive === 'CHAIN' ? 'цепь' : variant.timingDrive === 'BELT' ? 'ремень' : 'тип ГРМ не указан'}</label>)}</div></div>}</div><InspectionLayoutEditor layout={draft.layout} onCancel={onCancel} onSave={(layout) => setDraft({ ...draft, layout })} /></div>;
}

function SettingsEventRow({ event, onUpdate, onEdit, onRemove }: { event: RepairEvent; onUpdate: (updater: (config: AppConfig) => AppConfig) => void; onEdit?: () => void; onRemove?: () => void }) {
  return <div className="event-setting"><div className="event-setting-name"><strong>{event.name}</strong><small>{categoryName(event.category)} · {event.mode === 'SCHEDULED' ? `срок ${event.monthStart} мес.` : `окно ${event.monthStart}–${event.monthEnd} мес.`}</small></div>{event.mode !== 'SCHEDULED' && <label>P, %<input type="number" min="0" max="100" value={Number((event.probability5y * 100).toFixed(2))} onChange={(input) => onUpdate((current) => { const target = current.repairEvents.find((item) => item.id === event.id)!; target.probability5y = numberValue(input.target.value) / 100; return current; })} /></label>}<label>Стоимость<input type="number" value={event.repairCost} onChange={(input) => onUpdate((current) => { const target = current.repairEvents.find((item) => item.id === event.id)!; target.repairCost = numberValue(input.target.value); return current; })} /></label><label>K<input type="number" step="0.01" value={event.coefficient} onChange={(input) => onUpdate((current) => { const target = current.repairEvents.find((item) => item.id === event.id)!; target.coefficient = numberValue(input.target.value); return current; })} /></label><label>Макс.<input type="number" value={event.maxCost} onChange={(input) => onUpdate((current) => { const target = current.repairEvents.find((item) => item.id === event.id)!; target.maxCost = numberValue(input.target.value); return current; })} /></label>{onEdit && <button className="action-button secondary-action" onClick={onEdit}>Изменить</button>}{onRemove && <button className="action-button danger-action" onClick={onRemove}>Удалить</button>}</div>;
}

function YearInput({ label, values, onChange }: { label: string; values: number[]; onChange: (index: number, value: number) => void }) {
  return <div className="year-row"><span>{label}</span>{values.slice(0, 5).map((value, index) => <input key={index} type="number" value={value} onChange={(event) => onChange(index, numberValue(event.target.value))} />)}</div>;
}

function RiskCard({ label, value, tone }: { label: string; value: string; tone: 'good' | 'warn' }) {
  return <div className={`risk-card ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="form-section"><h2>{title}</h2>{children}</section>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span className="field-label">{label}{hint && <small>{hint}</small>}</span>{children}</label>;
}

function MiniField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="mini-field"><span>{label}</span>{children}</label>;
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: 'positive' | 'warning' | 'danger' }) {
  return <div className={`metric ${accent ?? ''}`}><span>{label}</span><strong>{value}</strong></div>;
}

export default App;
