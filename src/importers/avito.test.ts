import { describe, expect, it } from 'vitest';
import { parseAvitoHtml } from './avito';

const card = (id: string, slug: string, alt: string, description = '') => `
  <div data-marker="item" data-item-id="${id}" id="i${id}" itemscope itemtype="http://schema.org/Product">
    <meta itemprop="description" content="${description}">
    <a data-marker="item-photo-sliderLink" itemprop="url" href="${slug}?context=H4sIAAAA" target="_blank">
      <div data-marker="item-photo"><img alt="${alt}" itemprop="image" src="https://70.img.avito.st/image/1/x.jpg"></div>
    </a>
  </div>`;

const cerato = card(
  '8429715498',
  '/vidnoe/avtomobili/kia_cerato_1.6_at_2008_421_600_km_8429715498',
  'Kia Cerato 1.6 AT, 2008, 421&nbsp;600&nbsp;км, с пробегом, цена 170&nbsp;000 руб., Видное',
  'На ходу.\nНо течет масло со шруса.',
);

describe('парсер выдачи Avito', () => {
  it('снимает модель, год, пробег, цену и город с заголовка карточки', () => {
    const [listing] = parseAvitoHtml(`<div data-marker="catalog-serp">${cerato}</div>`);
    expect(listing).toMatchObject({
      itemId: '8429715498',
      url: 'https://www.avito.ru/vidnoe/avtomobili/kia_cerato_1.6_at_2008_421_600_km_8429715498',
      name: 'Kia Cerato',
      engineVolume: 1.6,
      transmission: 'AT',
      year: 2008,
      mileage: 421600,
      price: 170000,
      city: 'Видное',
    });
    expect(listing.description).toBe('На ходу. Но течет масло со шруса.');
  });

  it('обрезает у ссылки контекст показа, который меняется от захода к заходу', () => {
    const [listing] = parseAvitoHtml(cerato);
    expect(listing.url).not.toContain('context=');
  });

  it('берёт данные из слага, когда alt карточки не сохранился', () => {
    const withoutAlt = card('7712340001', '/moskva/avtomobili/toyota_corolla_1.6_at_2006_198_000_km_7712340001', '');
    const [listing] = parseAvitoHtml(withoutAlt);
    expect(listing).toMatchObject({ name: 'Toyota Corolla', year: 2006, mileage: 198000, transmission: 'AT' });
  });

  it('не считает одну карточку дважды и не падает на обрезанной странице', () => {
    const listings = parseAvitoHtml(`${cerato}${cerato}<div data-marker="item" data-item-id="1"><span class="broken`);
    expect(listings).toHaveLength(1);
  });
});
