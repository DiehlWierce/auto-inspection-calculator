import type { CategoryId, CostSpread, PriceRangeRule } from '../types';

/**
 * Ставка нормо-часа независимого сервиса, ₽/ч.
 * min — гаражный сервис, typical — сетевой универсал, max — специализированный сервис.
 */
export const LABOR_RATE: CostSpread = { min: 1200, typical: 1600, max: 2200 };

/**
 * Справочник построен как «запчасти + нормо-часы × ставка», а не как готовая сумма.
 * parts — цена комплектующих и материалов на объём работы, описанный в scope.
 * hours — нормо-часы. Итоговые min/typical/max выводятся из них функцией buildPriceBook.
 * Ориентир по запчастям — аналоги среднего сегмента на B/C-класс 2004–2012 годов.
 */
interface JobSpec {
  id: string;
  category: CategoryId;
  label: string;
  scope: string;
  parts: [number, number, number];
  hours: [number, number, number];
  match?: string[];
  fallback?: boolean;
}

const JOBS: JobSpec[] = [
  // ТО и регламент
  { id: 'maintenance', category: 'maintenance', label: 'ТО — общий регламент', scope: 'Масло, фильтры, свечи и жидкости за один заезд', parts: [7000, 12000, 22000], hours: [2, 3, 5.5], fallback: true, match: ['регламент', 'обслуживани', 'история обслуживани'] },
  { id: 'maintenance-oil', category: 'maintenance', label: 'Замена масла и масляного фильтра', scope: '4–4,5 л масла и фильтр', parts: [2500, 4200, 7500], hours: [0.4, 0.6, 1], match: ['масло двигател', 'моторное масло', 'замена масла'] },
  { id: 'maintenance-filters', category: 'maintenance', label: 'Фильтры комплектом', scope: 'Воздушный, салонный и топливный за один заезд', parts: [1400, 2800, 5500], hours: [0.4, 0.8, 1.6], match: ['фильтр'] },
  { id: 'maintenance-air-filter', category: 'maintenance', label: 'Воздушный фильтр', scope: 'Фильтр и его установка', parts: [400, 900, 2000], hours: [0.2, 0.3, 0.6], match: ['воздушный фильтр', 'воздушн'] },
  { id: 'maintenance-cabin-filter', category: 'maintenance', label: 'Салонный фильтр', scope: 'Фильтр, при необходимости с чисткой короба', parts: [400, 900, 2200], hours: [0.2, 0.4, 0.8], match: ['салонный фильтр', 'салонный'] },
  { id: 'maintenance-fuel-filter', category: 'maintenance', label: 'Топливный фильтр', scope: 'Фильтр в магистрали или в баке', parts: [600, 1800, 5000], hours: [0.4, 0.8, 2], match: ['топливный фильтр', 'топливн'] },
  { id: 'maintenance-ps-fluid', category: 'maintenance', label: 'Жидкость ГУР', scope: 'Замена с прокачкой системы', parts: [600, 1300, 2800], hours: [0.3, 0.6, 1.2], match: ['жидкость гур', 'гур'] },
  { id: 'maintenance-spark-plugs', category: 'maintenance', label: 'Свечи зажигания', scope: 'Комплект 4 шт., без катушек', parts: [1200, 2600, 5500], hours: [0.4, 0.6, 1.2], match: ['свеч'] },
  { id: 'maintenance-coolant', category: 'maintenance', label: 'Замена антифриза', scope: 'Промывка и 5–7 л жидкости', parts: [1400, 2400, 4500], hours: [0.6, 1, 1.6], match: ['антифриз', 'охлаждающая жидкост', 'тосол'] },
  { id: 'maintenance-brake-fluid', category: 'maintenance', label: 'Замена тормозной жидкости', scope: 'Прокачка контура, 1 л жидкости', parts: [500, 900, 1800], hours: [0.6, 0.9, 1.4], match: ['тормозная жидкост'] },
  { id: 'maintenance-atf', category: 'maintenance', label: 'Замена масла АКПП', scope: 'От частичной замены до полной с фильтром и прокладкой', parts: [3500, 7500, 15000], hours: [0.8, 1.5, 3], match: ['масло акпп', 'масло коробк', 'atf'] },
  { id: 'maintenance-timing-belt', category: 'maintenance', label: 'Ремень ГРМ с роликами и помпой', scope: 'Комплект ГРМ, помпа, антифриз', parts: [4500, 9000, 17000], hours: [2.5, 4, 6.5], match: ['ремень грм', 'грм и ролик', 'ролик'] },
  { id: 'maintenance-timing-chain', category: 'maintenance', label: 'Цепь ГРМ с натяжителем и башмаками', scope: 'Цепь, натяжитель, успокоители, прокладки, масло', parts: [8000, 15000, 28000], hours: [4, 6, 10], match: ['цепь грм', 'цепь', 'натяжител'] },
  { id: 'maintenance-timing-unknown', category: 'maintenance', label: 'ГРМ — тип не установлен', scope: 'От комплекта ремня до цепи с натяжителем: считаем по худшему', parts: [4500, 12000, 28000], hours: [2.5, 5, 10], match: ['грм: уточнить', 'грм'] },
  { id: 'maintenance-aux-belt', category: 'maintenance', label: 'Ремень навесного оборудования с роликами', scope: 'Приводной ремень и натяжной ролик', parts: [1500, 3500, 7000], hours: [0.5, 1, 2], match: ['навесн', 'приводной ремень', 'ремень генератор'] },

  // Двигатель
  { id: 'engine-diagnostic', category: 'engine', label: 'Двигатель — диагностика', scope: 'Сканер, замер компрессии, осмотр эндоскопом', parts: [0, 0, 1000], hours: [0.8, 1.5, 3], match: ['диагностик', 'холодный запуск', 'холостой ход', 'разгон', 'посторонние звук', 'компресси', 'дым', 'ошибк'] },
  { id: 'engine-minor', category: 'engine', label: 'Двигатель — мелкий ремонт', scope: 'Навесное, датчики, прокладки без снятия ГБЦ', parts: [2000, 6000, 14000], hours: [1.5, 3, 6], fallback: true, match: ['мелкий ремонт'] },
  { id: 'engine-oil-leak', category: 'engine', label: 'Устранение течи масла', scope: 'Прокладка клапанной крышки или поддона, сальники', parts: [800, 2800, 7000], hours: [1, 2.5, 6], match: ['течи масл', 'течь масл', 'потеет', 'запотевани', 'сальник'] },
  { id: 'engine-valve-seals', category: 'engine', label: 'Маслосъёмные колпачки', scope: 'Замена без снятия ГБЦ, расходники', parts: [1500, 3500, 7000], hours: [4, 6, 10], match: ['колпачк', 'маслосъём', 'масложор', 'расход масла'] },
  { id: 'engine-head-gasket', category: 'engine', label: 'Прокладка ГБЦ со шлифовкой', scope: 'Комплект прокладок, шлифовка плоскости, жидкости', parts: [4000, 9000, 18000], hours: [6, 9, 14], match: ['прокладка гбц', 'гбц', 'головк'] },
  { id: 'engine-injectors', category: 'engine', label: 'Форсунки: чистка или замена', scope: 'Ультразвук либо комплект форсунок', parts: [1000, 6000, 20000], hours: [1.5, 3, 5], match: ['форсунк', 'инжектор', 'топливн'] },
  { id: 'engine-mounts', category: 'engine', label: 'Опоры двигателя', scope: 'Одна–три подушки', parts: [2500, 6000, 13000], hours: [1, 2, 4], match: ['опор', 'подушк', 'вибраци'] },
  { id: 'engine-timing-belt', category: 'engine', label: 'Ремень ГРМ с роликами и помпой', scope: 'Комплект ГРМ, помпа, антифриз', parts: [4500, 9000, 17000], hours: [2.5, 4, 6.5], match: ['ремень грм', 'грм и ролик', 'ремень и ролик'] },
  { id: 'engine-timing-chain', category: 'engine', label: 'Цепь ГРМ с натяжителем и башмаками', scope: 'Цепь, натяжитель, успокоители, прокладки, масло', parts: [8000, 15000, 28000], hours: [4, 6, 10], match: ['цепь грм', 'цепь и натяжител', 'цепь', 'натяжител'] },
  { id: 'engine-timing-unknown', category: 'engine', label: 'ГРМ — тип не установлен', scope: 'От комплекта ремня до цепи с натяжителем: считаем по худшему', parts: [4500, 12000, 28000], hours: [2.5, 5, 10], match: ['грм: уточнить', 'грм'] },
  { id: 'engine-ignition', category: 'engine', label: 'Свечи и катушки зажигания', scope: 'Комплект свечей, при необходимости катушки и провода', parts: [1200, 4500, 13000], hours: [0.4, 1, 2], match: ['свеч', 'катушк', 'зажигани', 'троит', 'пропуск'] },
  { id: 'engine-aux', category: 'engine', label: 'Навесное оборудование', scope: 'Приводной ремень, ролики, шкивы, кронштейны', parts: [1500, 5000, 14000], hours: [0.8, 2, 4], match: ['навесн', 'приводной ремень', 'шкив', 'свист'] },
  { id: 'engine-medium', category: 'engine', label: 'Двигатель — средний ремонт', scope: 'Ремонт ГБЦ или частичная переборка низа', parts: [15000, 35000, 70000], hours: [12, 20, 32], match: ['средний ремонт', 'ремонт гбц'] },
  { id: 'engine-major', category: 'engine', label: 'Двигатель — капремонт или замена', scope: 'Капремонт либо контрактный мотор со свапом и расходниками', parts: [40000, 70000, 120000], hours: [18, 28, 45], match: ['капит', 'крупный ремонт', 'замена двигател', 'контрактн'] },

  // АКПП
  { id: 'transmission-diagnostic', category: 'transmission', label: 'АКПП — диагностика', scope: 'Сканер, тест-драйв, оценка состояния масла', parts: [0, 0, 1000], hours: [1, 1.5, 3], match: ['диагностик', 'включение d', 'переключен', 'кикдаун', 'удары', 'задержк', 'пробуксовк'] },
  { id: 'transmission-service', category: 'transmission', label: 'АКПП — обслуживание', scope: 'Масло, фильтр, прокладка поддона, промывка', parts: [4500, 8500, 16000], hours: [1.5, 2.5, 4], fallback: true, match: ['обслуживани', 'замена масла', 'фильтр'] },
  { id: 'transmission-seals', category: 'transmission', label: 'АКПП — устранение течи', scope: 'Сальники полуосей, прокладка поддона', parts: [800, 2800, 7000], hours: [2, 4, 8], match: ['течи', 'течь', 'сальник', 'подтёк'] },
  { id: 'transmission-solenoids', category: 'transmission', label: 'АКПП — гидроблок и соленоиды', scope: 'Ремонт или замена гидроблока с расходниками', parts: [8000, 20000, 45000], hours: [3, 5, 9], match: ['гидроблок', 'соленоид', 'клапан'] },
  { id: 'transmission-repair', category: 'transmission', label: 'АКПП — переборка', scope: 'Снятие, дефектовка, фрикционы, ремкомплект, масло', parts: [25000, 50000, 95000], hours: [10, 16, 26], match: ['перебор', 'капит', 'фрикцион', 'ремонт акпп', 'ремонт коробк'] },
  { id: 'transmission-replace', category: 'transmission', label: 'АКПП — замена агрегата', scope: 'Контрактная коробка с установкой и маслом', parts: [35000, 60000, 110000], hours: [6, 9, 14], match: ['замена акпп', 'замена коробк', 'контрактн'] },

  // Подвеска
  { id: 'suspension', category: 'suspension', label: 'Подвеска — комплексный ремонт', scope: 'Перед и зад по кругу с расходниками', parts: [10000, 24000, 48000], hours: [4, 8, 14], fallback: true, match: ['подвеск', 'по кругу'] },
  { id: 'suspension-front-axle', category: 'suspension', label: 'Передняя подвеска — ось в сборе', scope: 'Рычаги, шаровые, сайлентблоки и стойки стабилизатора спереди', parts: [5000, 12000, 26000], hours: [2.5, 5, 9], match: ['передняя подвеск', 'перед в сбор'] },
  { id: 'suspension-rear-axle', category: 'suspension', label: 'Задняя подвеска — ось в сборе', scope: 'Рычаги, сайлентблоки и втулки сзади', parts: [3500, 9000, 20000], hours: [2, 4, 7], match: ['задняя подвеск', 'зад в сбор'] },
  { id: 'suspension-front-struts', category: 'suspension', label: 'Стойки амортизаторов перед', scope: 'Пара стоек с опорами, отбойниками и пыльниками', parts: [6000, 12000, 24000], hours: [2, 3, 5], match: ['амортизатор', 'стойк', 'передние стойк'] },
  { id: 'suspension-rear-shocks', category: 'suspension', label: 'Амортизаторы зад', scope: 'Пара амортизаторов с отбойниками', parts: [4000, 8000, 16000], hours: [1.5, 2.5, 4], match: ['задние амортизатор', 'задние стойк'] },
  { id: 'suspension-springs', category: 'suspension', label: 'Пружины', scope: 'Пара пружин одной оси', parts: [3500, 7000, 14000], hours: [1.5, 2.5, 4.5], match: ['пружин', 'просел'] },
  { id: 'suspension-arms', category: 'suspension', label: 'Рычаги и шаровые опоры', scope: 'Пара рычагов или шаровых с развал-схождением', parts: [3000, 8000, 18000], hours: [1.5, 3, 5], match: ['рычаг', 'шаров'] },
  { id: 'suspension-bushings', category: 'suspension', label: 'Сайлентблоки и втулки стабилизатора', scope: 'Комплект резинок одной оси', parts: [1500, 4500, 11000], hours: [1.5, 3.5, 7], match: ['сайлентблок', 'втулк', 'стабилизатор', 'резинк'] },
  { id: 'suspension-links', category: 'suspension', label: 'Стойки стабилизатора', scope: 'Пара линков', parts: [1000, 2400, 5000], hours: [0.6, 1, 2], match: ['стойки стабилизатор', 'линк'] },
  { id: 'suspension-wheel-bearing', category: 'suspension', label: 'Ступичный подшипник', scope: 'Одна сторона, подшипник или ступица в сборе', parts: [2000, 4500, 9000], hours: [1.5, 2.5, 4], match: ['ступич', 'ступиц', 'подшипник', 'гул колес'] },
  { id: 'suspension-alignment', category: 'suspension', label: 'Развал-схождение', scope: 'Регулировка на стенде', parts: [0, 0, 0], hours: [1, 1.5, 2.5], match: ['развал', 'схождени', 'увод'] },

  // Тормоза
  { id: 'brakes', category: 'brakes', label: 'Тормоза — комплексно по кругу', scope: 'Диски и колодки перед и зад, жидкость', parts: [7000, 15000, 30000], hours: [2, 3.5, 6], fallback: true, match: ['по кругу', 'весь тормозной'] },
  { id: 'brakes-front', category: 'brakes', label: 'Передние диски и колодки', scope: 'Пара дисков и комплект колодок', parts: [4000, 8000, 16000], hours: [1, 1.8, 3], match: ['передние диски', 'передние колодк', 'передн'] },
  { id: 'brakes-front-pads', category: 'brakes', label: 'Передние колодки', scope: 'Комплект колодок без дисков', parts: [1500, 3000, 6000], hours: [0.6, 1, 1.8], match: ['только колодк', 'колодк перед'] },
  { id: 'brakes-rear', category: 'brakes', label: 'Задние диски или барабаны с колодками', scope: 'Одна ось в сборе', parts: [3500, 7000, 14000], hours: [1, 2, 3.5], match: ['задние диски', 'задние колодк', 'барабан', 'задн'] },
  { id: 'brakes-caliper', category: 'brakes', label: 'Суппорт: ремонт или замена', scope: 'Одна сторона, ремкомплект либо суппорт целиком', parts: [1500, 6000, 15000], hours: [1, 2, 4], match: ['суппорт', 'клин', 'направляющ'] },
  { id: 'brakes-lines', category: 'brakes', label: 'Тормозные трубки и шланги', scope: 'Замена участков магистрали с прокачкой', parts: [1200, 3500, 9000], hours: [1.5, 3, 6], match: ['трубк', 'шланг', 'магистрал'] },
  { id: 'brakes-handbrake', category: 'brakes', label: 'Ручной тормоз', scope: 'Тросы, механизм, регулировка', parts: [800, 2500, 6000], hours: [0.8, 1.5, 3], match: ['ручник', 'ручной тормоз', 'стояноч'] },

  // Рулевое
  { id: 'steering', category: 'steering', label: 'Рулевое — общий ремонт', scope: 'Диагностика люфтов и замена изношенного узла', parts: [3000, 9000, 22000], hours: [2, 4, 8], fallback: true, match: ['люфт руля'] },
  { id: 'steering-rack-repair', category: 'steering', label: 'Рулевая рейка — ремонт', scope: 'Снятие, ремкомплект, регулировка, развал', parts: [3000, 9000, 20000], hours: [4, 6, 10], match: ['ремонт рейк', 'стук рейк', 'рейка'] },
  { id: 'steering-rack-replace', category: 'steering', label: 'Рулевая рейка — замена', scope: 'Рейка в сборе, жидкость, развал-схождение', parts: [12000, 25000, 50000], hours: [4, 6, 10], match: ['замена рейк', 'рейка в сбор'] },
  { id: 'steering-tie-rods', category: 'steering', label: 'Тяги и наконечники', scope: 'Пара с развал-схождением', parts: [2000, 5000, 11000], hours: [1.5, 2.5, 4.5], match: ['тяг', 'наконечник'] },
  { id: 'steering-pump', category: 'steering', label: 'ГУР: насос, шланги, жидкость', scope: 'Насос или магистраль с прокачкой системы', parts: [3000, 9000, 22000], hours: [1.5, 3, 6], match: ['гур', 'насос', 'усилител'] },

  // Охлаждение
  { id: 'cooling', category: 'cooling', label: 'Охлаждение — общий ремонт', scope: 'Поиск течи и замена изношенного узла', parts: [3000, 7500, 16000], hours: [1.5, 3, 5], fallback: true, match: ['охлажд', 'перегрев'] },
  { id: 'cooling-radiator', category: 'cooling', label: 'Радиатор охлаждения', scope: 'Радиатор, антифриз, промывка', parts: [4000, 8500, 16000], hours: [1.5, 2.5, 4], match: ['радиатор'] },
  { id: 'cooling-pump', category: 'cooling', label: 'Помпа', scope: 'Помпа с прокладкой и антифризом, снятие привода ГРМ', parts: [1800, 4000, 9000], hours: [2, 3.5, 6], match: ['помп', 'водян'] },
  { id: 'cooling-thermostat', category: 'cooling', label: 'Термостат', scope: 'Термостат с прокладкой и антифризом', parts: [800, 2000, 4500], hours: [0.8, 1.5, 3], match: ['термостат', 'не греется', 'не прогрев'] },
  { id: 'cooling-hoses', category: 'cooling', label: 'Патрубки и хомуты', scope: 'Комплект патрубков с антифризом', parts: [1200, 3000, 7000], hours: [0.8, 1.5, 3], match: ['патрубк', 'хомут', 'шланг'] },
  { id: 'cooling-fan', category: 'cooling', label: 'Вентилятор охлаждения', scope: 'Мотор вентилятора или вискомуфта с реле', parts: [3000, 7000, 16000], hours: [1, 2, 3.5], match: ['вентилятор', 'карлсон'] },

  // Кондиционер и климат
  { id: 'ac', category: 'ac', label: 'Кондиционер — общий ремонт', scope: 'Поиск утечки и восстановление контура', parts: [2000, 9000, 30000], hours: [1, 3, 6], fallback: true, match: ['кондиционер', 'климат', 'не холодит'] },
  { id: 'ac-service', category: 'ac', label: 'Диагностика и заправка кондиционера', scope: 'Опрессовка, вакуумирование, фреон и масло', parts: [1500, 2600, 4500], hours: [0.5, 1, 2], match: ['диагностик', 'заправк', 'фреон'] },
  { id: 'ac-compressor', category: 'ac', label: 'Компрессор кондиционера', scope: 'Компрессор, фильтр-осушитель, заправка', parts: [10000, 22000, 45000], hours: [2, 3.5, 6], match: ['компрессор', 'муфт'] },
  { id: 'ac-condenser', category: 'ac', label: 'Радиатор кондиционера и магистрали', scope: 'Конденсор или трубки, осушитель, заправка', parts: [4000, 9000, 20000], hours: [1.5, 3, 5], match: ['радиатор кондиц', 'конденсор', 'магистрал', 'трубк'] },
  { id: 'ac-heater', category: 'ac', label: 'Радиатор печки', scope: 'Замена с разбором панели и антифризом', parts: [2000, 5500, 12000], hours: [4, 7, 12], match: ['печк', 'отопител', 'не греет салон'] },
  { id: 'ac-blower', category: 'ac', label: 'Вентилятор салона и резистор', scope: 'Мотор отопителя или регулятор скоростей', parts: [1500, 4000, 10000], hours: [0.8, 2, 4], match: ['вентилятор', 'моторчик', 'обдув'] },
  { id: 'ac-heated-glass', category: 'ac', label: 'Обогревы стёкол и зеркал', scope: 'Восстановление нитей, реле, зеркальный элемент', parts: [1000, 3500, 9000], hours: [0.8, 2, 4], match: ['обогрев', 'зеркал'] },

  // Электрика
  { id: 'electrics', category: 'electrics', label: 'Электрика — общий ремонт', scope: 'Поиск неисправности и замена узла', parts: [1500, 6000, 18000], hours: [1, 2.5, 6], fallback: true, match: ['электрик'] },
  { id: 'electrics-diagnostic', category: 'electrics', label: 'Компьютерная диагностика', scope: 'Считывание ошибок и проверка цепей', parts: [0, 0, 500], hours: [0.7, 1.2, 2.5], match: ['диагностик', 'ошибк', 'панел', 'чек'] },
  { id: 'electrics-battery', category: 'electrics', label: 'Аккумулятор', scope: 'АКБ 55–65 А·ч с установкой и проверкой зарядки', parts: [5500, 8500, 15000], hours: [0.2, 0.4, 0.8], match: ['аккумулятор', 'акб', 'не заводит'] },
  { id: 'electrics-alternator', category: 'electrics', label: 'Генератор: ремонт или замена', scope: 'Ремкомплект либо генератор в сборе', parts: [3000, 10000, 25000], hours: [1.5, 2.5, 5], match: ['генератор', 'зарядк', 'не заряжа'] },
  { id: 'electrics-starter', category: 'electrics', label: 'Стартер: ремонт или замена', scope: 'Бендикс, втулки либо стартер в сборе', parts: [3000, 9000, 20000], hours: [1.5, 2.5, 5], match: ['стартер', 'не крутит'] },
  { id: 'electrics-wiring', category: 'electrics', label: 'Поиск и ремонт проводки', scope: 'Прозвонка, восстановление участков, разъёмы', parts: [500, 2500, 8000], hours: [2, 4, 10], match: ['проводк', 'коротит', 'окисл', 'масса'] },
  { id: 'electrics-lighting', category: 'electrics', label: 'Свет: фары, лампы, блоки', scope: 'Лампы, полировка или замена фары, блоки розжига', parts: [1000, 5000, 18000], hours: [0.5, 1.5, 4], match: ['освещени', 'фар', 'ламп', 'свет', 'габарит'] },
  { id: 'electrics-comfort', category: 'electrics', label: 'Комфорт: стеклоподъёмники, замки, приборка', scope: 'Моторедукторы, актуаторы, ремонт панели', parts: [1500, 5000, 14000], hours: [1, 2.5, 5], match: ['стеклоподъ', 'замок', 'центральный замок', 'приборн', 'сигнализац'] },

  // Кузов
  { id: 'body-local', category: 'body', label: 'Кузов — локальный ремонт элемента', scope: 'Один элемент: рихтовка, подготовка, окраска', parts: [1500, 3500, 7000], hours: [4, 7, 12], fallback: true, match: ['бампер', 'капот', 'крыл', 'двер', 'крыш', 'багажник', 'вмятин', 'скол', 'царапин', 'локальн'] },
  { id: 'body-paint-element', category: 'body', label: 'Кузов — окраска элемента без ремонта', scope: 'Один элемент: подготовка и окрас', parts: [1200, 2600, 5000], hours: [2.5, 4, 6.5], match: ['покрас', 'окрас элемент', 'подкрас'] },
  { id: 'body-multiple', category: 'body', label: 'Кузов — несколько элементов', scope: 'Три-четыре элемента с ремонтом и окраской', parts: [5000, 11000, 22000], hours: [12, 20, 34], match: ['несколько', 'сторона', 'бок'] },
  { id: 'body-paint', category: 'body', label: 'Кузов — полный окрас', scope: 'Весь кузов с разбором, подготовкой и материалами', parts: [25000, 45000, 90000], hours: [30, 45, 70], match: ['полный окрас', 'весь кузов', 'облив'] },
  { id: 'body-welding', category: 'body', label: 'Кузов — сварка', scope: 'Пороги, арки или локальные вставки с антикором', parts: [3000, 8000, 20000], hours: [8, 16, 32], match: ['свар', 'порог', 'арк', 'днищ', 'гнил', 'сквозн', 'лонжерон'] },
  { id: 'body-rust', category: 'body', label: 'Кузов — коррозия и антикор', scope: 'Зачистка очагов, обработка, антикор днища', parts: [2500, 6000, 14000], hours: [2, 5, 10], match: ['коррози', 'ржавчин', 'антикор', 'жучк'] },
  { id: 'body-geometry', category: 'body', label: 'Кузов — геометрия на стапеле', scope: 'Замеры, вытяжка, контрольная проверка', parts: [1000, 3000, 8000], hours: [8, 16, 30], match: ['геометр', 'стапел', 'стакан', 'крепления подвеск', 'перекос'] },
  { id: 'body-glass', category: 'body', label: 'Кузов — стёкла и уплотнители', scope: 'Стекло с установкой либо комплект уплотнителей', parts: [3000, 8000, 20000], hours: [1, 2, 4], match: ['стекл', 'уплотнител', 'лобов'] },

  // Колёса
  { id: 'tires', category: 'tires', label: 'Резина и колёса', scope: 'Комплект 4 шт. с шиномонтажом и балансировкой', parts: [12000, 22000, 38000], hours: [0.8, 1.2, 2], fallback: true, match: ['резин', 'шин', 'летн', 'зимн', 'запасн'] },
  { id: 'tires-wheels', category: 'tires', label: 'Диски', scope: 'Комплект 4 шт. или правка с покраской', parts: [8000, 16000, 34000], hours: [0.5, 1, 1.5], match: ['диск', 'литьё', 'штампов', 'восьмёрк'] },

  // Салон
  { id: 'interior', category: 'interior', label: 'Салон — общие работы', scope: 'Устранение локальных дефектов отделки', parts: [1000, 4000, 14000], hours: [1.5, 3.5, 8], fallback: true, match: ['салон'] },
  { id: 'interior-cleaning', category: 'interior', label: 'Химчистка салона', scope: 'Полная химчистка с сушкой', parts: [500, 1500, 3000], hours: [2.5, 4.5, 8], match: ['химчистк', 'запах', 'грязн', 'ковр', 'обивк пол'] },
  { id: 'interior-trim', category: 'interior', label: 'Отделка: обивка, пластик, карты', scope: 'Перетяжка или замена элементов отделки', parts: [1500, 6000, 18000], hours: [1.5, 4, 9], match: ['сиден', 'потолок', 'дверные карт', 'торпедо', 'пластик', 'обивк', 'багажник'] },
  { id: 'interior-electrics', category: 'interior', label: 'Электрика салона: стеклоподъёмники, замки, приборка', scope: 'Моторедукторы, актуаторы, ремонт приборной панели', parts: [1500, 5000, 14000], hours: [1, 2.5, 5], match: ['стеклоподъ', 'замок', 'центральный замок', 'приборн', 'подсветк'] },
  { id: 'interior-safety', category: 'interior', label: 'Ремни и подушки безопасности', scope: 'Ремень, пиропатрон или модуль SRS с прошивкой', parts: [3000, 12000, 35000], hours: [1, 3, 6], match: ['ремни безопасн', 'подушк', 'безопасн', 'srs', 'airbag'] },

  // Выхлоп
  { id: 'exhaust', category: 'exhaust', label: 'Выхлоп — общий ремонт', scope: 'Замена или сварка участка системы', parts: [2000, 6000, 16000], hours: [1, 2, 4], fallback: true, match: ['выхлоп', 'выпуск'] },
  { id: 'exhaust-muffler', category: 'exhaust', label: 'Глушитель или резонатор', scope: 'Банка с установкой и хомутами', parts: [2500, 6000, 14000], hours: [1, 2, 3.5], match: ['глушител', 'резонатор', 'банк'] },
  { id: 'exhaust-catalyst', category: 'exhaust', label: 'Катализатор: замена или пламегаситель', scope: 'Пламегаситель с обманкой либо катализатор', parts: [5000, 12000, 30000], hours: [1.5, 2.5, 4.5], match: ['катализатор', 'пламегасит', 'обманк', 'лямбд'] },
  { id: 'exhaust-mounts', category: 'exhaust', label: 'Крепления, гофра, прокладки', scope: 'Подвесы, гофра, прокладки фланцев', parts: [600, 1800, 4500], hours: [0.8, 1.5, 3], match: ['креплени', 'гофр', 'подвес', 'прокладк'] },

  // Прочее
  { id: 'other', category: 'other', label: 'Прочие работы', scope: 'Не классифицированные работы средней трудоёмкости', parts: [1000, 4000, 12000], hours: [1, 2.5, 6], fallback: true, match: ['проч'] },
];

const roundTo = (value: number, step: number): number => Math.round(value / step) * step;

export function buildPriceBook(rate: CostSpread = LABOR_RATE): PriceRangeRule[] {
  return JOBS.map((job) => {
    const parts: CostSpread = { min: job.parts[0], typical: job.parts[1], max: job.parts[2] };
    const laborHours: CostSpread = { min: job.hours[0], typical: job.hours[1], max: job.hours[2] };
    return {
      id: job.id,
      label: job.label,
      category: job.category,
      scope: job.scope,
      parts,
      laborHours,
      match: job.match,
      fallback: job.fallback,
      min: roundTo(parts.min + laborHours.min * rate.min, 100),
      typical: roundTo(parts.typical + laborHours.typical * rate.typical, 100),
      max: roundTo(parts.max + laborHours.max * rate.max, 100),
    };
  });
}

/** Пересчитывает вилку из её же основы под другую ставку нормо-часа. */
export function priceFromBasis(rule: PriceRangeRule, rate: CostSpread): PriceRangeRule {
  if (!rule.parts || !rule.laborHours) return rule;
  return {
    ...rule,
    min: roundTo(rule.parts.min + rule.laborHours.min * rate.min, 100),
    typical: roundTo(rule.parts.typical + rule.laborHours.typical * rate.typical, 100),
    max: roundTo(rule.parts.max + rule.laborHours.max * rate.max, 100),
  };
}

export const PRICE_BOOK: PriceRangeRule[] = buildPriceBook();
