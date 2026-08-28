import type { CategoryId } from '../types';

export const CATEGORIES: Array<{ id: CategoryId; label: string; subcategories: string[] }> = [
  { id: 'maintenance', label: 'ТО', subcategories: ['Масла и фильтры', 'Жидкости', 'Регламентные работы'] },
  { id: 'engine', label: 'Двигатель', subcategories: ['Мелкий ремонт', 'Средний ремонт', 'Крупный ремонт', 'Диагностика'] },
  { id: 'transmission', label: 'АКПП', subcategories: ['Обслуживание', 'Ремонт', 'Диагностика'] },
  { id: 'suspension', label: 'Подвеска', subcategories: ['Передняя', 'Задняя', 'Амортизаторы', 'Ступицы'] },
  { id: 'brakes', label: 'Тормоза', subcategories: ['Диски и колодки', 'Суппорты', 'Трубки и шланги'] },
  { id: 'steering', label: 'Рулевое', subcategories: ['Рейка', 'Тяги и наконечники', 'ГУР'] },
  { id: 'cooling', label: 'Охлаждение', subcategories: ['Радиатор', 'Помпа и термостат', 'Патрубки'] },
  { id: 'ac', label: 'Кондиционер', subcategories: ['Диагностика', 'Компрессор', 'Радиатор и магистрали'] },
  { id: 'electrics', label: 'Электрика', subcategories: ['Диагностика', 'Проводка', 'Генератор и стартер', 'Комфорт'] },
  { id: 'body', label: 'Кузов', subcategories: ['Локальный ремонт', 'Несколько элементов', 'Полный окрас', 'Сварка', 'Геометрия'] },
  { id: 'tires', label: 'Резина', subcategories: ['Летняя', 'Зимняя', 'Диски'] },
  { id: 'interior', label: 'Салон', subcategories: ['Обивка', 'Пластик', 'Химчистка'] },
  { id: 'exhaust', label: 'Выхлоп', subcategories: ['Глушитель', 'Катализатор', 'Крепления'] },
  { id: 'other', label: 'Прочее', subcategories: ['Не классифицировано'] },
];
