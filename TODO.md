# Доработки

Список составлен по итогам полного ревью 29 августа 2026 года. На момент составления
`pnpm test` (93 теста) и `pnpm build` проходят. Приоритеты: P0 — приложение считает или
делает не то, что обещает; P1 — надёжность и корректность на краях; P2 — инфраструктура;
P3 — качество кода и удобство.

## P0. Ошибки в поведении

### 1. Кэш риск-симуляции не учитывает базовые расходы

`forecastHash` в [src/calc/forecast/index.ts](src/calc/forecast/index.ts) собирается из событий,
машины и параметров симуляции, но не включает `fuelPrice`, `insuranceByYear`, `serviceByYear`,
`fluidsByYear`, `consumablesByYear`, `tiresByYear`, `washingByYear`, `finesByYear`,
`consumptionLPer100Km` и `taxAnnual` модели, отложенные факты и суммы SCHEDULED-событий.
Всё перечисленное входит в `baseline`, по которому `simulateRisks` считает превышение
годового лимита — и результат кладётся в кэш по этому же хэшу.

Проверено: при `fuelPrice` 71 → 800 (годовые расходы уходят далеко за лимит 300 000 ₽)
`probabilityAnyLimitViolation` остаётся ровно 0,7886; при принудительной смене
`simulationSeed`, то есть при промахе мимо кэша, значение меняется.

Последствия: вероятности превышения лимита, компонент рейтинга «Риск превышения годового
лимита» и предупреждения устаревают после любой правки сценария расходов или добавления
отложенной работы.

Что сделать: добавить в хэш все слагаемые baseline (либо хэшировать сам массив baseline).

### 2. PWA не работает на GitHub Pages

Сборка идёт с `base: '/auto-inspection-calculator/'`, но:

- [src/main.tsx](src/main.tsx) регистрирует воркер по `/sw.js` — на Pages это 404,
  регистрация не проходит, промис отклоняется без обработчика;
- [public/manifest.webmanifest](public/manifest.webmanifest) содержит `start_url: "/"` и
  иконку `/icon.svg` — установленное приложение открывает корень домена, иконка не грузится;
- [public/sw.js](public/sw.js) предзагружает `['/','/index.html','/manifest.webmanifest','/icon.svg']`
  и в офлайн-фолбэке отдаёт `/`.

README обещает «Local-first PWA» и офлайн — на задеплоенном сайте офлайна нет вообще.

Что сделать: собрать пути от `import.meta.env.BASE_URL`, манифест генерировать или
переписать под base, `start_url` и `scope` указать явно.

### 3. Service worker навсегда залипает на старой сборке

Даже после починки путей: `caches.match(event.request)` — cache-first для всех GET,
включая навигацию, имя кэша зашито как `auto-inspection-shell-v1` и не меняется между
деплоями, а в `activate` старые кэши не удаляются. После выката пользователь останется
на прошлой версии приложения, пока вручную не сбросит данные сайта.

Что сделать: network-first (или stale-while-revalidate) для навигационных запросов,
cache-first только для хэшированных ассетов, версия кэша из сборки, очистка старых
кэшей в `activate`.

### 4. Ошибки записи в IndexedDB проглатываются

В [src/hooks/useAppData.ts](src/hooks/useAppData.ts) — `void saveInspection(saved)`,
`void deleteInspection(id)`, `void saveConfig(next)`: ни у одного вызова нет `catch`.
В приватном окне, при исчерпании квоты или при блокировке хранилища другой вкладкой
(`openDb` отдельно бросает «Хранилище занято другой вкладкой») осмотр выглядит
сохранённым в интерфейсе, но на диск не попал.

Что сделать: обрабатывать отказ записи и показывать его — это единственное хранилище
данных осмотра, тихая потеря здесь дороже всего остального в списке.

## P1. Надёжность и корректность

### 5. Возраст машины считается от текущего года, а не от даты осмотра

`wearCurve` в [src/calc/forecast/model.ts](src/calc/forecast/model.ts) берёт
`new Date().getFullYear()`. Тот же самый осмотр 31 декабря и 1 января даст разные
множители износа, разные вероятности и разный рейтинг. Снимок конфигурации это не
фиксирует, хотя README обещает воспроизводимость расчёта. То же в
`factsFromListing` ([src/importers/rules.ts](src/importers/rules.ts)) для правил по возрасту.

Что сделать: считать возраст от `inspection.createdAt`.

### 6. `CATEGORIES.find(...)!` роняет экран

[src/views/inspection/InspectionView.tsx](src/views/inspection/InspectionView.tsx) (строки 34 и 51)
и [src/domain/factory.ts](src/domain/factory.ts) (строка 9) снимают проверку на null.
Факт с категорией, которой нет в `CATEGORIES` — старый бэкап, правленый вручную JSON,
изменённый seed — уронит весь экран в `ErrorBoundary`.

Что сделать: фолбэк на `other` вместо `!`.

### 7. Черновики этапа ключуются именем элемента

`StageReview` хранит `drafts` в `Record<element, StageDraft>`, а `stageHasFact`
([src/domain/layout.ts](src/domain/layout.ts)) ищет факт по `stageId` + имени элемента.
Два одноимённых элемента в разных блоках одного этапа делят одно состояние.
Из-за этого же `buildScreening` вынужден отказываться от элемента, встречающегося
в шаблоне дважды, вместо того чтобы его различить.

Что сделать: дать элементам layout стабильные id и ключевать по `blockId + elementId`.

### 8. `updateConfig` пишет в БД внутри апдейтера `setConfig`

[src/hooks/useAppData.ts](src/hooks/useAppData.ts): апдейтер состояния мутирует клон,
проставляет `version = manual-${Date.now()}` и вызывает `saveConfig`. Апдейтер обязан
быть чистым — в StrictMode React выполняет его дважды, получаются две разные версии
и две записи в хранилище.

Что сделать: считать следующий конфиг снаружи, писать после `setConfig`.

### 9. Запись всего конфига в IndexedDB на каждое нажатие клавиши

`MoneyInput` коммитит значение на каждый валидный ввод, `PriceBookSettings` и остальные
панели настроек на каждый коммит вызывают `updateConfig`, а тот делает
`cloneConfig` (полный JSON round-trip справочника цен, моделей, событий и шаблонов)
и `saveConfig`. Ввод «25000» — пять клонирований и пять записей всего каталога.

Что сделать: debounce на сохранение и на смену `version`.

### 10. `downloadText` отзывает objectURL сразу после клика

[src/utils.ts](src/utils.ts): `URL.revokeObjectURL(url)` идёт следующей строкой после
`anchor.click()`. В Safari и на iOS это отменяет скачивание — то есть экспорт, который
README предлагает как единственный способ переноса данных между устройствами.

Что сделать: отзывать по таймауту.

### 11. Неизвестное число ключей показывается как «0 шт.»

В карточке автомобиля `keyCount: undefined` рендерится как «0 шт.», хотя `vehicleInfoScore`
([src/calc/rating.ts](src/calc/rating.ts)) `undefined` осознанно не штрафует. Интерфейс
утверждает то, чего расчёт не утверждает.

## P2. Инфраструктура

### 12. CI не запускает тесты

[.github/workflows/deploy.yml](.github/workflows/deploy.yml) выполняет только `pnpm build`.
93 теста не гоняются нигде, кроме локальной машины.

Что сделать: шаг `pnpm test` в build-job и отдельный workflow на pull request.

### 13. Зависимости на `latest`, dev-зависимости в `dependencies`

В [package.json](package.json) `react`, `react-dom`, `vite`, `typescript`, `vitest` и
`@vitejs/plugin-react` указаны как `"latest"`; typescript, vitest и plugin-react при этом
лежат в `dependencies`, а не в `devDependencies`. Любое обновление лока может без спроса
поднять мажорную версию React или Vite.

Что сделать: зафиксировать диапазоны, развести dev и runtime.

### 14. В гит закоммичены артефакты

`tsconfig.tsbuildinfo` (33 КБ состояния сборки, меняется в каждом коммите) и
`.pnpm-store/v11/index.db` отслеживаются гитом.

Что сделать: добавить в `.gitignore`, убрать из индекса через `git rm --cached`.

### 15. Нет линтера и нет строгих флагов компилятора

ESLint/oxlint в проекте нет. В [tsconfig.json](tsconfig.json) не включены
`noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`,
`noFallthroughCasesInSwitch`. Последний флаг особенно полезен здесь: обращения по индексу
в массивы прогноза (`values[yearIndex]`, `intensity[index]`) идут без проверки границ.

### 16. Пробелы в тестах

Покрыты: importers, budget, repairTypes, calculator, forecast/analytic, forecast/simulate,
storage/backup, storage/normalize. Не покрыты вообще:

- `calc/rating.ts` — центральная выходная величина приложения, проверяется только косвенно;
- `calc/forecast/reserve.ts` — логика накопления резерва и остатка;
- `domain/*`, `storage/db.ts`, `utils.ts`;
- ни одного теста компонентов: нет ни jsdom-окружения, ни testing-library.

Как минимум `rating.ts` и `reserve.ts` стоит покрыть до следующих правок расчёта, а на
пункт 1 из этого списка написать регрессионный тест.

## P3. Качество кода и удобство

### 17. Дублирование списка элементов ГРМ

Три названия элемента ГРМ перечислены дважды: [src/domain/layout.ts](src/domain/layout.ts)
(строка 36) и [src/importers/listings.ts](src/importers/listings.ts) (`TIMING_ELEMENTS`).
Вынести в одну экспортируемую константу.

### 18. `intensityByMonth` считается дважды за расчёт

`calculateAnalytic` и `fiveYearPercentile` в
[src/calc/forecast/analytic.ts](src/calc/forecast/analytic.ts) независимо прогоняют
интенсивности по всем событиям и всем 60 месяцам. Результат первой можно передать во вторую.

### 19. Мелочи в `budget.ts`

Фильтр `urgency === 'NOW'` пробегается по фактам трижды (`immediateSafeRestoreCost`,
`nearTermSafeRestoreCost`, `uncertaintyPremium`). Ветка PRICEBOOK кладёт `safeCost: range.max`
без `roundCurrency`, в отличие от ветки STATED.

### 20. Доступность

`.brand` в [src/app/App.tsx](src/app/App.tsx) имеет `role="button"` и `tabIndex={0}`, но не
имеет `onKeyDown` — с клавиатуры элемент фокусируется и не активируется. Подтверждения
удаления и сообщения об ошибках сделаны на 13 вызовах `window.confirm`/`window.alert`:
на мобильном это системные диалоги поверх приложения, которые нельзя оформить и неудобно
нажимать одной рукой.

### 21. Нет тёмной темы

В [src/styles.css](src/styles.css) нет ни одного `prefers-color-scheme`. Инструмент
предназначен для осмотра машины на улице, в том числе вечером и в гараже.
