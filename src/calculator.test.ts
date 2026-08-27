import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, cloneConfig } from './config';
import { calculateInspection } from './calculator';
import type { Inspection } from './types';

function inspection(overrides: Partial<Inspection> = {}): Inspection {
  return {
    id: 'test-inspection',
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
    status: 'IN_PROGRESS',
    vehicle: { modelId: 'corolla-e120', year: 2006, mileage: 240000 },
    pricing: { askingPrice: 390000, expectedDiscount: 0 },
    facts: [],
    eventOverrides: {},
    configSnapshot: cloneConfig(DEFAULT_CONFIG),
    ...overrides,
  };
}

describe('auto inspection calculation', () => {
  it('calculates safe restoration cost and green reserve from facts', () => {
    const result = calculateInspection(
      inspection({
        pricing: { askingPrice: 390000, expectedDiscount: 0 },
        facts: [
          {
            id: '1',
            sequence: 1,
            kind: 'WORK',
            category: 'suspension',
            subcategory: 'Передняя',
            description: 'Стойки + опоры',
            statedCost: 22000,
            urgency: 'NOW',
            status: 'CONFIRMED',
            comment: '',
            bodyRisks: [],
            createdAt: '',
            updatedAt: '',
          },
          {
            id: '2',
            sequence: 2,
            kind: 'WORK',
            category: 'body',
            subcategory: 'Локальный ремонт',
            description: 'Левый порог',
            statedCost: 45000,
            urgency: 'SOON',
            status: 'QUESTION',
            comment: '',
            bodyRisks: [],
            createdAt: '',
            updatedAt: '',
          },
        ],
      }),
    );
    expect(result.restoreBudget).toBe(110000);
    expect(result.statedRestoreCost).toBe(67000);
    expect(result.safeRestoreCost).toBe(25300);
    expect(result.nearTermSafeRestoreCost).toBe(77050);
    expect(result.fullSafeRestoreCost).toBe(77050);
    expect(result.remainingBudget).toBe(84700);
    expect(result.zone).toBe('GREEN');
    expect(result.calculatedFacts[1].coefficient).toBe(1.15);
  });

  it('does not exclude a question fact from the financial calculation', () => {
    const base = calculateInspection(inspection());
    const withQuestion = calculateInspection(
      inspection({
        facts: [
          {
            id: '1',
            sequence: 1,
            kind: 'WORK',
            category: 'engine',
            subcategory: 'Мелкий ремонт',
            description: 'Прокладка',
            statedCost: 10000,
            urgency: 'NOW',
            status: 'QUESTION',
            comment: '',
            bodyRisks: [],
            createdAt: '',
            updatedAt: '',
          },
        ],
      }),
    );
    expect(withQuestion.safeRestoreCost).toBe(12000);
    expect(withQuestion.safeRestoreCost).toBeGreaterThan(base.safeRestoreCost);
  });

  it('marks an over-budget estimate as blocked and red', () => {
    const result = calculateInspection(
      inspection({
        facts: [
          {
            id: '1',
            sequence: 1,
            kind: 'WORK',
            category: 'body',
            subcategory: 'Полный окрас',
            description: 'Полный облив',
            statedCost: 120000,
            urgency: 'NOW',
            status: 'CONFIRMED',
            comment: '',
            bodyRisks: [],
            createdAt: '',
            updatedAt: '',
          },
        ],
      }),
    );
    expect(result.remainingBudget).toBeLessThan(0);
    expect(result.zone).toBe('RED');
    expect(result.rating.status).toBe('BLOCKED');
  });

  it('fails the primary filter based on asking price, even when the discount is large', () => {
    const result = calculateInspection(inspection({ pricing: { askingPrice: 470000, expectedDiscount: 50000 } }));
    expect(result.calculationPrice).toBe(420000);
    expect(result.zone).toBe('FILTER_FAIL');
    expect(result.rating.status).toBe('BLOCKED');
  });

  it('produces deterministic simulation results for the same inputs', () => {
    const first = calculateInspection(inspection());
    const second = calculateInspection(inspection());
    expect(second.forecast.probabilityCloseMajorRepairs).toBe(first.forecast.probabilityCloseMajorRepairs);
    expect(second.forecast.probabilityAnyLimitViolation).toBe(first.forecast.probabilityAnyLimitViolation);
    expect(second.rating.score).toBe(first.rating.score);
  });

  it('includes actual purchase price in the full monthly ownership view', () => {
    const result = calculateInspection(
      inspection({ pricing: { askingPrice: 390000, expectedDiscount: 20000, actualPurchasePrice: 350000 } }),
    );
    expect(result.calculationPrice).toBe(350000);
    expect(result.forecast.fullFiveYearCost).toBeGreaterThan(result.forecast.totalCost);
  });

  it('keeps deferred facts out of the immediate budget and moves them into the forecast', () => {
    const result = calculateInspection(
      inspection({
        facts: [
          {
            id: 'now',
            sequence: 1,
            kind: 'WORK',
            category: 'suspension',
            subcategory: 'Передняя',
            description: 'Стойки',
            statedCost: 10000,
            urgency: 'NOW',
            status: 'CONFIRMED',
            comment: '',
            bodyRisks: [],
            createdAt: '',
            updatedAt: '',
          },
          {
            id: 'soon',
            sequence: 2,
            kind: 'WORK',
            category: 'suspension',
            subcategory: 'Задняя',
            description: 'Втулки',
            statedCost: 10000,
            urgency: 'SOON',
            status: 'CONFIRMED',
            comment: '',
            bodyRisks: [],
            createdAt: '',
            updatedAt: '',
          },
          {
            id: 'planned',
            sequence: 3,
            kind: 'WORK',
            category: 'body',
            subcategory: 'Локальный ремонт',
            description: 'Полировка',
            statedCost: 10000,
            urgency: 'PLANNED',
            status: 'CONFIRMED',
            comment: '',
            bodyRisks: [],
            createdAt: '',
            updatedAt: '',
          },
        ],
      }),
    );
    expect(result.safeRestoreCost).toBe(11500);
    expect(result.nearTermSafeRestoreCost).toBe(23000);
    expect(result.fullSafeRestoreCost).toBe(34500);
    expect(result.forecast.years[0].deferredFacts).toBe(23000);
    expect(result.forecast.months).toHaveLength(60);
    expect(result.forecast.months[2].deferredFacts).toBe(11500);
    expect(result.forecast.months[8].deferredFacts).toBe(11500);
    expect(result.forecast.months[2].plannedReserve).toBeGreaterThan(0);
  });

  it('reports question facts as uncertainty metadata without inventing risk', () => {
    const clean = calculateInspection(inspection());
    const uncertain = calculateInspection(
      inspection({
        facts: [
          {
            id: 'condition-question',
            sequence: 1,
            kind: 'CONDITION',
            category: 'engine',
            subcategory: 'Общее состояние',
            description: 'Состояние технички не подтверждено',
            urgency: 'NOW',
            status: 'QUESTION',
            comment: '',
            bodyRisks: [],
            createdAt: '',
            updatedAt: '',
          },
        ],
      }),
    );
    expect(uncertain.questionFactsCount).toBe(1);
    expect(uncertain.questionShare).toBe(1);
    expect(uncertain.forecast.questionFactsCount).toBe(1);
    expect(uncertain.forecast.probabilityAnyMajorRepair).toBe(clean.forecast.probabilityAnyMajorRepair);
    expect(uncertain.rating.score).toBe(clean.rating.score);
  });

  it('supports a custom repair with an explicit deadline after purchase', () => {
    const result = calculateInspection(
      inspection({
        customEvents: [
          {
            id: 'custom-1',
            modelIds: ['corolla-e120'],
            category: 'maintenance',
            name: 'Замена радиатора',
            probability5y: 1,
            repairCost: 10000,
            coefficient: 1.2,
            maxCost: 15000,
            monthStart: 4,
            monthEnd: 4,
            mode: 'SCHEDULED',
            scheduledMonth: 4,
          },
        ],
      }),
    );
    const row = result.forecast.eventRows.find((item) => item.event.id === 'custom-1');
    expect(row?.mode).toBe('SCHEDULED');
    expect(row?.expectedCost).toBe(12000);
    expect(result.forecast.years[0].expectedRepairs).toBeGreaterThanOrEqual(12000);
  });

  it('slightly lowers the rating for accident, duplicate documents and fewer than two keys', () => {
    const clean = calculateInspection(
      inspection({
        vehicle: {
          modelId: 'corolla-e120',
          year: 2006,
          mileage: 240000,
          documentsStatus: 'ORIGINAL',
          keyCount: 2,
          accidentStatus: 'NO',
        },
      }),
    );
    const risky = calculateInspection(
      inspection({
        vehicle: {
          modelId: 'corolla-e120',
          year: 2006,
          mileage: 240000,
          documentsStatus: 'DUPLICATE_WITHOUT_ORIGINAL',
          keyCount: 1,
          accidentStatus: 'YES',
        },
      }),
    );
    expect(risky.rating.score).toBeLessThan(clean.rating.score ?? 0);
    expect(risky.rating.components.find((component) => component.id === 'vehicle-info')?.score).toBeLessThan(100);
  });

  it('removes a default event from the current inspection without changing the global catalog', () => {
    const result = calculateInspection(inspection({ eventOverrides: { 'corolla-timing-chain': { removed: true } } }));
    expect(result.forecast.eventRows.some((row) => row.event.id === 'corolla-timing-chain')).toBe(false);
    expect(DEFAULT_CONFIG.repairEvents.some((event) => event.id === 'corolla-timing-chain')).toBe(true);
  });

  it('allows a standard event to be switched to a scheduled repair', () => {
    const result = calculateInspection(
      inspection({ eventOverrides: { 'corolla-timing-chain': { mode: 'SCHEDULED', scheduledMonth: 4 } } }),
    );
    const row = result.forecast.eventRows.find((item) => item.event.id === 'corolla-timing-chain');
    expect(row?.mode).toBe('SCHEDULED');
    expect(row?.event.monthStart).toBe(4);
    expect(row?.event.probability5y).toBe(1);
  });

  it('accumulates each repair reserve only until its due month', () => {
    const config = cloneConfig(DEFAULT_CONFIG);
    config.repairEvents = [];
    const result = calculateInspection(
      inspection({
        configSnapshot: config,
        customEvents: [
          {
            id: 'scheduled-1',
            modelIds: ['corolla-e120'],
            category: 'engine',
            name: 'Замена цепи',
            probability5y: 1,
            repairCost: 10000,
            coefficient: 1.2,
            maxCost: 15000,
            monthStart: 5,
            monthEnd: 5,
            mode: 'SCHEDULED',
            scheduledMonth: 5,
          },
        ],
      }),
      config,
    );
    expect(result.forecast.months[0].plannedReserve).toBe(2400);
    expect(result.forecast.months[3].plannedReserve).toBe(2400);
    expect(result.forecast.months[4].scheduledEvents).toBe(12000);
    expect(result.forecast.months[4].expectedRepairs).toBe(0);
    expect(result.forecast.months[5].plannedReserve).toBe(0);
    expect(result.forecast.months[4].reserveBalance).toBe(0);
  });

  it('uses the midpoint of a risk window for the deterministic cash-flow plan', () => {
    const config = cloneConfig(DEFAULT_CONFIG);
    config.repairEvents = [];
    const result = calculateInspection(
      inspection({
        configSnapshot: config,
        customEvents: [
          {
            id: 'risk-1',
            modelIds: ['corolla-e120'],
            category: 'suspension',
            name: 'Ступичный подшипник',
            probability5y: 0.5,
            repairCost: 10000,
            coefficient: 1.2,
            maxCost: 15000,
            monthStart: 3,
            monthEnd: 6,
            mode: 'RISK',
          },
        ],
      }),
      config,
    );
    expect(result.forecast.months[3].plannedReserve).toBe(1200);
    expect(result.forecast.months[4].expectedRepairs).toBe(6000);
    expect(result.forecast.months[5].plannedReserve).toBe(0);
  });
});

describe('краевые случаи и защита от испорченных данных', () => {
  it('учитывает цену автомобиля в полной стоимости владения даже при нулевой фактической цене', () => {
    // Регрессия: `actualPurchasePrice ?? ...` не срабатывал на нуле,
    // и полная стоимость занижалась ровно на цену автомобиля.
    const withZero = calculateInspection(
      inspection({ pricing: { askingPrice: 390000, expectedDiscount: 40000, actualPurchasePrice: 0 } }),
    );
    const withoutActual = calculateInspection(
      inspection({ pricing: { askingPrice: 390000, expectedDiscount: 40000 } }),
    );
    expect(withZero.calculationPrice).toBe(350000);
    expect(withZero.forecast.fullFiveYearCost).toBe(withoutActual.forecast.fullFiveYearCost);
    expect(withZero.forecast.fullFiveYearCost - withZero.forecast.totalCost).toBe(350000);
  });

  it('не даёт отрицательной стоимости работы улучшить смету', () => {
    const result = calculateInspection(
      inspection({
        facts: [
          {
            id: 'neg',
            sequence: 1,
            kind: 'WORK',
            category: 'tires',
            subcategory: 'Летняя',
            description: 'скидка',
            statedCost: -50000,
            urgency: 'NOW',
            status: 'CONFIRMED',
            comment: '',
            bodyRisks: [],
            createdAt: '',
            updatedAt: '',
          },
        ],
      }),
    );
    expect(result.safeRestoreCost).toBe(0);
    expect(result.statedRestoreCost).toBe(0);
    expect(result.unknownCostCount).toBe(1);
  });

  it('не меняет вероятности при переименовании события', () => {
    const original = cloneConfig(DEFAULT_CONFIG);
    const renamed = cloneConfig(DEFAULT_CONFIG);
    renamed.repairEvents[0].name = 'Другое название той же работы';
    const first = calculateInspection(inspection({ configSnapshot: original }), original);
    const second = calculateInspection(inspection({ configSnapshot: renamed }), renamed);
    expect(second.forecast.probabilityAnyLimitViolation).toBe(first.forecast.probabilityAnyLimitViolation);
    expect(second.forecast.probabilityCriticalRepair).toBe(first.forecast.probabilityCriticalRepair);
    expect(second.rating.score).toBe(first.rating.score);
  });

  it('меняет вероятности, когда меняется сам параметр риска', () => {
    const original = cloneConfig(DEFAULT_CONFIG);
    const riskier = cloneConfig(DEFAULT_CONFIG);
    riskier.repairEvents[0].probability5y = 0.9;
    const first = calculateInspection(inspection({ configSnapshot: original }), original);
    const second = calculateInspection(inspection({ configSnapshot: riskier }), riskier);
    expect(second.forecast.probabilityEngineEvent).toBeGreaterThan(first.forecast.probabilityEngineEvent);
  });

  it('не превращает рейтинг в NaN при нулевом горизонте прогноза', () => {
    const broken = cloneConfig(DEFAULT_CONFIG);
    broken.scenario.years = 0;
    const result = calculateInspection(inspection({ configSnapshot: broken }), broken);
    expect(Number.isFinite(result.rating.score ?? Number.NaN)).toBe(true);
    expect(Number.isFinite(result.forecast.averageMonthlyCost)).toBe(true);
    expect(result.forecast.months.length).toBeGreaterThan(0);
    expect(result.rating.status).toBe('BLOCKED');
    expect(result.rating.hardBlocks).toContain('Прогноз владения настроен не полностью.');
  });

  it('возвращает пустой рейтинг вместо нуля, когда все веса обнулены', () => {
    const zeroed = cloneConfig(DEFAULT_CONFIG);
    (Object.keys(zeroed.ratingWeights) as Array<keyof typeof zeroed.ratingWeights>).forEach((key) => {
      zeroed.ratingWeights[key] = 0;
    });
    const result = calculateInspection(inspection({ configSnapshot: zeroed }), zeroed);
    expect(result.rating.score).toBeNull();
  });

  it('различает критический кузовной риск и оцениваемую кузовную работу', () => {
    const bodyFact = (risk: 'longerons' | 'weak_sills') =>
      inspection({
        facts: [
          {
            id: 'b',
            sequence: 1,
            kind: 'CONDITION',
            category: 'body',
            subcategory: 'Локальный ремонт',
            description: 'осмотр кузова',
            urgency: 'PLANNED',
            status: 'CONFIRMED',
            comment: '',
            bodyRisks: [risk],
            createdAt: '',
            updatedAt: '',
          },
        ],
      });
    const critical = calculateInspection(bodyFact('longerons'));
    expect(critical.criticalBodyRisks).toContain('longerons');
    expect(critical.rating.hardBlocks).toContain('Есть критический кузовной или геометрический риск.');

    const repairable = calculateInspection(bodyFact('weak_sills'));
    expect(repairable.criticalBodyRisks).toHaveLength(0);
    expect(repairable.otherBodyRisks).toContain('weak_sills');
    expect(repairable.rating.hardBlocks).toHaveLength(0);
    expect(repairable.rating.warnings).toContain('Отмечен кузовной риск, оцениваемый как ремонтная работа.');
  });

  it('сохраняет сходимость помесячного и годового прогноза', () => {
    const result = calculateInspection(inspection());
    const monthSum = result.forecast.months.reduce((sum, month) => sum + month.expectedTotal, 0);
    expect(Math.round(monthSum)).toBe(Math.round(result.forecast.totalCost));
  });
});
