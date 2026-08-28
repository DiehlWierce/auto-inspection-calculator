import type { InspectionLayout, InspectionTemplate, ModelId } from './types';

export const CLASSIC_INSPECTION_LAYOUT: InspectionLayout = [
  { id: 'body', label: 'Кузов', description: 'Элементы, коррозия, геометрия и следы ремонта.', categories: ['body'], blocks: [
    { id: 'body-panels', label: 'Внешние элементы', category: 'body', subcategory: 'Локальный ремонт', elements: ['Передний бампер', 'Капот', 'Левое переднее крыло', 'Правое переднее крыло', 'Левая передняя дверь', 'Правая передняя дверь', 'Левая задняя дверь', 'Правая задняя дверь', 'Крыша', 'Крышка багажника', 'Задний бампер'] },
    { id: 'body-structure', label: 'Структура и низ', category: 'body', subcategory: 'Геометрия', elements: ['Левый порог', 'Правый порог', 'Днище', 'Лонжероны', 'Стаканы', 'Крепления подвески', 'Геометрия кузова'] },
  ] },
  { id: 'interior', label: 'Салон', description: 'Состояние салона, комплектация и комфорт.', categories: ['interior'], blocks: [
    { id: 'interior-trim', label: 'Отделка', category: 'interior', subcategory: 'Обивка', elements: ['Сиденья', 'Потолок', 'Дверные карты', 'Торпедо и пластик', 'Ковры и обивка пола', 'Багажник'] },
    { id: 'interior-equipment', label: 'Оборудование', category: 'interior', subcategory: 'Пластик', elements: ['Ремни безопасности', 'Подушки безопасности', 'Стеклоподъёмники', 'Центральный замок', 'Приборная панель'] },
  ] },
  { id: 'engine', label: 'Двигатель и охлаждение', description: 'Запуск, работа, течи, навесное оборудование и система охлаждения.', categories: ['engine', 'cooling'], blocks: [
    { id: 'engine-operation', label: 'Работа двигателя', category: 'engine', subcategory: 'Диагностика', elements: ['Холодный запуск', 'Холостой ход', 'Разгон и тяга', 'Посторонние звуки', 'Дым из выхлопа', 'Течи масла', 'Компрессия'] },
    { id: 'engine-mechanics', label: 'Навесное и опоры', category: 'engine', subcategory: 'Мелкий ремонт', elements: ['Навесное оборудование', 'Опоры двигателя', 'Форсунки и топливная система'] },
    { id: 'engine-cooling', label: 'Охлаждение', category: 'cooling', subcategory: 'Радиатор', elements: ['Радиатор', 'Патрубки', 'Термостат', 'Помпа', 'Вентилятор охлаждения'] },
  ] },
  { id: 'transmission', label: 'АКПП', description: 'Переключения, пробуксовки, удары и течи.', categories: ['transmission'], blocks: [
    { id: 'transmission-check', label: 'Проверка в движении', category: 'transmission', subcategory: 'Диагностика', elements: ['Включение D и R', 'Переключения', 'Пробуксовка', 'Удары и задержки', 'Кикдаун', 'Течи и состояние масла'] },
  ] },
  { id: 'runningGear', label: 'Ходовая', description: 'Подвеска, тормоза и рулевое управление.', categories: ['suspension', 'brakes', 'steering'], blocks: [
    { id: 'running-suspension', label: 'Подвеска', category: 'suspension', subcategory: 'Передняя', elements: ['Передняя подвеска', 'Задняя подвеска', 'Амортизаторы', 'Пружины', 'Ступичные подшипники'] },
    { id: 'running-brakes', label: 'Тормоза', category: 'brakes', subcategory: 'Диски и колодки', elements: ['Передние диски и колодки', 'Задние диски и колодки', 'Суппорты', 'Тормозные трубки'] },
    { id: 'running-steering', label: 'Рулевое', category: 'steering', subcategory: 'Тяги и наконечники', elements: ['Рулевая рейка', 'Тяги и наконечники', 'ГУР'] },
  ] },
  { id: 'electrics', label: 'Электрика и климат', description: 'Запуск, зарядка, свет, комфорт и кондиционер.', categories: ['electrics', 'ac'], blocks: [
    { id: 'electrics-main', label: 'Электрика', category: 'electrics', subcategory: 'Диагностика', elements: ['Аккумулятор', 'Генератор', 'Стартер', 'Освещение', 'Ошибки на панели', 'Проводка'] },
    { id: 'electrics-comfort', label: 'Комфорт и климат', category: 'ac', subcategory: 'Диагностика', elements: ['Кондиционер', 'Печка', 'Вентилятор', 'Обогревы и зеркала'] },
  ] },
  { id: 'service', label: 'ТО и регламент', description: 'Что по регламенту уже закрыто, а что придётся оплатить сразу после покупки.', categories: ['maintenance'], blocks: [
    { id: 'service-oil', label: 'Масло и фильтры', category: 'maintenance', subcategory: 'Масла и фильтры', elements: ['Масло двигателя и масляный фильтр', 'Воздушный фильтр', 'Салонный фильтр', 'Топливный фильтр'] },
    { id: 'service-fluids', label: 'Жидкости', category: 'maintenance', subcategory: 'Жидкости', elements: ['Антифриз', 'Тормозная жидкость', 'Масло АКПП', 'Жидкость ГУР'] },
    { id: 'service-scheduled', label: 'Регламентные работы', category: 'maintenance', subcategory: 'Регламентные работы', elements: ['ГРМ: уточнить тип и состояние', 'Ремень навесного и ролики', 'Свечи зажигания', 'История обслуживания'] },
  ] },
  { id: 'wheels', label: 'Колёса и выхлоп', description: 'Резина, диски и выхлопная система.', categories: ['tires', 'exhaust', 'other'], blocks: [
    { id: 'wheels-tires', label: 'Колёса', category: 'tires', subcategory: 'Летняя', elements: ['Летняя резина', 'Зимняя резина', 'Диски', 'Запасное колесо'] },
    { id: 'wheels-exhaust', label: 'Выхлоп и прочее', category: 'exhaust', subcategory: 'Глушитель', elements: ['Глушитель', 'Катализатор', 'Крепления выхлопа', 'Прочие замечания'] },
  ] },
];

const ALL_MODELS: ModelId[] = ['corolla-e120', 'cerato-ld', 'lacetti-hatch'];

export const DEFAULT_INSPECTION_TEMPLATES: InspectionTemplate[] = [
  {
    id: 'classic-corolla',
    name: 'Классический · Toyota Corolla E120',
    description: 'Полный базовый осмотр Corolla E120. Вариант двигателя выбирается при создании осмотра.',
    modelIds: ['corolla-e120'],
    layout: CLASSIC_INSPECTION_LAYOUT,
    isBuiltIn: true,
  },
  {
    id: 'corolla-3zz-chain',
    name: '3ZZ-FE · цепь ГРМ · Toyota Corolla',
    description: 'Шаблон для Corolla E120 с отдельной проверкой цепи и натяжителя.',
    modelIds: ['corolla-e120'],
    engineVariantIds: ['3zz-fe'],
    layout: CLASSIC_INSPECTION_LAYOUT,
    isBuiltIn: true,
  },
  {
    id: 'classic-cerato',
    name: 'Классический · Kia Cerato LD',
    description: 'Полный базовый осмотр Cerato LD. Вариант двигателя выбирается при создании осмотра.',
    modelIds: ['cerato-ld'],
    layout: CLASSIC_INSPECTION_LAYOUT,
    isBuiltIn: true,
  },
  {
    id: 'cerato-g4ed-belt',
    name: 'G4ED · ремень ГРМ · Kia Cerato',
    description: 'Шаблон для Cerato LD с отдельной проверкой ремня и роликов.',
    modelIds: ['cerato-ld'],
    engineVariantIds: ['g4ed'],
    layout: CLASSIC_INSPECTION_LAYOUT,
    isBuiltIn: true,
  },
  {
    id: 'classic-lacetti',
    name: 'Классический · Chevrolet Lacetti Hatch',
    description: 'Полный базовый осмотр Lacetti Hatch. Вариант двигателя выбирается при создании осмотра.',
    modelIds: ['lacetti-hatch'],
    layout: CLASSIC_INSPECTION_LAYOUT,
    isBuiltIn: true,
  },
  {
    id: 'lacetti-f16d3-belt',
    name: 'F16D3 · ремень ГРМ · Chevrolet Lacetti',
    description: 'Шаблон для Lacetti Hatch с отдельной проверкой ремня и роликов.',
    modelIds: ['lacetti-hatch'],
    engineVariantIds: ['f16d3'],
    layout: CLASSIC_INSPECTION_LAYOUT,
    isBuiltIn: true,
  },
  {
    id: 'extended-cabin',
    name: 'Расширенный салон · все модели',
    description: 'Классический шаблон с дополнительной проверкой комплектации и комфорта.',
    modelIds: ALL_MODELS,
    layout: CLASSIC_INSPECTION_LAYOUT.map((stage) => stage.id !== 'interior' ? stage : ({
      ...stage,
      blocks: stage.blocks.map((block) => block.id !== 'interior-equipment' ? block : ({
        ...block,
        elements: [...block.elements, 'Круиз-контроль / доп. функции', 'Штатная мультимедиа'],
      })),
    })),
    isBuiltIn: true,
  },
];
