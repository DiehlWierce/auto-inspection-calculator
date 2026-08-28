import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../config';
import { factsFromListing, matchModel, vehicleFromListing } from './rules';
import type { ParsedListing } from './avito';

const listing = (description: string, extra: Partial<ParsedListing> = {}): ParsedListing => ({
  itemId: '1', url: 'https://www.avito.ru/x_1', title: 'Kia Cerato 1.6 AT, 2008',
  name: 'Kia Cerato', engineVolume: 1.6, transmission: 'AT', year: 2008, mileage: 180000,
  price: 300000, city: 'Москва', description, ...extra,
});

describe('правила разбора объявления', () => {
  it('заводит работу только по прямому указанию дефекта и кладёт цитату в комментарий', () => {
    const facts = factsFromListing(listing('Течет масло из-под клапанной крышки.'), { wear: false });
    expect(facts).toEqual([expect.objectContaining({ element: 'Течи масла', state: 'WORK', urgency: 'SOON' })]);
    expect(facts[0].comment).toContain('Течет масло из-под клапанной крышки');
  });

  it('чинит названный порог, а не оба сразу', () => {
    const facts = factsFromListing(listing('Порог левый подваривали.'), { wear: false });
    expect(facts.map((fact) => fact.element)).toEqual(['Левый порог']);
  });

  it('оставляет «не бита не крашена» под вопросом: это слова продавца', () => {
    const facts = factsFromListing(listing('Не бита, не крашена.'), { wear: false });
    expect(facts).toEqual([expect.objectContaining({ element: 'Геометрия кузова', state: 'QUESTION' })]);
    expect(vehicleFromListing(listing('Не бита, не крашена.')).accidentStatus).toBe('UNKNOWN');
  });

  it('складывает вопросы разных правил об одном элементе в один факт', () => {
    const facts = factsFromListing(listing('ГРМ менял на 180 тысячах, чеки есть.'), { wear: true });
    const timing = facts.filter((fact) => fact.element === 'ГРМ: уточнить тип и состояние');
    expect(timing).toHaveLength(1);
    expect(timing[0].comment).toContain('чеки есть');
    expect(timing[0].comment).toContain('180 000 км');
  });

  it('выводит из пробега и возраста только вопросы, но не работы', () => {
    const facts = factsFromListing(listing('', { mileage: 300000, year: 2005 }));
    expect(facts.every((fact) => fact.state === 'QUESTION')).toBe(true);
    expect(facts.map((fact) => fact.element)).toContain('Компрессия');
  });

  it('читает ПТС, ключи и ДТП из текста', () => {
    expect(vehicleFromListing(listing('ПТС дубликат, один ключ. Была в ДТП.'))).toMatchObject({
      documentsStatus: 'DUPLICATE_WITHOUT_ORIGINAL', keyCount: 1, accidentStatus: 'YES',
    });
  });

  it('отбивает чужое поколение, объём и коробку вместо подстановки ближайшей модели', () => {
    expect(matchModel(DEFAULT_CONFIG, listing('', { year: 2012 }))).toEqual({ reason: expect.stringContaining('поколения LD') });
    expect(matchModel(DEFAULT_CONFIG, listing('', { engineVolume: 2 }))).toEqual({ reason: expect.stringContaining('двигатель 2') });
    expect(matchModel(DEFAULT_CONFIG, listing('', { transmission: 'MT' }))).toEqual({ reason: expect.stringContaining('коробка MT') });
    expect(matchModel(DEFAULT_CONFIG, listing('', { name: 'Lada Granta' }))).toEqual({ reason: expect.stringContaining('нет такой модели') });
  });

  it('сопоставляет подходящее объявление с моделью и оставляет вариант двигателя неизвестным', () => {
    expect(matchModel(DEFAULT_CONFIG, listing(''))).toMatchObject({ model: expect.objectContaining({ id: 'cerato-ld' }), variantId: 'unknown' });
  });
});
