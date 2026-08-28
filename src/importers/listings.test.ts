import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, cloneConfig } from '../config';
import { calculateInspection } from '../calc';
import { ListingError, buildScreening, listingKey } from './listings';
import type { ListingBatch } from './listings';

const config = cloneConfig(DEFAULT_CONFIG);

const batch = (cars: ListingBatch['cars']): ListingBatch => ({ source: 'avito', cars });

const cerato = {
  url: 'https://www.avito.ru/vidnoe/avtomobili/kia_cerato_1.6_at_2008_421_600_km_842',
  title: 'Kia Cerato 1.6 AT, 2008',
  model: 'cerato-ld',
  year: 2008,
  mileage: 421600,
  askingPrice: 170000,
};

describe('сборка осмотров из объявлений', () => {
  it('привязывает факт к этапу, блоку и элементу так же, как это делает экран осмотра', () => {
    const { added } = buildScreening(config, [], batch([{ ...cerato, facts: [{ element: 'Течи масла', state: 'WORK', details: 'устранить течь', urgency: 'SOON' }] }]));
    expect(added[0].facts[0]).toMatchObject({
      kind: 'WORK', category: 'engine', subcategory: 'Диагностика',
      description: 'Течи масла: устранить течь', urgency: 'SOON', status: 'CONFIRMED',
      group: 'Двигатель и охлаждение', stageId: 'engine', blockId: 'engine-operation', elementId: 'Течи масла',
    });
  });

  it('оставляет стоимость пустой, чтобы работу посчитал справочник цен', () => {
    const { added } = buildScreening(config, [], batch([{ ...cerato, facts: [{ element: 'Кондиционер', state: 'WORK' }] }]));
    const result = calculateInspection(added[0], config, { withRisk: false });
    expect(added[0].facts[0].statedCost).toBeUndefined();
    expect(result.calculatedFacts[0].costSource).toBe('PRICEBOOK');
    expect(result.calculatedFacts[0].safeCost).toBeGreaterThan(0);
  });

  it('принимает любое название элемента ГРМ: в осмотре он один и зависит от привода', () => {
    const belt = buildScreening(config, [], batch([{ ...cerato, engineVariant: 'g4ed', facts: [{ element: 'Цепь ГРМ и натяжитель', state: 'QUESTION' }] }]));
    expect(belt.added[0].facts[0].elementId).toBe('Ремень ГРМ и ролики');
    // Код двигателя по объявлению не определить, поэтому у машины с этапа отбора элемент остаётся общим.
    const unknown = buildScreening(config, [], batch([{ ...cerato, facts: [{ element: 'Ремень ГРМ и ролики', state: 'QUESTION' }] }]));
    expect(unknown.added[0].facts[0].elementId).toBe('ГРМ: уточнить тип и состояние');
  });

  it('пропускает объявление, уже попавшее в файл, и не создаёт второй осмотр', () => {
    const first = buildScreening(config, [], batch([cerato]));
    const again = buildScreening(config, first.inspections, batch([{ ...cerato, url: `${cerato.url}?context=other` }]));
    expect(again.added).toHaveLength(0);
    expect(again.skipped).toHaveLength(1);
    expect(again.inspections).toHaveLength(1);
  });

  it('в режиме дополнения обновляет цену и факты по элементу, сохраняя остальные и id осмотра', () => {
    const first = buildScreening(config, [], batch([{ ...cerato, facts: [{ element: 'Течи масла', state: 'WORK' }, { element: 'Диски', state: 'QUESTION' }] }]));
    const second = buildScreening(config, first.inspections, batch([{ ...cerato, askingPrice: 150000, facts: [{ element: 'Течи масла', state: 'QUESTION', comment: 'на деталке видно сухо' }] }]), { merge: true });
    const inspection = second.merged[0];
    expect(inspection.id).toBe(first.added[0].id);
    expect(inspection.pricing.askingPrice).toBe(150000);
    expect(inspection.facts.find((fact) => fact.elementId === 'Течи масла')).toMatchObject({ status: 'QUESTION', comment: 'на деталке видно сухо' });
    expect(inspection.facts.find((fact) => fact.elementId === 'Диски')).toBeDefined();
  });

  it('не собирает файл частично: ошибка в одном объявлении отменяет всю пачку', () => {
    expect(() => buildScreening(config, [], batch([cerato, { ...cerato, url: `${cerato.url}-2`, facts: [{ element: 'Турбина', state: 'WORK' }] }])))
      .toThrow(ListingError);
    try {
      buildScreening(config, [], batch([{ ...cerato, model: 'kia-rio' }, { ...cerato, url: `${cerato.url}-3`, year: undefined }]));
    } catch (error) {
      expect((error as ListingError).problems).toHaveLength(2);
      expect((error as ListingError).problems[0]).toContain('не найдена');
      expect((error as ListingError).problems[1]).toContain('year');
    }
  });

  it('подсказывает похожие элементы, когда название написано неточно', () => {
    try {
      buildScreening(config, [], batch([{ ...cerato, facts: [{ element: 'Передние колодки', state: 'WORK' }] }]));
    } catch (error) {
      expect((error as ListingError).problems[0]).toContain('Передние диски и колодки');
    }
  });

  it('считает ключом ссылку без параметров показа', () => {
    expect(listingKey('https://www.avito.ru/x_1?context=AAA#top')).toBe('https://www.avito.ru/x_1');
  });
});
