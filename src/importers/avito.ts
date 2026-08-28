/**
 * Разбор сохранённой страницы выдачи Avito без внешних зависимостей.
 * Разметка Avito состоит из хешированных классов, которые меняются между релизами,
 * поэтому опорой служат только устойчивые атрибуты: data-marker, data-item-id,
 * itemprop и alt карточки — они переживают смену вёрстки.
 */

export type Transmission = 'AT' | 'MT' | 'CVT' | 'AMT';

export interface ParsedListing {
  itemId: string;
  url: string;
  /** Строка вида «Kia Cerato 1.6 AT, 2008, 421 600 км» — как её показывает выдача. */
  title: string;
  /** Марка и модель без объёма и коробки: «Kia Cerato». */
  name: string;
  engineVolume: number | null;
  transmission: Transmission | null;
  year: number | null;
  mileage: number | null;
  price: number | null;
  city: string;
  description: string;
}

const ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>',
  laquo: '«', raquo: '»', mdash: '—', ndash: '–', hellip: '…', rsquo: '’',
};

export function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match)
    .replace(/ /g, ' ');
}

const text = (value: string): string => decodeEntities(value).replace(/\s+/g, ' ').trim();

const digits = (value: string | undefined): number | null => {
  if (!value) return null;
  const parsed = Number(decodeEntities(value).replace(/[^\d]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

function first(chunk: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = chunk.match(pattern);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

/** Карточки идут подряд, вложенных карточек не бывает — границей служит сам маркер. */
function splitItems(html: string): string[] {
  const bounds: number[] = [];
  const marker = /data-marker="item"/g;
  let found = marker.exec(html);
  while (found) {
    bounds.push(found.index);
    found = marker.exec(html);
  }
  return bounds.map((start, index) => html.slice(start, bounds[index + 1] ?? html.length));
}

/** Заголовок выдачи: «Kia Cerato 1.6 AT, 2008, 421 600 км, с пробегом, цена 170 000 руб., Видное». */
function parseTitle(raw: string): Pick<ParsedListing, 'name' | 'engineVolume' | 'transmission' | 'year' | 'mileage' | 'price' | 'city'> {
  const parts = text(raw).split(',').map((part) => part.trim()).filter(Boolean);
  const head = parts[0] ?? '';
  const engine = head.match(/(\d[.,]\d)\s*(AT|MT|CVT|AMT)?\s*$/i);
  const tail = parts.slice(1);
  const cityPart = tail.find((part) => !/\d/.test(part) && !/пробег|цена|руб/i.test(part));
  return {
    name: head.replace(/\s*(\d[.,]\d).*$/, '').trim(),
    engineVolume: engine ? Number(engine[1].replace(',', '.')) : null,
    transmission: (engine?.[2]?.toUpperCase() as Transmission | undefined) ?? null,
    year: Number(tail.find((part) => /^(19|20)\d{2}$/.test(part)) ?? NaN) || null,
    mileage: digits(tail.find((part) => /км$/i.test(part))),
    price: digits(tail.find((part) => /цена/i.test(part))),
    city: cityPart ?? '',
  };
}

/** Слаг ссылки — запасной источник, когда alt карточки не сохранился: kia_cerato_1.6_at_2008_421_600_km_842. */
function parseSlug(url: string): Partial<ParsedListing> {
  const slug = url.split('/').pop()?.split('?')[0] ?? '';
  const match = slug.match(/^(.+?)_(\d[.,]\d)_(at|mt|cvt|amt)_((?:19|20)\d{2})_([\d_]+)_km_(\d+)$/i);
  if (!match) return {};
  return {
    name: match[1].split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
    engineVolume: Number(match[2].replace(',', '.')),
    transmission: match[3].toUpperCase() as Transmission,
    year: Number(match[4]),
    mileage: Number(match[5].replace(/_/g, '')),
  };
}

export function parseAvitoHtml(html: string, origin = 'https://www.avito.ru'): ParsedListing[] {
  const listings: ParsedListing[] = [];
  const seen = new Set<string>();
  for (const chunk of splitItems(html)) {
    const itemId = first(chunk, [/data-item-id="(\d+)"/, /\bid="i(\d+)"/]);
    if (!itemId || seen.has(itemId)) continue;
    const hrefs = [...chunk.matchAll(/href="(\/[^"]+)"/g)].map((match) => decodeEntities(match[1]));
    const href = hrefs.find((item) => item.includes(`_${itemId}`)) ?? hrefs.find((item) => item.includes('/avtomobili/'));
    if (!href) continue;
    seen.add(itemId);

    const path = href.split('?')[0];
    const rawTitle = first(chunk, [/<img[^>]+alt="([^"]+)"/, /data-marker="item-title"[^>]*>(?:<[^>]*>)*([^<]+)/]) ?? '';
    const fromTitle = parseTitle(rawTitle);
    const fromSlug = parseSlug(path);
    const metaPrice = digits(first(chunk, [/itemprop="price"[^>]*content="(\d+)"/, /data-marker="item-price"[^>]*>(?:<[^>]*>)*([\d\s ]+)/]));

    listings.push({
      itemId,
      url: `${origin}${path}`,
      title: text(rawTitle).split(', с пробегом')[0],
      name: fromTitle.name || fromSlug.name || '',
      engineVolume: fromTitle.engineVolume ?? fromSlug.engineVolume ?? null,
      transmission: fromTitle.transmission ?? fromSlug.transmission ?? null,
      year: fromTitle.year ?? fromSlug.year ?? null,
      mileage: fromTitle.mileage ?? fromSlug.mileage ?? null,
      price: metaPrice ?? fromTitle.price ?? null,
      city: fromTitle.city,
      description: text(first(chunk, [/itemprop="description"[^>]*content="([^"]*)"/]) ?? ''),
    });
  }
  return listings;
}
