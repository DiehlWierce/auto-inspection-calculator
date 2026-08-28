/**
 * Первый этап отбора: сохранённая страница выдачи → осмотры внутри файла экспорта.
 *
 *   pnpm screening <экспорт.json> <страница.html…> [ключи]
 *
 *   --out <файл>     куда записать результат (по умолчанию рядом, с суффиксом -screening)
 *   --merge          дополнять уже существующий осмотр с той же ссылкой, а не пропускать его
 *   --no-wear        не добавлять вопросы, выведенные из пробега и возраста
 *   --discount <₽>   ожидаемый торг для всех машин пачки
 *   --source <имя>   площадка, если она не avito
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { calculateInspection } from '../src/calc';
import { buildBackup, parseBackup } from '../src/storage/backup';
import { modelName } from '../src/domain/vehicle';
import { money } from '../src/utils';
import { parseAvitoHtml } from '../src/importers/avito';
import { ListingError, buildScreening } from '../src/importers/listings';
import { factsFromListing, matchModel, vehicleFromListing } from '../src/importers/rules';
import type { ListingCar } from '../src/importers/listings';
import type { Inspection } from '../src/types';

const ZONES: Record<string, string> = { GREEN: 'зелёная', YELLOW: 'жёлтая', RED: 'красная', FILTER_FAIL: 'отсев' };

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const files: string[] = [];
  const options: { out?: string; merge: boolean; wear: boolean; discount: number; source: string } = { merge: false, wear: true, discount: 0, source: 'avito' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--merge') options.merge = true;
    else if (arg === '--no-wear') options.wear = false;
    else if (arg === '--out') options.out = argv[++index];
    else if (arg === '--discount') options.discount = Number(argv[++index]) || 0;
    else if (arg === '--source') options.source = argv[++index] ?? 'avito';
    else if (arg.startsWith('--')) fail(`Неизвестный ключ ${arg}.`);
    else files.push(arg);
  }
  if (files.length < 2) fail('Нужны файл экспорта и хотя бы одна сохранённая страница: pnpm screening экспорт.json страница.html');
  return { backupPath: files[0], pages: files.slice(1), options };
}

function table(rows: string[][]): string {
  const widths = rows[0].map((_cell, column) => Math.max(...rows.map((row) => [...(row[column] ?? '')].length)));
  return rows.map((row, index) => {
    const line = row.map((cell, column) => (column === 0 ? cell.padEnd(widths[column]) : cell.padStart(widths[column]))).join('  ');
    return index === 0 ? `${line}\n${'─'.repeat(line.length)}` : line;
  }).join('\n');
}

function report(inspections: Inspection[], title: string): void {
  if (inspections.length === 0) return;
  const rows = inspections.map((inspection) => {
    const result = calculateInspection(inspection, inspection.configSnapshot, { withRisk: false });
    return {
      inspection,
      result,
      cells: [
        `${modelName(inspection.configSnapshot, inspection.vehicle.modelId)}, ${inspection.vehicle.year}`,
        `${Math.round(inspection.vehicle.mileage / 1000)} тыс`,
        money(inspection.pricing.askingPrice),
        money(result.safeRestoreCost),
        money(result.fullSafeRestoreCost),
        money(result.fullRemainingBudget),
        ZONES[result.zone] ?? result.zone,
        result.rating.score === null ? '—' : String(Math.round(result.rating.score)),
        String(result.questionFactsCount),
      ],
    };
  }).sort((left, right) => (right.result.rating.score ?? -1) - (left.result.rating.score ?? -1));

  console.log(`\n${title}\n`);
  console.log(table([['Авто', 'Пробег', 'Цена', 'Срочно', 'Все работы', 'Остаток фонда', 'Зона', 'Рейтинг', '?'], ...rows.map((row) => row.cells)]));
  console.log('\nСсылки и что спросить:');
  for (const row of rows) {
    console.log(`\n  ${row.cells[0]} · ${money(row.inspection.pricing.askingPrice)} · ${row.inspection.vehicle.listingUrl}`);
    for (const fact of row.inspection.facts) console.log(`    ${fact.status === 'QUESTION' ? '?' : '!'} ${fact.description}${fact.comment ? ` — ${fact.comment}` : ''}`);
  }
}

const { backupPath, pages, options } = parseArgs(process.argv.slice(2));
const backup = (() => {
  try {
    return parseBackup(readFileSync(backupPath, 'utf8'));
  } catch (error) {
    return fail(`Не удалось прочитать файл экспорта ${backupPath}.\n${error instanceof Error ? error.message : String(error)}`);
  }
})();

const listings = pages.flatMap((page) => parseAvitoHtml(readFileSync(page, 'utf8')));
if (listings.length === 0) fail('На страницах не нашлось ни одной карточки. Сохраните страницу выдачи целиком: Cmd+S → «Веб-страница, только HTML».');

const rejected: string[] = [];
const cars: ListingCar[] = [];
for (const listing of listings) {
  const match = matchModel(backup.config, listing);
  if ('reason' in match) { rejected.push(`${listing.title} — ${match.reason}`); continue; }
  cars.push({
    url: listing.url,
    title: listing.title,
    model: match.model.id,
    engineVariant: match.variantId,
    year: listing.year ?? undefined,
    mileage: listing.mileage ?? undefined,
    askingPrice: listing.price ?? undefined,
    expectedDiscount: options.discount,
    ...vehicleFromListing(listing),
    facts: factsFromListing(listing, { wear: options.wear, modelId: match.model.id }),
  });
}

let screening;
try {
  screening = buildScreening(backup.config, backup.inspections, { source: options.source, cars }, { merge: options.merge });
} catch (error) {
  if (error instanceof ListingError) fail(`Пачка не собрана, файл не изменён:\n  ${error.problems.join('\n  ')}`);
  throw error;
}

const out = options.out ?? backupPath.replace(/(\.json)?$/, '-screening.json');
writeFileSync(out, buildBackup(backup.config, screening.inspections));

console.log(`Карточек на странице: ${listings.length}. Новых осмотров: ${screening.added.length}. Дополнено: ${screening.merged.length}. Пропущено как уже известные: ${screening.skipped.length}.`);
if (rejected.length > 0) console.log(`\nВне модельного ряда (${rejected.length}):\n${rejected.map((line) => `  · ${line}`).join('\n')}`);
if (screening.skipped.length > 0 && !options.merge) console.log(`\nУже есть в файле, пропущены (--merge, чтобы дополнить):\n${screening.skipped.map((line) => `  · ${line}`).join('\n')}`);
report([...screening.added, ...screening.merged], 'Отобранные машины (по убыванию рейтинга)');
console.log(`\nФайл для импорта: ${basename(out)}\nВсего осмотров в файле: ${screening.inspections.length}. Импорт в приложении заменит текущие данные этим файлом.`);
