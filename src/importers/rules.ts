import type { AppConfig, BodyRisk, FactUrgency, ModelProfile } from '../types';
import type { ListingCar, ListingFact, ListingState } from './listings';
import type { ParsedListing } from './avito';

/**
 * Поколение задаётся годами выпуска: в выдаче Kia Cerato 2011 года — это уже TD,
 * другая машина с другой сметой. Без такой проверки объявление молча попало бы
 * в осмотр Cerato LD и испортило бы сравнение.
 */
export const GENERATIONS: Record<string, { years: [number, number]; label: string; confirm?: string }> = {
  'corolla-e120': { years: [2000, 2008], label: 'E120/E121' },
  'cerato-ld': { years: [2003, 2009], label: 'LD' },
  'lacetti-hatch': { years: [2003, 2013], label: 'J200', confirm: 'В заголовке выдачи нет типа кузова: убедиться, что это хэтчбек, а не седан или универсал.' },
};

export interface TextRule {
  id: string;
  /** Ищется по описанию объявления целиком, в нижнем регистре и без «ё». */
  when: RegExp;
  unless?: RegExp;
  elements: string[];
  state: ListingState;
  details?: string;
  urgency?: FactUrgency;
  bodyRisks?: BodyRisk[];
  /** Элементы перечислены как левый и правый: сторону берём из текста, а обе — только если она не названа. */
  sided?: boolean;
  /** Что уточнить у продавца. Дописывается к цитате из объявления. */
  ask: string;
}

/**
 * Работа (WORK) заводится только там, где дефект назван в объявлении прямым текстом.
 * Всё остальное — «под вопросом»: объявление не осмотр, и приложение не должно
 * считать смету по догадкам. В комментарий всегда попадает цитата-источник.
 */
export const TEXT_RULES: TextRule[] = [
  { id: 'not-running', when: /не на ходу|не заводится|под восстановление|на запчасти/, elements: ['Холодный запуск'], state: 'WORK', details: 'машина не на ходу', urgency: 'NOW', ask: 'Выяснить, что именно не работает и почему машина не на ходу.' },
  { id: 'oil-leak', when: /(течет|течёт|течь|потеет|подтекает)[^.]{0,30}масл|масл[^.]{0,20}(течет|течёт|течь)/, elements: ['Течи масла'], state: 'WORK', details: 'устранить течь масла', urgency: 'SOON', ask: 'Уточнить, откуда течёт и делали ли ремонт.' },
  { id: 'oil-burn', when: /(жрет|жрёт|ест|расход)[^.]{0,15}масл|масложор/, elements: ['Компрессия'], state: 'WORK', details: 'диагностика расхода масла', urgency: 'NOW', ask: 'Спросить литры на 1000 км и делали ли замер компрессии.' },
  { id: 'engine-noise', when: /(стук|шум|троит|детонац)[^.]{0,25}(двигател|мотор)|(двигател|мотор)[^.]{0,25}(стучит|шумит|троит)/, elements: ['Посторонние звуки'], state: 'WORK', details: 'диагностика шума двигателя', urgency: 'NOW', ask: 'Уточнить характер звука и на каких оборотах.' },
  { id: 'engine-overhaul', when: /капремонт|капиталк|капиталь[^.]{0,15}ремонт|перебран[^.]{0,15}(двигател|мотор)/, elements: ['Компрессия'], state: 'QUESTION', ask: 'Спросить, кто делал капремонт, когда, есть ли чеки и какой пробег после.' },
  { id: 'smoke', when: /дым(ит|ов)?[^.]{0,20}(выхлоп|трубы)?|сизый дым|белый дым/, elements: ['Дым из выхлопа'], state: 'QUESTION', ask: 'Уточнить цвет дыма и когда он появляется.' },
  { id: 'overheat', when: /перегрев|кипел|закипал/, elements: ['Радиатор'], state: 'QUESTION', ask: 'Спросить причину перегрева и что меняли после.' },
  { id: 'transmission-fault', when: /(акпп|коробк|автомат)[^.]{0,40}(пинает|пинки|дергает|дёргает|буксует|толчк|удар|не включает|ремонт|перебир)/, elements: ['Переключения'], state: 'WORK', details: 'диагностика и ремонт АКПП', urgency: 'NOW', ask: 'Выяснить, что делает коробка и на каких передачах.' },
  { id: 'transmission-fluid', when: /масло[^.]{0,15}(акпп|коробк)|atf|замена масла в акпп/, elements: ['Масло АКПП'], state: 'QUESTION', ask: 'Уточнить дату и пробег последней замены масла АКПП, полная или частичная.' },
  { id: 'timing', when: /грм|ремень грм|цепь грм|ролик/, elements: ['ГРМ: уточнить тип и состояние'], state: 'QUESTION', ask: 'Уточнить дату, пробег и состав замены комплекта ГРМ, попросить чек.' },
  { id: 'sills', when: /порог[^.]{0,40}(гнил|ржав|коррози|вар|подвар|замен|дыр)|(гнил|ржав|коррози|вар|подвар)[^.]{0,25}порог/, elements: ['Левый порог', 'Правый порог'], sided: true, state: 'WORK', details: 'ремонт порога', urgency: 'SOON', bodyRisks: ['weak_sills'], ask: 'Уточнить объём: локальная заплатка или замена порога целиком.' },
  { id: 'corrosion', when: /коррози|ржавчин|ржавые|гнил|жучк|сквозн/, elements: ['Днище'], state: 'QUESTION', ask: 'Уточнить, где именно коррозия и есть ли сквозные места. Смотреть на подъёмнике.' },
  { id: 'painted', when: /(крашен|перекрас|окрас|подкрас|покрас)/, unless: /не крашен|некрашен|не бита не крашена/, elements: ['Прочие замечания'], state: 'QUESTION', ask: 'Уточнить, какие элементы красили и по какой причине. Проверить толщиномером.' },
  { id: 'accident', when: /дтп|битый|битая|аварийн|восстановлен(а|ный)?[^.]{0,15}(после|дтп)?/, elements: ['Геометрия кузова'], state: 'QUESTION', ask: 'Пробить Автотеку, уточнить характер удара и что менялось.' },
  { id: 'no-accident', when: /не бита[, ]*не крашена|без дтп|не участвовал[а]? в дтп|родной окрас/, elements: ['Геометрия кузова'], state: 'QUESTION', ask: 'Заявление продавца не проверено: пройтись толщиномером и сверить с Автотекой.' },
  { id: 'suspension', when: /(подвеск|ходов)[^.]{0,40}(стук|ремонт|перебран|менял|требует)|(стук|стучит)[^.]{0,25}подвеск/, elements: ['Передняя подвеска'], state: 'QUESTION', ask: 'Уточнить, что именно меняли или что стучит.' },
  { id: 'cv-joint', when: /шрус|гранат|пыльник/, elements: ['Прочие замечания'], state: 'WORK', details: 'замена ШРУСа или пыльника привода', urgency: 'SOON', ask: 'Уточнить, какая сторона и куплена ли запчасть.' },
  { id: 'ac', when: /(кондиционер|кондей|климат)[^.]{0,30}(не рабо|не холод|нужн|заправ|неисправ)|нет кондиционера/, elements: ['Кондиционер'], state: 'WORK', details: 'диагностика и ремонт кондиционера', urgency: 'PLANNED', ask: 'Уточнить, дует ли холодом и что уже делали.' },
  { id: 'electrics', when: /(электрик|проводк|генератор|стартер)[^.]{0,30}(проблем|не рабо|глюч|менял|требует)|горит (чек|ошибка|check)/, elements: ['Ошибки на панели'], state: 'QUESTION', ask: 'Уточнить, какие ошибки горят и считывали ли сканером.' },
  { id: 'legal', when: /залог|кредит|арест|ограничени|не растаможен|проблем[^.]{0,15}(с )?документ/, elements: ['Прочие замечания'], state: 'QUESTION', ask: 'Проверить машину на залоги и ограничения до осмотра.' },
  { id: 'reseller', when: /перекуп|автосалон|комисси|выкуп|автоподбор|в наличии авто/, elements: ['История обслуживания'], state: 'QUESTION', ask: 'Продавец, похоже, не собственник: спросить, кто в ПТС и сколько машина у него.' },
  { id: 'winter-tires', when: /(два комплекта|комплект)[^.]{0,15}(резин|колес)|зимн[^.]{0,15}резин|в подарок[^.]{0,15}резин/, elements: ['Зимняя резина'], state: 'QUESTION', ask: 'Уточнить остаток протектора и год выпуска шин.' },
];

export interface WearRule { id: string; minMileage?: number; minAgeYears?: number; elements: string[]; ask: (listing: ParsedListing, age: number) => string }

/**
 * Вопросы, которые задаёт не текст объявления, а сами цифры пробега и возраста.
 * Все они «под вопросом» и с указанием, откуда взялись: это список для звонка,
 * а не утверждение о состоянии машины.
 */
export const WEAR_RULES: WearRule[] = [
  { id: 'service-history', elements: ['История обслуживания'], ask: () => 'Спросить историю обслуживания и чеки: что делалось за последние 2 года.' },
  { id: 'timing-by-mileage', minMileage: 120000, elements: ['ГРМ: уточнить тип и состояние'], ask: (listing) => `Пробег ${km(listing.mileage)}: уточнить дату и пробег последней замены комплекта ГРМ.` },
  { id: 'atf-by-mileage', minMileage: 100000, elements: ['Масло АКПП'], ask: (listing) => `Пробег ${km(listing.mileage)}: уточнить, когда меняли масло в АКПП и меняли ли вообще.` },
  { id: 'compression-by-mileage', minMileage: 250000, elements: ['Компрессия'], ask: (listing) => `Пробег ${km(listing.mileage)}: просить замер компрессии до сделки.` },
  { id: 'underbody-by-age', minAgeYears: 15, elements: ['Днище'], ask: (_listing, age) => `Возраст ${age} лет: смотреть днище и пороги на подъёмнике.` },
];

const normalize = (value: string): string => value.toLowerCase().replace(/ё/g, 'е');

/** Неразрывный пробел из toLocaleString ломает поиск по комментарию, поэтому пишем обычный. */
const km = (value: number | null): string => `${(value ?? 0).toLocaleString('ru-RU')} км`.replace(/\u00A0/g, ' ');

/** В комментарий факта идёт то предложение объявления, из-за которого факт появился. */
function quote(description: string, rule: TextRule): string {
  const sentence = description.split(/(?<=[.!?])\s+|\n+/).map((part) => part.trim()).find((part) => rule.when.test(normalize(part)));
  return sentence ? `Из объявления: «${sentence}». ${rule.ask}` : `Из объявления. ${rule.ask}`;
}

/** «Порог левый подваривали» — это один порог, а не два: вторая сторона осматривается, а не чинится. */
function sides(description: string, elements: string[]): string[] {
  const left = /лев\w*\s+порог|порог\w*\s+лев/.test(description);
  const right = /прав\w*\s+порог|порог\w*\s+прав/.test(description);
  if (left === right) return elements;
  return elements.filter((element) => /лев/i.test(element) === left);
}

export function factsFromListing(listing: ParsedListing, options: { wear?: boolean; modelId?: string } = {}): ListingFact[] {
  const description = normalize(listing.description);
  const facts: ListingFact[] = [];
  const taken = new Map<string, ListingFact>();
  // На один элемент осмотра может сработать несколько правил. Первое задаёт состояние
  // и работу, остальные дописывают свой вопрос в комментарий: иначе часть найденного
  // в объявлении просто пропала бы.
  const add = (element: string, fact: Omit<ListingFact, 'element'>) => {
    const existing = taken.get(element);
    if (existing) {
      if (fact.comment && !existing.comment?.includes(fact.comment)) existing.comment = [existing.comment, fact.comment].filter(Boolean).join(' ');
      return;
    }
    const created: ListingFact = { element, ...fact };
    taken.set(element, created);
    facts.push(created);
  };

  for (const rule of TEXT_RULES) {
    if (!rule.when.test(description) || (rule.unless && rule.unless.test(description))) continue;
    const elements = rule.sided ? sides(description, rule.elements) : rule.elements;
    for (const element of elements) add(element, { state: rule.state, details: rule.details, urgency: rule.urgency, comment: quote(listing.description, rule), bodyRisks: rule.bodyRisks });
  }

  if (options.wear !== false) {
    const age = listing.year ? new Date().getFullYear() - listing.year : 0;
    for (const rule of WEAR_RULES) {
      if (rule.minMileage !== undefined && (listing.mileage ?? 0) < rule.minMileage) continue;
      if (rule.minAgeYears !== undefined && age < rule.minAgeYears) continue;
      for (const element of rule.elements) add(element, { state: 'QUESTION', comment: rule.ask(listing, age) });
    }
  }

  const confirm = options.modelId ? GENERATIONS[options.modelId]?.confirm : undefined;
  if (confirm) add('Прочие замечания', { state: 'QUESTION', comment: confirm });
  return facts;
}

export interface ModelMatch { model: ModelProfile; variantId: string }

/**
 * Сопоставляет объявление с моделью из конфигурации. Возвращает причину отказа,
 * а не «ближайшую» модель: подстановка чужого поколения тише и вреднее пропуска.
 */
export function matchModel(config: AppConfig, listing: ParsedListing): ModelMatch | { reason: string } {
  const name = normalize(listing.name);
  const candidates = config.models.filter((model) => {
    const make = normalize(model.make);
    const word = normalize(model.model.split(' ')[0] ?? '');
    return make.length > 0 && word.length > 0 && name.includes(make) && name.includes(word);
  });
  if (candidates.length === 0) return { reason: 'нет такой модели в конфигурации' };
  const model = candidates[0];

  const generation = GENERATIONS[model.id];
  if (generation && listing.year && (listing.year < generation.years[0] || listing.year > generation.years[1])) {
    return { reason: `${listing.year} год вне поколения ${generation.label} (${generation.years[0]}–${generation.years[1]})` };
  }
  const wantedVolume = Number(model.engine);
  if (Number.isFinite(wantedVolume) && listing.engineVolume && Math.abs(listing.engineVolume - wantedVolume) > 0.05) {
    return { reason: `двигатель ${listing.engineVolume} вместо ${model.engine}` };
  }
  if (listing.transmission && normalize(model.transmission) !== normalize(listing.transmission)) {
    return { reason: `коробка ${listing.transmission} вместо ${model.transmission}` };
  }
  // Вариант двигателя по объявлению не определить: код читается по VIN и маркировке на блоке.
  const variant = model.engineVariants.find((item) => item.id === 'unknown') ?? model.engineVariants[0];
  return { model, variantId: variant.id };
}


/**
 * Поля автомобиля, которые видно прямо в тексте объявления. Они влияют на компонент
 * рейтинга «История и комплектность», поэтому важно не приукрасить: «не бита не крашена»
 * оставляет статус ДТП неизвестным, потому что это слова продавца, а не отчёт.
 */
export function vehicleFromListing(listing: ParsedListing): Pick<ListingCar, 'documentsStatus' | 'keyCount' | 'accidentStatus' | 'accidentComment'> {
  const description = normalize(listing.description);
  const keys = description.match(/(\d+|один|два|одним|двумя)\s*ключ/);
  const keyWords: Record<string, number> = { 'один': 1, 'одним': 1, 'два': 2, 'двумя': 2 };
  return {
    documentsStatus: /дубликат[^.]{0,15}птс|птс[^.]{0,15}дубликат/.test(description)
      ? 'DUPLICATE_WITHOUT_ORIGINAL'
      : /оригинал[^.]{0,15}птс|птс[^.]{0,15}оригинал/.test(description) ? 'ORIGINAL' : 'UNKNOWN',
    keyCount: keys ? (keyWords[keys[1]] ?? Number(keys[1])) || undefined : undefined,
    accidentStatus: /дтп|битый|битая|аварийн|восстановлен/.test(description) && !/не бит|без дтп|не участвовал/.test(description) ? 'YES' : 'UNKNOWN',
    accidentComment: /дтп|битый|битая|аварийн|восстановлен/.test(description) ? `Из объявления: «${listing.description}»`.slice(0, 500) : '',
  };
}
