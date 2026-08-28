export type ModelId = string;
export type BuiltInModelId = 'corolla-e120' | 'cerato-ld' | 'lacetti-hatch';
export type InspectionStatus = 'IN_PROGRESS' | 'FINISHED_CANDIDATE' | 'FINISHED_REJECTED';
export type View = 'history' | 'new' | 'inspection' | 'forecast' | 'compare' | 'settings' | 'faq';
export type FactKind = 'WORK' | 'CONDITION';
export type FactStatus = 'CONFIRMED' | 'QUESTION';
export type FactUrgency = 'NOW' | 'SOON' | 'PLANNED' | 'OPTIONAL';
export type TimingDrive = 'CHAIN' | 'BELT' | 'UNKNOWN';

export type CategoryId =
  | 'maintenance'
  | 'engine'
  | 'transmission'
  | 'suspension'
  | 'brakes'
  | 'steering'
  | 'cooling'
  | 'ac'
  | 'electrics'
  | 'body'
  | 'tires'
  | 'interior'
  | 'exhaust'
  | 'other';

export type BodyRisk =
  | 'structural_corrosion'
  | 'longerons'
  | 'strut_towers'
  | 'weak_sills'
  | 'floor'
  | 'suspension_mounts'
  | 'geometry'
  | 'major_crash'
  | 'large_welding'
  | 'unestimable_scope';

export interface ModelProfile {
  id: ModelId;
  displayName?: string;
  isBuiltIn?: boolean;
  make: string;
  model: string;
  generation: string;
  engine: string;
  transmission: string;
  engineVariants: EngineVariant[];
  /** Поправка на стоимость запчастей относительно базового справочника. Работа не масштабируется. */
  partsFactor?: number;
  consumptionLPer100Km: number;
  taxAnnual: number;
  repairEventIds: string[];
}

export interface EngineVariant {
  id: string;
  label: string;
  code: string;
  timingDrive: TimingDrive;
  note?: string;
}

export interface CostSpread {
  min: number;
  typical: number;
  max: number;
}

export interface PriceRangeRule {
  id: string;
  label: string;
  category: CategoryId;
  min: number;
  typical: number;
  max: number;
  /** Стоимость запчастей и материалов без работы. Основа, из которой выведены min/typical/max. */
  parts?: CostSpread;
  /** Нормо-часы на работу. Умножаются на ставку сервиса из конфигурации. */
  laborHours?: CostSpread;
  /** Что входит в работу: сторона, комплектность, оговорки. */
  scope?: string;
  /** Ключевые слова элемента осмотра и описания факта для подбора работы. */
  match?: string[];
  /** Общая вилка категории — берётся, когда конкретная работа не опознана. */
  fallback?: boolean;
}

export interface CoefficientRule {
  id: string;
  category: CategoryId;
  label: string;
  coefficient: number;
}

export interface RepairEvent {
  id: string;
  modelIds: ModelId[];
  category: CategoryId;
  name: string;
  probability5y: number;
  repairCost: number;
  coefficient: number;
  maxCost: number;
  monthStart: number;
  monthEnd: number;
  mode?: 'RISK' | 'SCHEDULED';
  scheduledMonth?: number;
  recurrenceMonths?: number;
  ageSensitive?: boolean;
}

export interface WearConfig {
  refAgeYears: number;
  agePerYear: number;
  refMileageKm: number;
  mileagePer100k: number;
  min: number;
  maxMultiplier: number;
}

export interface ScenarioConfig {
  years: number;
  annualKm: number;
  fuelPrice: number;
  insuranceByYear: number[];
  serviceByYear: number[];
  fluidsByYear: number[];
  consumablesByYear: number[];
  tiresByYear: number[];
  washingByYear: number[];
  finesByYear: number[];
  annualLimit: number;
}

export interface RatingWeights {
  budget: number;
  ownership: number;
  annualRisk: number;
  frequency: number;
  maxRepair: number;
  engine: number;
  transmission: number;
  predictability: number;
  service: number;
  vehicleInfo: number;
}

export interface AppConfig {
  id: 'current';
  version: string;
  fund: number;
  maxAskingPrice: number;
  targetPurchasePrice: number;
  greenReserveRatio: number;
  yellowReserveRatio: number;
  majorRepairThreshold: number;
  criticalRepairThreshold: number;
  majorRepairsPerYearLimit: number;
  minMonthsBetweenMajorRepairs: number;
  simulationScenarios: number;
  simulationSeed: number;
  ratingWeights: RatingWeights;
  wear: WearConfig;
  scenario: ScenarioConfig;
  models: ModelProfile[];
  coefficients: CoefficientRule[];
  laborRate: CostSpread;
  priceBook: PriceRangeRule[];
  repairEvents: RepairEvent[];
  templates: InspectionTemplate[];
}

export interface Pricing {
  askingPrice: number;
  expectedDiscount: number;
  actualPurchasePrice?: number;
}

export interface VehicleInfo {
  modelId: ModelId;
  engineVariantId?: string;
  year: number;
  mileage: number;
  vin?: string;
  plate?: string;
  listingUrl?: string;
  listingSource?: string;
  documentsStatus?: 'ORIGINAL' | 'DUPLICATE_WITH_ORIGINAL' | 'DUPLICATE_WITHOUT_ORIGINAL' | 'UNKNOWN';
  keyCount?: number;
  accidentStatus?: 'NO' | 'YES' | 'UNKNOWN';
  accidentOutcomes?: string[];
  accidentComment?: string;
}

export interface Fact {
  id: string;
  sequence: number;
  kind: FactKind;
  category: CategoryId;
  subcategory: string;
  description: string;
  statedCost?: number;
  urgency: FactUrgency;
  status: FactStatus;
  comment: string;
  bodyRisks: BodyRisk[];
  createdAt: string;
  updatedAt: string;
  group?: string;
  stageId?: string;
  blockId?: string;
  elementId?: string;
}

export interface InspectionBlockConfig {
  id: string;
  label: string;
  category: CategoryId;
  subcategory: string;
  elements: string[];
}

export interface InspectionStageConfig {
  id: string;
  label: string;
  description: string;
  categories: CategoryId[];
  blocks: InspectionBlockConfig[];
}

export type InspectionLayout = InspectionStageConfig[];

export interface InspectionTemplate {
  id: string;
  name: string;
  description: string;
  modelIds: ModelId[];
  engineVariantIds?: string[];
  layout: InspectionLayout;
  isBuiltIn?: boolean;
}

export interface EventOverride {
  enabled?: boolean;
  removed?: boolean;
  name?: string;
  category?: CategoryId;
  mode?: 'RISK' | 'SCHEDULED';
  scheduledMonth?: number;
  probability5y?: number;
  repairCost?: number;
  coefficient?: number;
  maxCost?: number;
  monthStart?: number;
  monthEnd?: number;
  recurrenceMonths?: number;
}

export interface Inspection {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: InspectionStatus;
  vehicle: VehicleInfo;
  pricing: Pricing;
  facts: Fact[];
  eventOverrides: Record<string, EventOverride>;
  customEvents?: RepairEvent[];
  templateId?: string;
  inspectionLayout?: InspectionLayout;
  configSnapshot: AppConfig;
}

export type CostSource = 'STATED' | 'PRICEBOOK' | 'UNKNOWN';

export interface CalculatedFact extends Fact {
  coefficient: number;
  estimatedCost: number;
  costSource: CostSource;
  priceRange?: { min: number; typical: number; max: number };
  safeCost: number;
}

export interface YearForecast {
  year: number;
  fuel: number;
  insurance: number;
  tax: number;
  service: number;
  fluids: number;
  consumables: number;
  tires: number;
  washing: number;
  fines: number;
  deferredFacts: number;
  expectedRepairs: number;
  expectedTotal: number;
  p80Total: number;
  p90Total: number;
  probabilityLimitViolation: number | null;
  probabilityMajorRepairLimitViolation: number | null;
  probabilityAnyMajorRepair: number | null;
}

export interface MonthForecast {
  month: number;
  year: number;
  regularExpenses: number;
  fuel: number;
  insurance: number;
  tax: number;
  service: number;
  fluids: number;
  consumables: number;
  tires: number;
  washing: number;
  fines: number;
  deferredFacts: number;
  scheduledEvents: number;
  expectedRepairs: number;
  plannedReserve: number;
  plannedBudget: number;
  expectedTotal: number;
  p50Total: number;
  p80Total: number;
  p90Total: number;
  reserveBalance: number;
}

export interface ForecastResult {
  years: YearForecast[];
  totalCost: number;
  averageMonthlyCost: number;
  fullFiveYearCost: number;
  fullAverageMonthlyCost: number;
  expectedMajorRepairs5y: number;
  expectedMajorRepairsPerYear: number;
  p80MonthlyCost: number;
  p80FiveYearCost: number;
  expectedRecurringSpend5y: number;
  expectedOneShotSpend5y: number;
  probabilityAnyLimitViolation: number | null;
  probabilityAnyMajorRepairLimitViolation: number | null;
  probabilityAnyMajorRepair: number | null;
  probabilityCloseMajorRepairs: number | null;
  probabilityCriticalRepair: number | null;
  probabilityEngineEvent: number;
  probabilityTransmissionEvent: number;
  riskPending: boolean;
  uncertaintyLoad: number;
  eventRows: Array<{
    event: RepairEvent;
    enabled: boolean;
    expectedCost: number;
    riskCost: number;
    recurrenceMonths: number;
    mode: 'RISK' | 'SCHEDULED';
  }>;
  months: MonthForecast[];
  questionFactsCount: number;
  confirmedFactsCount: number;
  questionShare: number;
  complete: boolean;
}

export interface RatingResult {
  score: number | null;
  components: Array<{ id: string; label: string; weight: number; score: number | null }>;
  hardBlocks: string[];
  warnings: string[];
  status: 'VALID' | 'PROVISIONAL' | 'BLOCKED';
}

export interface CalculationResult {
  calculationPrice: number;
  priceSource: 'ACTUAL' | 'ASKING_MINUS_DISCOUNT';
  restoreBudget: number;
  statedRestoreCost: number;
  immediateSafeRestoreCost: number;
  nearTermSafeRestoreCost: number;
  fullSafeRestoreCost: number;
  deferredSafeRestoreCost: number;
  safeRestoreCost: number;
  uncertaintyPremium: number;
  fullUncertaintyPremium: number;
  remainingBudget: number;
  reserveRatio: number | null;
  fullRemainingBudget: number;
  fullReserveRatio: number | null;
  zone: 'GREEN' | 'YELLOW' | 'RED' | 'FILTER_FAIL';
  calculatedFacts: CalculatedFact[];
  criticalBodyRisks: BodyRisk[];
  unknownCostCount: number;
  estimatedFactsCount: number;
  questionFactsCount: number;
  confirmedFactsCount: number;
  questionShare: number;
  forecast: ForecastResult;
  rating: RatingResult;
}
