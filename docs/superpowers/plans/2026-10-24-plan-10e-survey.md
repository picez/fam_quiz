# План 10e: «100 до 1» (`survey`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** частина 10e специфікації (розділ 9) і спільні правила розділу 14a, що її стосуються.
- **«100 до 1» (`survey`)** — новий тип запитання. Ведучий задає запитання («Назвіть фрукт, який люблять діти») і дошку з 4–8 рядків. У кожного рядка є «популярність» (людей зі 100, разом не більше 100) і прийнятні написання. Гравець вводить до N відповідей (N задає ведучий: 1–5, типово 3).
- **Бали:** кожна відповідь, що збіглася з рядком, дає `ціна × популярність / 100`. Однаковий рядок двічі не рахується. Бали гравця — не більше ціни. Бонусу за швидкість немає.
- **Друге джерело дошки — «хмара слів», що вже прозвучала раніше в цій грі.** У редакторі це вибір «відповіді з хмари №…». У мить відкриття рушій будує дошку з `cloudTally` тієї хмари без схованих слів: до 8 найчастіших слів, популярність = `round(100 × гравців, що назвали / гравців, що писали)`. Збудована дошка лежить у стані гри й в історії.
- **Розкриття:** на сцені табло, як у телешоу. Рядки відкриваються по одному знизу вгору кнопкою ведучого. Біля кожного видно, хто його назвав. Рядки, яких ніхто не назвав, теж відкриваються.
- **Що вважається правильним (14a):** «100 до 1» — тип «кількість знайденого». Правильною вважається відповідь, що дала щонайменше половину ціни (`proximityPartial` + `shareVerdict`).
- **Анти-ціль «відповідь раніше розкриття»:** рядки дошки (тексти, популярність, написання, збіги гравців) не потрапляють на телефон чи сцену до розкриття. На розкритті сцена отримує лише вже відкриті рядки.
- **Довідка ведучого:** запис `question.survey` (typecheck вимагає), рядок про «100 до 1» у `question.wordcloud.tip` і оновлені записи бафів, клітинок, раундів і бонусу за швидкість.
- **Демо:** у демо `demo` — «100 до 1» з дошкою ведучого в класиці `r-x3` і «100 до 1» з хмари розминки в класиці `r-rules`.

**Архітектура:**
- **Shared (`packages/shared/src/quiz.ts`, `answer.ts`, `views.ts`, `events.ts`, `history.ts`).**
  - `questionSchema` + гілка `survey`:
    - `rows: { id, text, popularity, accepted }[]`;
    - `answers` (скільки відповідей вводить гравець);
    - необов'язковий `cloudId` (id «хмари слів», з якої будується дошка).
  - `QUESTION_TYPES` + `'survey'`. До `SIMPLE_TYPES`, `REVEAL_TYPES`, `UNSCORED_TYPES` тип не входить.
  - Ліміти `LIMITS.minSurveyRows` … `LIMITS.defaultSurveyTime`.
  - Чисті функції: `surveyOrder` (рядки за популярністю), `surveyShare` (частка ціни за влучені рядки); `proximityPartial` + `'survey'`.
  - `answerSchema` + `{ type: 'survey', values }`. Перевірену відповідь `SurveyAnswer` (зі збігами `rows`) складає рушій.
  - Коди схеми: `survey_rows`, `survey_total`, `survey_duplicate`. Коди вікторини: `survey_place`, `survey_cloud`, `survey_cloud_place`.
  - Подія пульта `host:survey-all` (без даних).
  - Зрізи: `PublicQuestion.survey`, `BaseView.survey: SurveyInfo | null`, `PlayerView.me.survey`, `HostView.surveySkipped`.
  - Історія: `GameQuestionResult.surveyFromCloud`.
- **Рушій (`packages/engine`).**
  - `check.ts`:
    - `surveyHits` — нормалізація, як у «тексті», перший збіг рядка, повтор — `null`;
    - `checkAnswer` для `survey` — частка `surveyShare`.
  - Новий `survey.ts`:
    - `scoreSurvey` чистить відповідь і додає збіги;
    - `surveyBoard` будує дошку (з хмари, запасні рядки ведучого або `null` — пропуск);
    - `surveyPlayOf`, `stepSurvey`, `revealSurveyAll` — відкриття рядків на розкритті;
    - `skippedSurveys` — пропущені запитання для пульта.
  - `game.ts`:
    - `Play.survey?: SurveyPlay` (`source`, `shown`);
    - `openQuestion` для `survey` кладе збудовану дошку в `play.question.rows` і `Play.survey`;
    - `nextQuestion` пропускає «100 до 1» без дошки;
    - `submitAnswer` перевіряє через `scoreSurvey`, без бонусу за швидкість;
    - `acceptAnswer` приймає «100 до 1» і на полі з ручною перевіркою;
    - `override` відмовляє;
    - `next` на `reveal` спершу відкриває рядки.
  - `restore.ts`: **`GAME_STATE_VERSION` 4 → 5** (`Play.survey`, тип `SurveyPlay`), `READABLE_STATE_VERSIONS = [2, 3, 4, 5]`.
  - `views.ts`:
    - `PublicQuestion.survey` — лише кількості;
    - `SurveyInfo` — закриті рядки без тексту, на розкритті відкриті знизу `shown`;
    - пульт — уся дошка з авторами наживо;
    - `me.survey` — власні рядки на розкритті;
    - зі зрізів сцени й телефонів прибрано рядки з `reveal` і збіги з відповідей до розкриття;
    - `total` раунду без пропущених.
- **Сервер.**
  - Сокет `host:survey-all` → `revealSurveyAll` (проста дія пульта).
  - `recorder.ts`: `PlayRef.surveyRows` — збудована дошка для запитань з хмари.
  - `history.ts`: підставляє `surveyRows` у знімок запитання й ставить `surveyFromCloud`.
  - Профіль і досягнення читають `accepted` — лише тести.
  - Демо `demo` отримує два «100 до 1».
- **Веб.**
  - Спільне: `SurveyBoard` (табло: місце, текст, популярність, хто назвав; закриті рядки — смуга з номером).
  - Телефон:
    - `SurveyInput` — N полів, повтори підсвічено, «Відповісти»;
    - після надсилання — свої відповіді;
    - на розкритті — збіги, популярність і бали.
  - Сцена:
    - порожнє табло й «Пишіть до N відповідей на телефоні»;
    - на розкритті рядки відкриваються знизу з перегортанням.
  - Пульт:
    - уся дошка з популярністю й живими авторами;
    - кнопки «Відкрити рядок (k з n)» (це `host:next`) і «Відкрити всі»;
    - підпис джерела;
    - попередження про пропущене запитання;
    - без кнопок оцінки.
  - Редактор:
    - `SurveyEditor` — джерело дошки «мої відповіді / відповіді з хмари №…», рядки з популярністю й написаннями, «Разом: N зі 100», запасні рядки для хмари, кількість відповідей;
    - обмеження клітинок поля, перевірки чернетки, відновлення чернетки.
  - Історія: табло з авторами, відповіді з позначками збігів.
  - Довідка: запис `question.survey` і оновлення пов'язаних.

**Технології:** TypeScript, zod 4, vitest, Drizzle ORM (PGlite у тестах), Fastify + Socket.IO, React 19 + Vite, Testing Library (jsdom), Playwright. Нових залежностей немає.

**Специфікація:** `docs/superpowers/specs/2026-10-24-new-formats-design.md`:
- розділ 9 (частина 10e);
- розділ 14a: «що вважається правильною відповіддю» («100 до 1» названо прямо), «правила раунду для нових типів», «деплой»;
- розділ 2: анти-цілі «правильна відповідь раніше розкриття» (рядки «100 до 1» названо прямо), «старі вікторини змінюють бали», «живі ігри обриваються деплоєм»;
- розділ 3: нове поле має типове значення; телефон — один палець, вузький екран;
- розділ 5, пункт 5: кожен тип має запис у довідці;
- розділ 17: «"100 до 1" може брати дошку з попередньої "хмари слів"».

Зразки (найближчі прецеденти — 10d, `docs/superpowers/plans/2026-10-24-plan-10d-wall-poll-cloud.md`, 10c, `docs/superpowers/plans/2026-10-24-plan-10c-clues-pin.md`, і злитий код):
- `packages/engine/src/votes.ts` — **дані хмари для дошки**: `cloudTally` (уже відкидає повтори одного гравця, найчастіше написання, порядок за `count`), `cloudVoters(play, players)`, `Play.cloudHidden`, `hideCloudWord`.
- `packages/engine/src/check.ts`:
  - `textMatches` (нормалізація «тексту» через `normalizeText` з `normalize.ts`);
  - `shareVerdict`, `verdictOf`, `paysForTime`.
- `packages/engine/src/game.ts`:
  - `openQuestion`, `nextQuestion`, `advance`, `submitAnswer`, `submitBoardAnswer`, `acceptAnswer`, `override`, `overrideBoard`;
  - `next` (гілка `reveal` у фіналі — **зразок покрокового розкриття**: `final.shown`);
  - `lockNow`, `revealNow`.
- `packages/engine/src/buffs.ts` (`placeBlock`, `fitBlock` — `unfit_type` для не-`SIMPLE_TYPES`), `board.ts` (`pickCell`), `board-turns.ts` (`boardPoints`), `score.ts` (`answerPoints`, `speedFactor`), `restore.ts`, `restore.test.ts` (`STATE_SHAPE`, `KEYS`, `representative`), `testing/fixtures.ts` (`cloud` q16).
- `packages/engine/src/views.ts`:
  - `publicQuestion`, `shownQuestion`, `withoutHint`, `revealStats`;
  - `stageCloud` / `hostCloud` (зразок «сцені — лише на reveal, пульту — усе»);
  - `stageView`, `playerView` (`me.answer`, `me.result`), `hostView`, `base` (`total`).
- `packages/shared/src/quiz.ts` (гілки `text`, `wall`, `wordcloud`; `spellings`; `cloudKey`; коди `wall_place`, `vote_place`, `spare_type`), `answer.ts` (`WallAnswer`), `views.ts`, `events.ts`, `history.ts`, `game.ts` (`BuffBlock`).
- `apps/server/src/rooms/manager.ts` (`HostAction`, `host()`), `socket.ts` (`SIMPLE_HOST_ACTIONS`), `recorder.ts` (`save` → `plays`, `cloudHidden`), `history.ts` (`playedQuestions`, `hostGame` → `cloudHidden`), `db/schema.ts` (`PlayRef`).
- Тести сервера: `history.test.ts` (`history: wall, poll and cloud (10d)`), `profiles.test.ts`, `achievements.test.ts`, `recorder.test.ts`, `socket.test.ts`.
- `apps/server/scripts/demo-quiz.ts` (`cloud`, `textQ`, `wall`, `cell`), `demo-quiz.test.ts`.
- `apps/web/src/screens/`:
  - `AnswerInput.tsx` (`TypedInput`), `CloudInput.tsx` (кілька полів, повтори за ключем — **зразок `SurveyInput`**);
  - `PlayerScreen.tsx`, `StageScreen.tsx`, `HostScreen.tsx` (кнопки оцінки, головна кнопка «Далі»), `HostCloud.tsx`, `WordCloud.tsx`, `WallReveal.tsx`.
- `apps/web/src/editor/`:
  - `QuestionEditor.tsx` (`Rows` написань тексту, рядки 424–437), `WallEditor.tsx` (зразок окремого тіла), `BoardEditor.tsx` (`wallCellNote`);
  - `draft.ts` (`questionTypesFor`, `build`, `changeType`, `problemKey`, `problemsOf`, `cleanQuestion`, `duplicateQuestion`), `draft-storage.ts` (`revive`, `numberOr`).
- `apps/web/src/help/{questions,powers,cells,rounds,settings}.ts`, `host-help.test.ts`, `HelpButton.tsx`.
- `apps/web/src/format.ts` (`correctText`, `answerText`), `guide-text.ts` (`TYPE_ICONS`), `i18n.ts` (`type_*`, `typeShort_*`, `typeHow_*`, `buffWhy_unfit_type_*`), `pages/GameHistory.tsx` (хмара з `cloudHidden`).
- `apps/server/e2e/full-game.e2e.ts`:
  - помічники `open`, `register`, `join`, `shot`, `afterSplash`, `expectNoSideScroll`, `expectStageFits`, `snapshot`, `problems`, `socketFrames`, `framesBeforeReveal`, `scoreOf`, `totalOf`, `toNextQuestion`;
  - сценарій 10d `wallPollCloudGame` — структура.

**Рішення плану там, де специфікація мовчить (і рішення координатора):**

*Дані*
- `{ type: 'survey', rows: SurveyRow[], answers: number, cloudId?: string }`, де `SurveyRow = { id, text, popularity, accepted }`:
  - `text` — відповідь, як її показує табло: 1…`LIMITS.surveyRowText` (40) символів. Вона ж — перше прийнятне написання;
  - `popularity` — ціле 1…`LIMITS.surveyTotal` (100), «людей зі 100»;
  - `accepted` — **додаткові** написання: 0…`LIMITS.maxAccepted − 1` (9), кожне 1…`LIMITS.answerText`;
  - `answers` — ціле 1…`LIMITS.maxSurveyAnswers` (5), типово `LIMITS.defaultSurveyAnswers` (3);
  - `cloudId` — id запитання `wordcloud` цієї ж вікторини.
- **Дошка ведучого** (без `cloudId`): рядків `LIMITS.minSurveyRows` (4)…`LIMITS.maxSurveyRows` (8), інакше `survey_rows`.
  - Сума популярності ≤ 100 (`survey_total`).
  - Написання (`text` і `accepted` усіх рядків) різні за `cloudKey` (`survey_duplicate`): одне написання не може вести у два рядки.
  - Id рядків різні (`duplicate_ids`).
- **Дошка з хмари** (є `cloudId`): `rows` — порожньо (без запасних) або 4…8 запасних рядків з тими самими перевірками (`survey_rows`, `survey_total`, `survey_duplicate`).
- Відео й аудіо можна, як у «тексті» (з відео таймера немає — ведучий закриває сам). Проявлення — ні (наявний `reveal_type`).
- Редактор ставить для нового запитання час `LIMITS.defaultSurveyTime` (45 с), ціну 1000, `answers: 3` і 5 порожніх рядків.

*Де діє*
- Класика; поле — лише звичайна клітинка з телефона (`survey_place`, як `wall_place`). Не діє в бліці, на бліц- та усній клітинці, у фіналі, у дуелях і в запасних (наявний `spare_type`).
  - *Рішення:* усну клітинку не робимо. Ведучому довелося б позначати кілька рядків з голосу; це окремий інтерфейс заради рідкісного випадку.
- **Дошка з хмари — лише в класиці** (`survey_cloud_place` для поля).
  - *Рішення:* хмара буває лише в класиці. Дошка «зібрана з усіх» пасує спільному моменту, а не ходу одного гравця. Пропуск запитання без дошки на полі вимагав би закритих клітинок.
- **`survey_cloud`:** `cloudId` має вказувати на `wordcloud`, що стоїть **раніше**: у попередньому раунді або в тому самому класичному раунді з меншим індексом.

*Перевірка відповіді*
- Відповідь з телефона: `{ type: 'survey', values: string[] }` — 1…`LIMITS.maxSurveyAnswers` рядків, кожен до `LIMITS.surveyAnswer` (40) символів. Порожні рядки дозволені: рушій їх відкидає.
- `scoreSurvey(question, answer): SurveyAnswer`:
  - обрізає й зводить пробіли;
  - відкидає порожні й повтори за `normalizeText`;
  - бере перші `question.answers`;
  - рахує `rows = surveyHits(question.rows, values)`.

  Нічого не лишилося → `type_mismatch`.
- `surveyHits(rows, values)`: для кожного значення — id першого рядка, де `textMatches([row.text, ...row.accepted], value)`. Якщо цей рядок уже влучено попереднім значенням — `null` (однаковий рядок двічі не рахується).
  - Нормалізація та сама, що в «тексті» (`normalizeText`: NFC, апострофи, лапки, пробіли, регістр). Вона збігається з `cloudKey` на всіх реальних словах, тож будь-яке написання слова з хмари влучає в його рядок.
- Записана відповідь — `SurveyAnswer = { type: 'survey', values, rows: (string | null)[] }`. Вона йде в запис, історію й пульт; телефон і сцена до розкриття бачать лише `values` (див. «Що видно»).
- `surveyShare(rows, hitIds) = min(1, Σ popularity різних влучених рядків / 100)`.
- **Бали.**
  - Класика: `answerPoints({ points, accuracy: share, speed: 1, multiplier, penalty })`.
  - Поле: `boardPoints(round, board, share)`.
  - Бали не більші за ціну × множник: `share ≤ 1`.
  - Приклади (ціна 1000, дошка «Яблуко 32 · Банан 25 · Полуниця 15 · Кавун 10 · Груша 8»):
    - «яблучко», «Банан» → 570, правильно;
    - «Кавун» → 100, частково;
    - «Яблуко», «яблуко» → 320 (повтор відкинуто), частково.
  - *Рішення:* без бонусу за швидкість. Відповідь — кілька слів, і швидкість набору тут не про знання. До того ж ціна вже спадає з популярністю, як у стіні й сортуванні.
- **Правильність (14a):** `proximityPartial` + `'survey'` → `verdictOf` бере `shareVerdict(share)`: `accepted = share ≥ 0,5`, `grade` — `correct` / `partial` / `wrong`. Правило раунду «частково» нічого не міняє (у `acceptAnswer` гілку `!proximityPartial` пропущено).
- **Штраф «мінус» (14a):** лише за відповідь з 0 балів, лише тому, хто відповів (дає `answerPoints` / `boardPoints` з `accuracy 0`).
- **Ручна оцінка.** `override` відмовляє (`wrong_phase`, як для стіни): дошка однозначна. На полі з `check: 'manual'` клітинку «100 до 1» ведучий приймає «Прийняти» (`acceptAnswer` дозволено), а `overrideBoard` відмовляє.
  - *Рішення:* «зарахувати інше написання» — окрема функція, її не робимо. Довідка радить додати написання заздалегідь.

*Дошка з хмари*
- `surveyBoard(state, question)` у мить `openQuestion`:
  1. `cloudPlay` — запис журналу з `question.id === cloudId`.
  2. `entries = cloudTally(cloudPlay, state.players).filter((e) => !e.hidden).slice(0, LIMITS.maxSurveyRows)`.
  3. `voters = cloudVoters(cloudPlay, state.players)`.
  4. Якщо `cloudPlay` немає (хмару не зіграли — наприклад, раунд завершено раніше) або `entries` порожні — дошка з хмари не вийшла:
     - є запасні рядки (`question.rows.length ≥ 4`) → дошка ведучого, `source: 'host'`;
     - немає → `null`: **запитання пропускається**.
  5. Інакше рядки `{ id: 'cloud-1'…, text: entry.text, popularity: max(1, round(100 × entry.count / voters)), accepted: [] }`, `source: 'cloud'`.
  - Порядок і зріз до 8 — сталий порядок `cloudTally` (`count` спаданням, далі текст). Сума популярності може бути більшою за 100: кожен гравець писав до 3 слів. Обмеження «бали ≤ ціни» це покриває.
- **Де лежить збудована дошка:** `openQuestion` кладе її в `play.question` (`{ ...question, rows }`) і ставить `Play.survey = { source, shown: 0 }`.
  - Так `checkAnswer`, `questionFor`, `verdictOf`, відновлення після перезапуску й `correct` пульта працюють без окремої гілки.
  - Знімок вікторини (`state.quiz`) не змінюється.
  - В історію дошка з хмари йде окремо (`PlayRef.surveyRows`).
- **Пропуск (рішення координатора «вирішити й описати»):** `nextQuestion` бере перше незігране запитання раунду, для якого `surveyBoard(state, q) !== null` (для інших типів — завжди). Запис у журналі не з'являється: записів, балів, серій, `questionsPlayed` і впливу на точність немає.
  - Ведучий бачить на пульті попередження з `HostView.surveySkipped`. Це тексти запитань поточного класичного раунду, які пропущено або буде пропущено:
    - запитання незігране, `surveyBoard === null`;
    - хмара «усталена»: її запис не поточний або етап не `question`/`locked`/`reveal`; або раунд хмари вже минув.

    Текст попередження: `t('surveySkipped', { text })` «Запитання «{text}» пропущено: хмара не дала слів, а запасних рядків немає.»
  - Лічильник «Запитання k з n» (`base.total`) не рахує пропущених.
  - *Рішення:* без нового стану. Рішення детерміноване: хмара в журналі вже закрита й не змінюється, бо `hideCloudWord` діє лише на поточне запитання.

*Розкриття*
- **Покроково кнопкою ведучого.** На `reveal` `Play.survey.shown` = 0. `host:next` (головна кнопка пульта) на `reveal`, поки `shown < rows.length`, лише відкриває наступний рядок знизу (`stepSurvey`); далі — звичайний `next`. `host:survey-all` (`revealSurveyAll`) відкриває всі одразу.
  - Зразок — розкриття фіналу (`final.shown`).
  - *Рішення:* без автовідкриття кожні 1,5 с. Ведучий тримає паузу, як у телешоу, і коментує рядок. Автотаймер вимагав би дедлайнів у `tick` заради одного екрана. «Відкрити всі» — для тих, хто поспішає.
- Порядок місць — `surveyOrder(rows)`: популярність спаданням, за рівності — порядок дошки. Місце 1 — угорі. Відкрито рядки з місцем `> total − shown`.
- Після `reveal` (таблиця, кінець раунду, кінець гри, `end` посеред розкриття) усі рядки вважаються відкритими.
- На полі: після «Прийняти» — `revealNow`, далі так само кроками.

*Бафи й дебафи (рішення «fit/unfit»)*
- **Діють:**
  - «Подвійні бали» (подвоює бали за дошку);
  - «Більше часу»;
  - «Щит» (за штрафу «мінус»);
  - «Підказка ведучого»;
  - «Заміна запитання» (гравець отримує просте запасне).
- **Не діють** (наявний `unfit_type`, бо тип не в `SIMPLE_TYPES`; нових причин не треба):
  - 50/50 — варіантів немає;
  - «Друга спроба» — відповідь уже складається з кількох спроб;
  - «Запитання в залі» — голоси залу розкрили б рядки дошки.
- **Дебафи** діють, як на «тексті». `Debuffs.tsx` не змінюється.

*Що видно*
- **Телефон.**
  - На етапі `question`: `PublicQuestion.survey = { answers, rows }` — скільки полів і скільки рядків на табло. Без текстів.
  - `me.answer` для «100 до 1» до розкриття — лише `{ type: 'survey', values }`, без `rows`.
  - На розкритті й пізніше — `me.survey.lines`: кожне власне значення з місцем, текстом рядка й популярністю (або `null` — мимо); `me.result` — бали.
- **Сцена.**
  - На етапі `question`/`locked`: `survey` з `total` закритими рядками (лише `rank`).
  - На `reveal` — відкриті рядки з текстом, популярністю й нікнеймами тих, хто назвав. `stage.reveal` для «100 до 1» — запитання з `rows: []`.
- **Пульт:** уся дошка з етапу `question` (текст, популярність, хто назвав наживо, позначка «відкрито на екрані»), джерело, `surveySkipped`.
- **Збіги в будь-якій відповіді для сцени й телефонів** (`me.answer`, відповідь, що чекає на полі, `spotlight`, якщо він несе відповідь) до розкриття віддаються без `rows` — спільний помічник `publicAnswer`.

*Формат стану й деплой*
- **`GAME_STATE_VERSION` 4 → 5.** Новий необов'язковий ключ `Play.survey?: SurveyPlay`, де `SurveyPlay = { source: 'host' | 'cloud'; shown: number }`.
- `KEYS[5]` = `KEYS[4]` з:
  - `Play: 'answers,blitz,board,buffs,chain,cloudHidden,clues,extraMs,final,overtime,question,roundIndex,sort,survey,wall'`;
  - новим `SurveyPlay: 'shown,source'`.

  `KEYS[1..4]` не змінюються.
- **`READABLE_STATE_VERSIONS = [2, 3, 4, 5]`**. Зміна лише адитивна, а стан версій 2–4 не може містити «100 до 1». Кімнати, збережені до розгортання, відновлюються, і **пуш не обриває живих ігор**. Перевірку `live_room` за 14a можна не робити. Звіт власникові має назвати це явно.
- **Міграцій немає:**
  - запитання — у jsonb `quiz.rounds`;
  - відповіді — у jsonb `answer.payload`;
  - `PlayRef.surveyRows` — у jsonb `game.plays`.

*Решта*
- **Історія ведучого.**
  - `correctText` — «Яблуко (32); Банан (25); …» за `surveyOrder`.
  - `answerText` — «яблучко ✓, Банан ✓, ананас ✗» (з `rows`; без `rows` — значення через кому).
  - Сторінка гри показує табло з авторами. Для дошки з хмари — підпис «Дошка з хмари слів».
- **Чого не робимо:**
  - «100 до 1» на усній клітинці;
  - ручного зарахування написань під час гри;
  - автовідкриття рядків;
  - «удару» (помилок у телешоу) і командної гри (10j);
  - дошки з хмари на полі;
  - дошки з опитування (`poll`).

## Глобальні обмеження

- Рушій чистий: жодного годинника, усе від `now` і `rng`.
- **Анти-ціль «відповідь раніше розкриття».**
  - `PublicQuestion.survey` — лише `answers` і `rows` (кількість).
  - `SurveyInfo` для сцени й телефонів до `reveal` — закриті рядки без `text`, `popularity`, `by`; на `reveal` — лише відкриті.
  - `reveal` сцени й телефонів для «100 до 1» — з `rows: []`.
  - Збіги (`rows`) у відповідях до розкриття не виходять на сцену й телефони.
  - Тести задачі 4 закріплюють це через `JSON.stringify(view)`, e2e — через кадри сокета телефона й сцени (`socketFrames`).
- **Старі вікторини й бали не змінюються.** Наявні тести тексту, стіни, хмари, бафів, серій і сумарного часу лишаються зеленими без змін.
- Тексти інтерфейсу — лише в `apps/web/src/i18n.ts`, тексти довідки — лише в `apps/web/src/help/*.ts`.
- Телефон 375 px — без горизонтальної прокрутки, кнопки ≥ 44 px. Сцена 1280 × 720 — табло з 8 рядків без прокрутки.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом мають бути зелені `pnpm typecheck` і `pnpm vitest run --maxWorkers=2`. Якщо PGlite падає з браком пам'яті, запускати окремо:
  - `pnpm vitest run --maxWorkers=2 packages`;
  - `pnpm vitest run --maxWorkers=1 apps/server`;
  - `pnpm vitest run --maxWorkers=2 apps/web`.
- Наскрізні тести: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts`. Кадри лягають в `apps/server/e2e/artifacts/shots`, префікс кадрів 10e — `p10e-`.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать. Живі ігри пуш не обриває: `READABLE_STATE_VERSIONS` містить 4.

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/{quiz.ts,answer.ts}`, `quiz.test.ts` | `survey`, ліміти, `surveyOrder`, `surveyShare`, коди, місця | 1 |
| `apps/web/src/{format.ts,guide-text.ts,i18n.ts}`, `help/questions.ts`, `editor/draft.ts`, `screens/AnswerInput.tsx`, `editor/QuestionEditor.tsx` + `format.test.ts`, `draft.test.ts` | прохід typecheck | 1 |
| `packages/engine/src/{survey.ts(новий),check.ts,game.ts,index.ts}`, `testing/fixtures.ts`, новий `game.survey.test.ts`, `check.test.ts` | перевірка, бали, бафи, поле | 2 |
| `packages/engine/src/{survey.ts,game.ts,restore.ts}`, `game.survey.test.ts`, `restore.test.ts` | дошка з хмари, пропуск, покрокове розкриття, версія 5 | 3 |
| `packages/shared/src/views.ts`, `packages/engine/src/views.ts`, новий `views.survey.test.ts`, фабрики зрізів у тестах вебу | `PublicSurvey`, `SurveyInfo`, `PlayerSurvey`, `surveySkipped`, приховування | 4 |
| `packages/shared/src/{events.ts,history.ts}`, `apps/server/src/{rooms/manager.ts,socket.ts,recorder.ts,history.ts,db/schema.ts}` + тести | `host:survey-all`, `PlayRef.surveyRows`, історія | 5 |
| `apps/server/scripts/{demo-quiz.ts,demo-quiz.test.ts}` | демо | 6 |
| `apps/web/src/screens/{SurveyInput,SurveyBoard}.tsx` (нові), `AnswerInput.tsx`, `PlayerScreen.tsx`, `i18n.ts`, `styles.css` + тести | телефон | 7 |
| `apps/web/src/screens/{StageScreen,HostScreen}.tsx`, `pages/GameHistory.tsx`, `i18n.ts`, `styles.css` + тести | сцена, пульт, історія | 8 |
| `apps/web/src/editor/{SurveyEditor(новий),QuestionEditor,BoardEditor}.tsx`, `draft.ts`, `draft-storage.ts`, `i18n.ts`, `styles.css` + тести | редактор | 9 |
| `apps/web/src/help/{questions,powers,cells,rounds,settings}.ts`, `host-help.test.ts`, `HostScreen.tsx` | довідка й «ⓘ» | 10 |
| `apps/server/e2e/full-game.e2e.ts` | сценарій 10e з кадрами `p10e-` | 11 |

## Порядок збирання

- 1 → 2 → 3 → 4 → 5 → 6.
- 7 — після 4 і 5. 8 — після 7 (`SurveyBoard`). 9 — після 1 (від рушія й зрізів не залежить), можна паралельно з 7–8.
- 10 — після 8 і 9. 11 — остання.
- **Навмисні зміни наявних очікувань** (лише такі):
  - `restore.test.ts`:
    - `GAME_STATE_VERSION` 5, новий `KEYS[5]`, `STATE_SHAPE.SurveyPlay`;
    - `READABLE_STATE_VERSIONS` `[2, 3, 4, 5]`;
    - `KEYS[1..4]` без змін;
  - фабрики `PublicQuestion` / `BaseView` / `StageView` / `HostView` / `PlayerView['me']` у тестах вебу отримують `survey: null` (і `me.survey: null`, `surveySkipped: []`);
  - тест у `quiz.test.ts`, що звіряє `QUESTION_TYPES` буквально, отримує `'survey'`;
  - тести `questionTypesFor` у `draft.test.ts`, якщо звіряють перелік буквально;
  - `host-help.test.ts`: тест 10d `question.wordcloud.tip не містить «100 до 1»` перевертається (тепер містить).
  - Якщо падає інше, рецензент розбирає причину, а не правку очікування.

## На що дивитися рецензентові

1. **Нічого не витікає.**
   - Рядки дошки й збіги не потрапляють на телефон чи сцену до розкриття. На розкритті сцена отримує лише відкриті рядки. `reveal` сцени — без `rows`.
   - Тести: задача 4 (`survey rows never reach phones or the stage before the reveal`, `the stage gets only the opened rows`), задача 11 — кадри сокета.
2. **Бали.**
   - Сума популярності влучених різних рядків; повтор не рахується; не більше ціни.
   - Половина ціни — «правильно»; мінус лише за 0 і лише тому, хто відповів; без бонусу за швидкість; множник раунду; поле.
   - Тести: задача 2.
3. **Дошка з хмари.**
   - Сховані слова відкинуто; до 8 рядків; популярність від тих, хто писав.
   - Запасні рядки, якщо хмара порожня; пропуск без запасних (без запису в журналі, з попередженням ведучому); дошка в стані й історії.
   - Тести: задача 3, задача 5.
4. **Розкриття.** `host:next` відкриває рядки знизу, далі йде як звичайно; «Відкрити всі»; після `reveal` усе відкрито. Тести: задача 3, 4.
5. **Формат стану.** `GAME_STATE_VERSION` = 5, `KEYS[5]` з `Play.survey`, `SurveyPlay`; представник з дошкою з хмари проходить JSON; `READABLE_STATE_VERSIONS` `[2, 3, 4, 5]`.
6. **Старе не змінилося.** Тести тексту, стіни, хмари, бафів, серій і сумарного часу — без змін.
7. **Довідка.** Запис `question.survey` правдивий щодо рушія й чисел з `LIMITS`. Бафи, клітинки, раунди, бонус за швидкість і хмара згадують «100 до 1». Тести: задача 10.

---

### Задача 1. Shared: тип `survey`, відповідь, ліміти, чисті функції, коди й місця; прохід typecheck у вебі

**Files:**
- Modify: `packages/shared/src/quiz.ts`, `packages/shared/src/answer.ts`
- Test: `packages/shared/src/quiz.test.ts`
- Modify (прохід typecheck): `apps/web/src/format.ts`, `apps/web/src/guide-text.ts`, `apps/web/src/i18n.ts`, `apps/web/src/help/questions.ts`, `apps/web/src/editor/draft.ts`, `apps/web/src/screens/AnswerInput.tsx`, `apps/web/src/editor/QuestionEditor.tsx`
- Test: `apps/web/src/format.test.ts`, `apps/web/src/editor/draft.test.ts`

**Interfaces:**
- Produces (`quiz.ts`):
  ```ts
  // У LIMITS:
  /** «100 до 1»: рядків дошки, символів у рядку, популярність (людей зі 100), відповідей гравця, символів у відповіді, типовий час (с). */
  minSurveyRows: 4,
  maxSurveyRows: 8,
  surveyRowText: 40,
  surveyTotal: 100,
  maxSurveyAnswers: 5,
  defaultSurveyAnswers: 3,
  surveyAnswer: 40,
  defaultSurveyTime: 45,

  const surveyRow = z.object({
    id: z.string().min(1).refine(isStorable, UNSTORABLE),
    /** Відповідь на табло; вона ж перше прийнятне написання. */
    text: z.string().trim().min(1).max(LIMITS.surveyRowText).refine(isStorable, UNSTORABLE),
    /** Людей зі 100, що дали цю відповідь. */
    popularity: z.number().int().min(1).max(LIMITS.surveyTotal),
    /** Додаткові написання (без text). */
    accepted: z.array(z.string().trim().min(1).max(LIMITS.answerText).refine(isStorable, UNSTORABLE)).max(LIMITS.maxAccepted - 1),
  });

  // Гілка questionSchema:
  z.object({
    ...base,
    type: z.literal('survey'),
    /** Дошка ведучого; з cloudId — запасні рядки на випадок порожньої хмари (можна []). */
    rows: z.array(surveyRow).max(LIMITS.maxSurveyRows),
    /** Скільки відповідей вводить гравець. */
    answers: z.number().int().min(1).max(LIMITS.maxSurveyAnswers),
    /** Дошка з відповідей на «хмару слів» з цим id, що звучала раніше в грі. */
    cloudId: z.string().min(1).refine(isStorable, UNSTORABLE).optional(),
  }),

  export const QUESTION_TYPES = [..., 'wall', 'poll', 'wordcloud', 'survey'] as const;
  // SIMPLE_TYPES, REVEAL_TYPES, UNSCORED_TYPES — без змін.

  export type SurveyRow = Extract<Question, { type: 'survey' }>['rows'][number];
  /** Рядки за місцем на табло: популярність спаданням, за рівності — порядок дошки. */
  export function surveyOrder<T extends { popularity: number }>(rows: readonly T[]): T[];
  /** Частка ціни: Σ популярності різних влучених рядків / 100, не більше 1; невідомі id і null пропускаються. */
  export function surveyShare(rows: readonly { id: string; popularity: number }[], hits: readonly (string | null)[]): number;
  // proximityPartial: 'slider' | 'pin' | 'wall' | 'survey'; коментар: «… (повзунок, точка, стіна, «100 до 1»)».
  ```
  - `superRefine` запитання:
    - `ids` для `duplicate_ids`: `survey` — id рядків;
    - `survey_rows`: без `cloudId` — `rows.length < minSurveyRows`; з `cloudId` — `rows.length` ∉ {0} ∪ [4, 8];
    - `survey_total`: `Σ popularity > LIMITS.surveyTotal`;
    - `survey_duplicate`: повтори `cloudKey` серед `[row.text, ...row.accepted]` усіх рядків.
  - `superRefine` вікторини (поруч із `wall_place`, той самий вигляд):
    - `survey_place` — `survey` у бліці, фіналі або на клітинці, що не звичайна з телефона;
    - `survey_cloud_place` — `survey` з `cloudId` у раунді поля;
    - `survey_cloud` — для кожного `survey` з `cloudId` у класиці: шукати `wordcloud` з таким id у раундах `0…r − 1` (будь-де) або в цьому ж раунді з індексом `< i`. Немає (немає такого id, не хмара, стоїть пізніше) → код;
    - запасні: наявний `spare_type` уже відкидає `survey` — лише тест.
- Produces (`answer.ts`):
  ```ts
  z.object({
    type: z.literal('survey'),
    values: z.array(z.string().max(LIMITS.surveyAnswer).refine(isStorable, UNSTORABLE)).min(1).max(LIMITS.maxSurveyAnswers),
  }),

  /** Відповідь «100 до 1» після перевірки: рушій чистить values і додає збіги; з телефона rows не приходить. */
  export interface SurveyAnswer {
    type: 'survey';
    values: string[];
    /** Id влученого рядка для кожного значення; null — мимо або рядок уже влучено. */
    rows: (string | null)[];
  }
  export type Answer = SubmittedAnswer | ChainAnswer | SortAnswer | WallAnswer | SurveyAnswer;

  /** Збіги перевіреної відповіді «100 до 1»; null — не survey або ще не перевірена (без rows). */
  export function surveyHitsOf(answer: Answer | null): (string | null)[] | null;
  ```
- Веб (прохід typecheck):
  - `i18n.ts`:
    - `type_survey: '100 до 1'`, `typeShort_survey: '100 до 1'`;
    - `typeHow_survey: 'Вгадай найпопулярніші відповіді опитування: напиши до {n} варіантів. Що популярніша відповідь, то більше балів.'` (якщо `typeHow_*` без параметрів — «до кількох варіантів»; звірити з `typeTip`);
    - історія: `surveyCorrect: '{rows}'` (рядки «Текст (32)» через «; »), `surveyHit: '{value} ✓'`, `surveyMiss: '{value} ✗'`;
  - `guide-text.ts`: `TYPE_ICONS.survey = '💯'` (якщо емодзі не пасують до наявних значків — `'100'`);
  - `format.ts`:
    - `correctText`: `survey` → `surveyOrder(rows).map((r) => \`${r.text} (${r.popularity})\`).join('; ')`;
    - `answerText`: `survey` → з `surveyHitsOf` — `values.map((v, i) => hits[i] ? t('surveyHit', …) : t('surveyMiss', …)).join(', ')`; без збігів — `values.join(', ')`;
  - `help/questions.ts`: повний запис `survey` (тексти — задача 10, розділ «Interfaces»; тут вписати повністю, задача 10 звіряє й оновлює пов'язані записи);
  - `draft.ts`:
    - `questionTypesFor`: бліц і фінал — без `survey`; поле і класика — з ним. Оновити коментар;
    - `build('survey')`:
      ```ts
      { ...common, type, timeLimit: LIMITS.defaultSurveyTime, answers: LIMITS.defaultSurveyAnswers,
        rows: Array.from({ length: 5 }, () => ({ id: newId(), text: '', popularity: 0, accepted: [] })) }
      ```
      `popularity: 0` у чернетці — редактор вимагає заповнення (задача 9); схему проходить лише заповнена;
    - `changeType`:
      - з `text` у `survey` — перше написання стає першим рядком;
      - `reveal` прибирається;
      - `cloudId` прибирається, якщо тип не `survey`;
    - `duplicateQuestion` — нові id рядків;
  - `AnswerInput.tsx`: `case 'survey': return null; // задача 7`;
  - `QuestionEditor.tsx` (`Body`): `case 'survey': return null; // задача 9`.

- [ ] **Step 1: Write the failing tests** у `packages/shared/src/quiz.test.ts`:
  ```ts
  describe('survey (10e)', () => {
    const row = (id: string, text: string, popularity: number, accepted: string[] = []) => ({ id, text, popularity, accepted });
    const surveyQ = { id: 's1', type: 'survey', text: 'Назвіть фрукт, який люблять діти', imageUrl: null, video: null, timeLimit: 45, points: 1000, answers: 3,
      rows: [row('a', 'Яблуко', 32, ['яблучко']), row('b', 'Банан', 25), row('c', 'Полуниця', 15), row('d', 'Кавун', 10), row('e', 'Груша', 8)] } as const;
    it('a survey is a scored, not simple question type with 4–8 rows', () => {
      expect(QUESTION_TYPES).toContain('survey');
      expect(SIMPLE_TYPES).not.toContain('survey');
      expect(isUnscored(surveyQ)).toBe(false);
      expect(valid(questionSchema, surveyQ)).toBe(true);
      expect(issues({ ...surveyQ, rows: surveyQ.rows.slice(0, 3) })).toContain('survey_rows');
      expect(valid(questionSchema, { ...surveyQ, rows: [...surveyQ.rows, ...['f', 'g', 'h', 'i'].map((id) => row(id, id, 1))] })).toBe(false);
      expect(valid(questionSchema, { ...surveyQ, answers: 0 })).toBe(false);
      expect(valid(questionSchema, { ...surveyQ, answers: 6 })).toBe(false);
    });
    it('checks the total, duplicate spellings, popularity and ids', () => {
      expect(issues({ ...surveyQ, rows: [row('a', 'Яблуко', 60), ...surveyQ.rows.slice(1)] })).toContain('survey_total');
      expect(issues({ ...surveyQ, rows: [surveyQ.rows[0], row('b', 'Банан', 25, [' ЯБЛУЧКО ']), ...surveyQ.rows.slice(2)] })).toContain('survey_duplicate');
      expect(valid(questionSchema, { ...surveyQ, rows: [row('a', 'Яблуко', 0), ...surveyQ.rows.slice(1)] })).toBe(false);
      expect(issues({ ...surveyQ, rows: [row('b', 'Яблуко', 32), ...surveyQ.rows.slice(1)] })).toContain('duplicate_ids');
    });
    it('a cloud board may have no rows or 4–8 spare rows', () => {
      expect(valid(questionSchema, { ...surveyQ, rows: [], cloudId: 'k1' })).toBe(true);
      expect(valid(questionSchema, { ...surveyQ, cloudId: 'k1' })).toBe(true);
      expect(issues({ ...surveyQ, rows: surveyQ.rows.slice(0, 2), cloudId: 'k1' })).toContain('survey_rows');
    });
    it('surveyOrder and surveyShare', () => {
      expect(surveyOrder([row('x', 'X', 5), row('y', 'Y', 9), row('z', 'Z', 5)]).map((r) => r.id)).toEqual(['y', 'x', 'z']);
      expect(surveyShare(surveyQ.rows, ['a', 'b', null])).toBeCloseTo(0.57);
      expect(surveyShare(surveyQ.rows, ['a', 'a'])).toBeCloseTo(0.32);
      expect(surveyShare([row('a', 'A', 100), row('b', 'B', 50)], ['a', 'b'])).toBe(1);
      expect(surveyShare(surveyQ.rows, ['zzz'])).toBe(0);
      expect(proximityPartial(surveyQ)).toBe(true);
    });
  });

  describe('where surveys live (10e)', () => {
    // survey у класиці й на звичайній клітинці поля з телефона — OK; у бліці, фіналі, на бліц- й усній клітинці → 'survey_place'
    // survey з cloudId: хмара раніше в тому ж класичному раунді — OK; хмара в попередньому раунді — OK;
    //   хмара пізніше / cloudId на не-хмару / неіснуючий id → 'survey_cloud'; survey з cloudId на клітинці поля → 'survey_cloud_place'
    // quiz.spares з survey → 'spare_type'
  });
  ```
  - Тести `answerSchema`:
    - `{ type: 'survey', values: ['Яблуко', ''] }` проходить;
    - `values: []`, 6 значень і значення на 41 символ — ні.
  - `surveyHitsOf({ type: 'survey', values: ['a'] })` → `null`; з `rows: ['x']` → `['x']`; `{ type: 'text', value: 'a' }` → `null`.
  - Повні тіла `where …` писати за зразком тестів `wall_place` 10d. Помічники `valid`, `issues` — наявні.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared` → FAIL (немає експортів).
- [ ] **Step 3: Implement** схему, функції й коди за інтерфейсом. `surveyShare` бере кожен id лише раз (`Set`).
- [ ] **Step 4: Прохід typecheck у вебі.** Виконати `pnpm typecheck` і закрити кожну помилку змінами з інтерфейсу. Тести:
  - `format.test.ts`:
    - `correctText(surveyQ)` → `'Яблуко (32); Банан (25); Полуниця (15); Кавун (10); Груша (8)'`;
    - `answerText({ type: 'survey', values: ['яблучко', 'ананас'], rows: ['a', null] }, surveyQ)` → `'яблучко ✓, ананас ✗'`;
    - без `rows` → `'яблучко, ананас'`;
  - `draft.test.ts`:
    - `newQuestion('survey')` після заповнення 4 рядків (тексти й популярність) проходить `questionSchema`, `timeLimit` 45, `answers` 3;
    - `questionTypesFor('board')` і `questionTypesFor('classic')` мають `survey`; `blitz` і `final` — ні;
    - `changeType` text («Дніпро») → survey: перший рядок «Дніпро».
- [ ] **Step 5: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 6: Commit**
  ```bash
  git add packages/shared apps/web/src
  git commit -m "feat(shared): survey («100 до 1») question type with a host board or a board from an earlier word cloud, survey answers, limits, board order and share, placement and cloud reference rules"
  ```

### Задача 2. Рушій: перевірка «100 до 1» — збіги, бали за популярністю, половина ціни правильна, без бонусу швидкості, поле, бафи

**Files:**
- Create: `packages/engine/src/survey.ts`
- Modify: `packages/engine/src/check.ts`, `packages/engine/src/game.ts`, `packages/engine/src/index.ts`, `packages/engine/src/testing/fixtures.ts`
- Test: новий `packages/engine/src/game.survey.test.ts`; `check.test.ts`

**Interfaces:**
- Produces (`check.ts`):
  ```ts
  /** Збіги значень з рядками дошки: id першого рядка, де textMatches([text, ...accepted], value); рядок, уже влучений раніше, — null. */
  export function surveyHits(rows: readonly SurveyRow[], values: readonly string[]): (string | null)[];
  ```
  - `checkAnswer` для `survey`: `const share = surveyShare(question.rows, surveyHits(question.rows, answer.values)); return { accepted: share >= PROXIMITY_CORRECT_SHARE - EPSILON, accuracy: share };` (через `shareVerdict` у `verdictOf`, бо `proximityPartial`).
  - Коментар `verdictOf` / `proximityPartial` доповнити «100 до 1».
- Produces (`survey.ts`):
  ```ts
  /**
   * Чистить відповідь «100 до 1»: обрізано, пробіли зведено, без порожніх і повторів за normalizeText, не більше question.answers;
   * rows — surveyHits. Нічого не лишилося — values [].
   */
  export function scoreSurvey(question: Extract<Question, { type: 'survey' }>, answer: { values: readonly string[] }): SurveyAnswer;
  ```
- Changes (`game.ts`):
  - `submitAnswer`: після перевірки `isUnscored` і до гілок бліцу, поля й фіналу:
    ```ts
    const asked0 = questionFor(state, play, playerId);
    if (asked0.type === 'survey') {
      if (answer.type !== 'survey') return fail('type_mismatch');
      answer = scoreSurvey(asked0, answer);
      if (answer.values.length === 0) return fail('type_mismatch');
    }
    ```
    Так і клітинка поля (`submitBoardAnswer` → `board.answer`) отримує вже перевірену відповідь.
  - Класика `submitAnswer`, бонус за швидкість: `round.speedBonus && limit !== null && !paysForTime(asked) && asked.type !== 'survey'`. Коментар: «100 до 1»: ціна вже спадає з популярністю, швидкість набору — не знання.
  - `acceptAnswer`: `round.check === 'manual' && asked.type !== 'survey'` → `wrong_phase`. Тобто «100 до 1» ведучий приймає і за ручної перевірки: дошка однозначна. `asked` порахувати до цієї перевірки.
  - `override`: `type === 'survey'` → `fail('wrong_phase')` поруч зі стіною (покриває й `overrideBoard`). Коментар доповнити.
- Produces (`testing/fixtures.ts`):
  ```ts
  const row = (id: string, text: string, popularity: number, accepted: string[] = []) => ({ id, text, popularity, accepted });
  export const survey = { ...base, id: 'q17', type: 'survey', text: 'Назвіть фрукт, який люблять діти', timeLimit: 45, points: 1000, answers: 3,
    rows: [row('sa', 'Яблуко', 32, ['яблучко']), row('sb', 'Банан', 25), row('sc', 'Полуниця', 15), row('sd', 'Кавун', 10), row('se', 'Груша', 8)] } satisfies Question;
  ```

- [ ] **Step 1: Write the failing tests.**
  - `check.test.ts`:
    - `surveyHits(survey.rows, [' ЯБЛУЧКО ', 'Яблуко', 'банан', 'ананас'])` → `['sa', null, 'sb', null]`;
    - `checkAnswer(survey, { type: 'survey', values: ['Яблуко', 'Банан'] })` → `{ accepted: true, accuracy: 0.57 }` (≈);
    - `['Кавун']` → `accepted: false`, `accuracy` 0,1;
    - `[]` → `accuracy 0`.
  - `game.survey.test.ts`. Класика `speedBonus: true`, `[survey]`, Анна p1, Богдан p2, `startRound(..., 0)`:
    ```ts
    it('each matched row pays price × popularity / 100; half the price is correct; no speed bonus', () => {
      let s = openClassic([survey]);
      s = must(submitAnswer(s, 'p1', { type: 'survey', values: ['яблучко', 'Банан', 'ананас'] }, 1000));
      expect(recordOf(s, 0, 'p1')).toMatchObject({
        points: 570, accepted: true, grade: 'correct',
        answer: { type: 'survey', values: ['яблучко', 'Банан', 'ананас'], rows: ['sa', 'sb', null] },
      });
      s = must(submitAnswer(s, 'p2', { type: 'survey', values: ['Яблуко', ' яблуко ', 'Кавун'] }, 44_000));
      expect(recordOf(s, 0, 'p2')).toMatchObject({ points: 420, accepted: false, grade: 'partial', answer: { values: ['Яблуко', 'Кавун'], rows: ['sa', 'sd'] } });
    });
    ```
    Інші тести файлу:
    - `the same row twice counts once` («Яблуко», «яблучко» → 320, `rows: ['sa', null]`);
    - `only the first N answers count` (`answers: 2`, три значення → третє відкинуто, `values.length === 2`);
    - `points never exceed the price` (запитання з рядками 100 і 50: обидва влучені → 1000, `accuracy 1`);
    - `empty answer — type_mismatch; a text answer — type_mismatch; one answer only — already_answered; time over — time_over`;
    - `the minus penalty only for zero points` (правила `penalty: 'minus'`: «ананас» → −1000; «Кавун» → 100, без мінуса; p2 без відповіді — запису немає);
    - `the round multiplier applies` (×2, «Яблуко», «Банан» → 1140);
    - `streak: a correct survey continues it, a partial breaks it` (правила `streak: { length: 2, … }`);
    - `override refuses a survey` (`wrong_phase`);
    - `buffs: double, time, hint and shield fit; fifty, retry and audience do not` (`buffBlock` → `null` для `double`, `time`, `hint`; `shield` — `null` за `penalty: 'minus'`; `fifty`, `retry`, `audience` → `'unfit_type'`);
    - `double doubles the survey points` (баф `double`, 570 → 1140);
    - **поле, клітинка з телефона** (`boardRound` з клітинкою-survey, позначка ×2, вибравший p1):
      - `only the chooser answers` (p2 → `not_your_turn`);
      - `accept reveals with board points` (відповідь «Яблуко», «Банан» → `acceptAnswer` → етап `reveal`, бали `round(1000 × 0.57 × 2)` = 1140);
      - `a manual-check board still accepts a survey by its board` (`check: 'manual'` → `acceptAnswer` проходить; `override` → `wrong_phase`);
      - `the waiting board answer already carries the hits` (`play.board.answer.rows` = `['sa', 'sb']`).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine` → FAIL.
- [ ] **Step 3: Implement** за інтерфейсом. `surveyHits` живе в `check.ts` поруч із `textMatches`, щоб `survey.ts` (імпортує `game.ts`) не замикав коло з `check.ts`.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS (наявні тести тексту, бафів і серій без змін).
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine
  git commit -m "feat(engine): survey answers match board rows like text answers, each row once, pay price × popularity / 100 capped at the price, half the price counts as correct, no speed bonus; board cells accept surveys even with manual checking; buffs double, time, shield, hint and swap fit"
  ```

### Задача 3. Рушій: дошка з хмари, пропуск без дошки, покрокове розкриття; `GAME_STATE_VERSION` 5

**Files:**
- Modify: `packages/engine/src/survey.ts`, `packages/engine/src/game.ts`, `packages/engine/src/restore.ts`, `packages/engine/src/index.ts`, `packages/engine/src/testing/fixtures.ts`
- Test: `packages/engine/src/game.survey.test.ts`, `packages/engine/src/restore.test.ts`

**Interfaces:**
- Changes (`game.ts`):
  ```ts
  // Play:
  /** «100 до 1»: звідки дошка й скільки рядків відкрито на розкритті; збудована дошка — у question.rows (10e). */
  survey?: SurveyPlay;

  export interface SurveyPlay {
    /** cloud — дошка з хмари слів; host — дошка ведучого (зокрема запасна, коли хмара порожня). */
    source: 'host' | 'cloud';
    /** Скільки рядків відкрито на сцені знизу вгору (етап reveal). */
    shown: number;
  }
  ```
  - `openQuestion`: для `question.type === 'survey'` — `const built = surveyBoard(state, question)`. Запис журналу: `question: { ...question, rows: built.rows }`, `survey: { source: built.source, shown: 0 }`. Сюди `openQuestion` потрапляє лише з дошкою: класика відсіяла пропуск у `nextQuestion`, на полі дошка завжди ведучого. Якщо все ж `null` (захист) — відкрити з `question.rows`, `source: 'host'`.
  - `nextQuestion`: `round.questions.find((q) => !played.has(q.id) && surveyBoard(state, q) !== null)`; для не-survey `surveyBoard` не викликається (помічник `playable(state, q)`).
  - `next`, гілка `case 'reveal'`, найпершою:
    ```ts
    const surveyPlay = surveyPlayOf(state);
    if (surveyPlay !== null && surveyPlay.survey.shown < surveyPlay.question.rows.length) return ok(stepSurvey(state));
    ```
- Produces (`survey.ts`):
  ```ts
  /**
   * Дошка для відкриття: з хмари cloudId (без схованих слів, до LIMITS.maxSurveyRows, популярність max(1, round(100 × count / voters)),
   * id 'cloud-1'…); хмари немає в журналі чи вона порожня — рядки ведучого, якщо їх ≥ minSurveyRows; інакше null (запитання пропускається).
   * Без cloudId — рядки ведучого.
   */
  export function surveyBoard(state: GameState, question: Question): { rows: SurveyRow[]; source: 'host' | 'cloud' } | null;
  /** Поточне запитання «100 до 1» з його грою; null поза ним. */
  export function surveyPlayOf(state: GameState): (Play & { survey: SurveyPlay; question: Extract<Question, { type: 'survey' }> }) | null;
  /** Відкриває ще один рядок знизу (етап reveal). */
  export function stepSurvey(state: GameState): GameState;
  /** «Відкрити всі»: усі рядки на етапі reveal. Помилки: wrong_phase — не reveal або не «100 до 1»; paused. */
  export function revealSurveyAll(state: GameState): Result;
  /**
   * «100 до 1» поточного класичного раунду, які пропущено або буде пропущено: незіграні, surveyBoard === null,
   * а хмара вже усталена (її запис не поточний, або етап не question/locked/reveal, або її раунд минув). Порядок раунду.
   */
  export function skippedSurveys(state: GameState): Question[];
  /** Скільки рядків видно на сцені: на reveal — shown, після reveal (leaderboard, round_end, finished) — усі. */
  export function surveyShown(state: GameState, play: Play): number;
  ```
- Changes (`restore.ts`):
  - `GAME_STATE_VERSION = 5`; коментар `5 — 10e: Play.survey (джерело дошки «100 до 1» і скільки рядків відкрито).`;
  - `READABLE_STATE_VERSIONS = [2, 3, 4, GAME_STATE_VERSION]`, коментар: 4 → 5 лише додала необов'язковий `Play.survey`, а стан версій 2–4 не може містити «100 до 1».
- Produces (`testing/fixtures.ts`):
  ```ts
  /** «100 до 1» з хмари cloud (q16), без запасних рядків. */
  export const surveyCloud = { ...base, id: 'q18', type: 'survey', text: 'Що ви назвали про Київ?', timeLimit: 45, points: 1000, answers: 2, rows: [], cloudId: cloud.id } satisfies Question;
  ```

- [ ] **Step 1: Write the failing tests** у `game.survey.test.ts`. Класика `[cloud, surveyCloud]`, Анна p1, Богдан p2, Віра p3:
  ```ts
  it('builds the board from the cloud: hidden words out, popularity from those who wrote', () => {
    let s = openClassic([cloud, surveyCloud]);
    s = answerAll(s, {
      p1: { type: 'wordcloud', words: ['Каштани', 'Дніпро', 'Лайка'] },
      p2: { type: 'wordcloud', words: ['каштани', 'Лавра'] },
      p3: { type: 'wordcloud', words: ['КАШТАНИ', 'Дніпро'] },
    });
    s = must(hideCloudWord(s, 'лайка', true));
    s = toNext(s); // reveal → наступне запитання
    const play = s.plays[1];
    expect(play.survey).toEqual({ source: 'cloud', shown: 0 });
    expect(play.question.type === 'survey' && play.question.rows).toEqual([
      { id: 'cloud-1', text: 'Каштани', popularity: 100, accepted: [] },
      { id: 'cloud-2', text: 'Дніпро', popularity: 67, accepted: [] },
      { id: 'cloud-3', text: 'Лавра', popularity: 33, accepted: [] },
    ]);
    s = must(submitAnswer(s, 'p1', { type: 'survey', values: ['каштани', 'дніпро'] }, at(s, 1000)));
    expect(recordOf(s, 1, 'p1')?.points).toBe(1000); // 167 % → не більше ціни
  });
  ```
  Інші тести:
  - `at most 8 rows: the most common words first` (12 різних слів → 8 рядків у порядку `cloudTally`);
  - `an empty cloud falls back to the host's spare rows` (`surveyCloud` з 4 рядками, у хмарі ніхто не написав → `source: 'host'`, рядки ведучого);
  - `an empty cloud without spare rows skips the survey` (`[cloud, surveyCloud, single]`: після хмари без слів `next` відкриває `single`; у журналі немає `q18`; `skippedSurveys(s)` = `[surveyCloud]`);
  - `a cloud whose words are all hidden counts as empty`;
  - `a cloud never played (round ended early) skips the survey in the next round` (раунд 1 `[single, cloud]` — `endRound` після `single`; раунд 2 `[surveyCloud, single]` → відкривається `single`);
  - `skippedSurveys stays empty while the cloud is still current` (на етапі `reveal` хмари без слів — `[]`; після `next` — `[surveyCloud]`);
  - `reveal opens rows one by one bottom-up, then next goes on` (`[survey, single]`, правила `leaderboard: 'end'`: `lock` → `next` (reveal, `shown 0`) → `next` ×5 → `shown` 1…5, етап `reveal`; ще `next` → відкрито `single`);
  - `revealSurveyAll opens every row; wrong_phase outside a survey reveal` (на `question` → `wrong_phase`; на `reveal` → `shown 5`; потім `next` — одразу далі);
  - `surveyShown is everything after the reveal` (`end` посеред розкриття → `surveyShown` = 5);
  - **поле:** `a board survey steps rows after accept, then the board goes on` (після `acceptAnswer` — `reveal`, `next` відкриває рядки, далі — `leaderboard`/`board`);
  - `the board survey keeps the host rows` (`source: 'host'`).
  - `restore.test.ts`:
    - `KEYS[5]` = `KEYS[4]` з `Play: 'answers,blitz,board,buffs,chain,cloudHidden,clues,extraMs,final,overtime,question,roundIndex,sort,survey,wall'` і `SurveyPlay: 'shown,source'`;
    - `STATE_SHAPE.Play` + `'survey'`; `STATE_SHAPE.SurveyPlay = keysOf<SurveyPlay>()(['source', 'shown'], true)`;
    - `READABLE_STATE_VERSIONS` дорівнює `[2, 3, 4, 5]`;
    - у `representative()` — `Play` з `survey: { source: 'cloud', shown: 2 }` і збудованими рядками (можна вписати вручну, як `cloudHidden` у 10d).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine` → FAIL.
- [ ] **Step 3: Implement** за інтерфейсом.
  - `surveyBoard` бере **останній** запис журналу з `question.id === cloudId`. Гравців бере з `state.players` (вилучені не рахуються — як у `cloudVoters`).
  - `skippedSurveys` — лише для класичного поточного раунду; для поля — `[]` (там дошка завжди ведучого).
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS (наявні тести рушія без змін, крім `KEYS`/версії).
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine
  git commit -m "feat(engine): survey board from an earlier word cloud (hidden words out, top 8, popularity from writers) stored in the play, host spare rows for an empty cloud, skipped survey without a board, rows revealed one by one bottom-up by next or all at once; GAME_STATE_VERSION 5 (Play.survey)"
  ```

### Задача 4. Зрізи: табло без рядків до розкриття, відкриті рядки на розкритті, дошка пульта, власні збіги, пропущені

**Files:**
- Modify: `packages/shared/src/views.ts`, `packages/engine/src/views.ts`
- Test: новий `packages/engine/src/views.survey.test.ts`
- Modify (фабрики): тести вебу, що будують `PublicQuestion` / `StageView` / `HostView` / `PlayerView` вручну (`grep -rln "cloud: null" apps/web/src`)

**Interfaces:**
- Produces (`shared/views.ts`):
  ```ts
  /** «100 до 1» для всіх під час запитання: скільки відповідей можна ввести й скільки рядків на табло — без текстів. */
  export interface PublicSurvey {
    answers: number;
    rows: number;
  }
  // PublicQuestion:
  /** null для інших типів. */
  survey: PublicSurvey | null;

  export interface SurveyRowView {
    /** Місце на табло: 1 — найпопулярніший. */
    rank: number;
    /** Відкрито на сцені. */
    open: boolean;
    /** Для сцени й телефонів — лише відкриті рядки; пульт бачить усе. Інакше null. */
    text: string | null;
    popularity: number | null;
    /** Нікнейми тих, хто назвав рядок, у порядку гравців; null — як text. */
    by: string[] | null;
  }
  /** Табло «100 до 1». Сцена й телефони — з question, рядки закриті до reveal; пульт — уся дошка з question. */
  export interface SurveyInfo {
    source: 'host' | 'cloud';
    total: number;
    /** Скільки рядків відкрито знизу. */
    shown: number;
    /** За місцем (rank 1…total). */
    rows: SurveyRowView[];
  }
  // BaseView:
  /** null поза «100 до 1» (і на полі із заміною — там показано запасне). */
  survey: SurveyInfo | null;

  export interface PlayerSurveyLine {
    value: string;
    /** Місце влученого рядка; null — мимо. */
    rank: number | null;
    text: string | null;
    popularity: number | null;
  }
  // PlayerView['me']:
  /** Власні відповіді «100 до 1» зі збігами — лише на reveal і пізніше, для того, хто відповідав. Інакше null. */
  survey: { lines: PlayerSurveyLine[] } | null;

  // HostView:
  /** Тексти «100 до 1» поточного раунду, які пропущено (хмара без слів, запасних рядків немає). */
  surveySkipped: string[];
  ```
- Produces (`engine/views.ts`):
  - `publicQuestion`: `survey: question.type === 'survey' ? { answers: question.answers, rows: question.rows.length } : null`. `question` тут — `play.question` зі збудованою дошкою.
  - `surveyInfo(state, forHost)`:
    - лише коли показане запитання (`shownQuestion`) — це `play.question` типу `survey`;
    - рядки — `surveyOrder(question.rows)` з `rank`;
    - `open = rank > total − surveyShown(state, play)`, на етапах `question`/`locked` — `false`;
    - `by` — нікнейми гравців, у чиїх записах `surveyHitsOf(record.answer)` містить id рядка;
    - сцена й телефони: `text`/`popularity`/`by` лише для `open`;
    - пульт: завжди, `by` наживо з етапу `question`.
  - `base`:
    - `survey: surveyInfo(state, forHost)`;
    - `total: (раунд) − skippedSurveys(state).length` для класики.
  - `stageView` / `playerView`:
    - `reveal` для `survey` — `{ ...withoutHint(q), rows: [] }` (помічник `withoutSurveyRows`), на всіх етапах.
  - Помічник `publicAnswer(answer, revealed)`: для `survey` до розкриття — `{ type: 'survey', values }`. Застосувати до:
    - `me.answer`;
    - відповіді, що чекає на полі (`pending`);
    - будь-якого місця, де відповідь іде на сцену чи телефон. Перевірити `grep -n "answer" packages/engine/src/views.ts` у `boardInfo`, `spotlightOf`, `blitzInfo`, `chainInfo`.
  - `me.survey` — на `REVEALED` для гравця з записом: `values.map((value, i) => ({ value, ...рядок за rows[i] }))`.
  - `hostView`:
    - `surveySkipped: skippedSurveys(state).map((q) => q.text)`;
    - `correct` — зі збудованою дошкою (наявне `shownQuestion`).
  - `revealStats` без змін (`accepted` рахує записи).

- [ ] **Step 1: Write the failing tests** у `views.survey.test.ts` (класика `[survey]`, Анна p1, Богдан p2; окремо `[cloud, surveyCloud]`; поле з клітинкою-survey для одного тесту):
  ```ts
  it('survey rows never reach phones or the stage before the reveal', () => {
    let s = openClassic([survey]);
    s = must(submitAnswer(s, 'p1', { type: 'survey', values: ['Яблуко', 'ананас'] }, 1000));
    for (const t of [s, lock(s)]) {
      for (const view of [playerView(t, 'p1')!, playerView(t, 'p2')!, stageView(t)]) {
        const json = JSON.stringify(view);
        for (const text of ['Полуниця', 'Кавун', 'Груша', 'Банан', 'яблучко']) expect(json).not.toContain(text);
        expect(json).not.toMatch(/"popularity":\d|"sa"|"sb"/);
      }
    }
    expect(playerView(s, 'p1')!.question?.survey).toEqual({ answers: 3, rows: 5 });
    expect(playerView(s, 'p1')!.me.answer).toEqual({ type: 'survey', values: ['Яблуко', 'ананас'] });
    expect(stageView(s).survey?.rows.map((r) => [r.rank, r.open, r.text])).toEqual([[1, false, null], [2, false, null], [3, false, null], [4, false, null], [5, false, null]]);
    expect(hostView(s).survey?.rows[0]).toMatchObject({ rank: 1, text: 'Яблуко', popularity: 32, by: ['Анна'] });
  });
  ```
  Інші тести:
  - `the stage gets only the opened rows, bottom-up` (`reveal`, `next` ×2 → відкрито місця 5 і 4 з текстами «Груша», «Кавун» і `by`; `JSON.stringify(stageView)` не містить «Яблуко», «Банан», «Полуниця»; `reveal.rows` порожній; `revealSurveyAll` → усі відкриті);
  - `the phone sees its own lines on the reveal` (`me.survey.lines` = `[{ value: 'Яблуко', rank: 1, text: 'Яблуко', popularity: 32 }, { value: 'ананас', rank: null, text: null, popularity: null }]`; `me.result.points` 320; на `locked` `me.survey === null`);
  - `everything is open after the reveal` (етап `leaderboard` → усі `open`);
  - `a cloud board shows source cloud and the built rows to the host only` (`hostView.survey.source === 'cloud'`, `hostView.correct.rows` — збудовані; `stageView(s).reveal.rows` — `[]` на розкритті);
  - `the waiting board answer carries no hits to the stage or the chooser` (поле: після `submitAnswer` вибравшого до «Прийняти» жоден зріз сцени й телефонів не містить `"rows":[`);
  - `the host sees skipped surveys and the round total excludes them` (`[cloud, surveyCloud, single]`, хмара без слів → після `next` `hostView.surveySkipped` = `['Що ви назвали про Київ?']`, `base.total` = 2).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/views.survey.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Потім `pnpm typecheck`: фабрики зрізів у тестах вебу отримують `survey: null`, `me.survey: null`, `surveySkipped: []`. Компоненти вебу ще не читають нових полів.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages apps/web/src
  git commit -m "feat(engine): survey views — closed board with row count for phones and the stage, only opened rows with names on the reveal, the whole board with live names for the host, own matched lines on the phone after the reveal, no hits or rows before it; host sees skipped surveys"
  ```

### Задача 5. Сервер: `host:survey-all`, дошка з хмари в історії

**Files:**
- Modify: `packages/shared/src/events.ts`, `packages/shared/src/history.ts`, `apps/server/src/rooms/manager.ts`, `apps/server/src/socket.ts`, `apps/server/src/recorder.ts`, `apps/server/src/history.ts`, `apps/server/src/db/schema.ts`
- Test: `apps/server/src/socket.test.ts`, `apps/server/src/recorder.test.ts`, `apps/server/src/history.test.ts`, `apps/server/src/profiles.test.ts`, `apps/server/src/achievements.test.ts`

**Interfaces:**
- Produces (`events.ts`): `ClientToServerEvents` + `'host:survey-all': (ack: Ack) => void;` (як інші прості дії пульта).
- Produces (`manager.ts`): `HostAction` простих дій + `'survey-all'` → `revealSurveyAll(state)`.
- Produces (`socket.ts`): `SIMPLE_HOST_ACTIONS` + `'survey-all'`.
- Produces (`db/schema.ts`, `PlayRef`):
  ```ts
  /** «100 до 1» з дошкою з хмари: збудовані рядки (знімок вікторини їх не має). */
  surveyRows?: SurveyRow[];
  ```
- Changes (`recorder.ts`, `save` → `plays`): `...(play.survey?.source === 'cloud' && play.question.type === 'survey' ? { surveyRows: play.question.rows } : {})`.
- Changes (`shared/history.ts`, `GameQuestionResult`):
  ```ts
  /** «100 до 1»: дошку збудовано з хмари слів (question.rows — збудовані рядки). */
  surveyFromCloud?: true;
  ```
- Changes (`history.ts`, деталі ведучого): якщо `ref.surveyRows` є і запитання знімка — `survey`, то `question: { ...question, rows: ref.surveyRows }`, `surveyFromCloud: true`. `answered`/`accepted` рахуються як зараз; `playerGames`, профіль і досягнення — без змін (`accepted` з рушія).

- [ ] **Step 1: Write the failing tests.**
  - `socket.test.ts`:
    - `host:survey-all opens every row on the stage` (класика зі survey, гравець відповідає, `host:lock`, `host:next` → `reveal`; `host:survey-all` → наступний `state` сцени має всі `survey.rows[].open`; гравець → `FORBIDDEN`);
    - `no socket frame to a phone or the stage carries survey rows before the reveal` (зібрати кадри гравця й сцени до `reveal`: жоден не містить «Полуниця» і `"popularity":` з числом);
    - `host:next steps survey rows before moving on` (`host:next` ×5 на `reveal` лишає етап `reveal`, шостий — далі).
  - `recorder.test.ts`:
    - `a cloud survey stores its built rows in plays` (`plays[1].surveyRows` = рядки `cloud-1`…);
    - дошка ведучого — без `surveyRows`;
    - рядок відповіді — `attempt 0`, `payload` з `values` і `rows`.
  - `history.test.ts`, `describe('history: survey (10e)')`. Тест `history shows the survey board, cloud boards from plays, and answers with hits`:
    - класика `[cloud, surveyCloud, survey]`;
    - Оля — слова «каштани», «Дніпро»; на дошку з хмари «каштани» (1000, `accepted`); на дошку ведучого «Яблуко», «Банан» (570, `accepted`);
    - Петро — «каштани»; «Лавра» (мимо, 0); «Кавун» (100, не `accepted`);
    - деталі ведучого: `questions[1].question.rows` — збудовані, `surveyFromCloud: true`; `questions[2]` без `surveyFromCloud`; `responses` мають `payload.rows`;
    - `playerGames` Олі: `correct` 2, `answered` 2, `questionsPlayed` 2 (хмара не рахується).
  - `history.test.ts`: `a skipped survey is not a played question` (хмара без слів, `surveyCloud` без запасних, далі `single` → `questionsPlayed` гри 2, `playerGames.questionsPlayed` 1).
  - `profiles.test.ts`: та сама гра → точність Олі 100 %, Петра 0 %.
  - `achievements.test.ts`: `a survey with half the price continues the best streak; less than half breaks it`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server` → FAIL.
- [ ] **Step 3: Implement** за інтерфейсом.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared/src apps/server/src
  git commit -m "feat(server): host:survey-all opens every survey row; cloud-built survey boards are stored with the game plays and shown in the host's game history; skipped surveys are not played questions"
  ```

### Задача 6. Демо: «100 до 1» з дошкою ведучого й з хмари розминки

**Files:**
- Modify: `apps/server/scripts/demo-quiz.ts`, `apps/server/scripts/demo-quiz.test.ts`

**Interfaces:**
- Produces (`demo-quiz.ts`):
  ```ts
  /** «100 до 1» з дошкою ведучого: rows — [текст, популярність, додаткові написання?][]. */
  export const survey = (text: string, rows: [string, number, string[]?][], answers: number = LIMITS.defaultSurveyAnswers, points = 1000, time: number = LIMITS.defaultSurveyTime): Question;
  /** «100 до 1» з дошкою з хмари cloudQ (запитання, що стоїть раніше); spare — запасні рядки, як у survey. */
  export const surveyFromCloud = (text: string, cloudQ: Question, spare: [string, number, string[]?][] = [], answers = 2, points = 1000, time: number = LIMITS.defaultSurveyTime): Question;
  ```
  - Хмару розминки винести в константу перед `demoQuiz`: `const kyivCloud = cloud('Одним словом: з чим у вас асоціюється Київ?');`. Вона лишається на тому самому місці в `r-warmup`.
- Демо `demo` отримує:
  - у кінці `r-rules` — `surveyFromCloud('100 до 1 з ваших відповідей: з чим асоціюється Київ? Назвіть два слова', kyivCloud, …)` із запасними рядками:
    - `['Каштани', 30, ['каштан']]`;
    - `['Дніпро', 25]`;
    - `['Лавра', 15, ['Києво-Печерська лавра']]`;
    - `['Майдан', 10]`;
  - у кінці `r-x3` — `survey('100 до 1: назвіть фрукт, який люблять діти', …)`:
    - `['Яблуко', 32, ['яблучко']]`;
    - `['Банан', 25]`;
    - `['Полуниця', 15, ['суниця']]`;
    - `['Кавун', 10]`;
    - `['Груша', 8]`;
    - `['Мандарин', 6, ['мандаринка']]`;
  - опис демо згадує «100 до 1».
- Наявні запитання не змінюються. Уже засіяні вікторини не змінюються.

- [ ] **Step 1: Write the failing tests** у `demo-quiz.test.ts`:
  - `demo has a host-board survey in r-x3 and a survey from the warm-up word cloud in r-rules` (типи й місця; `cloudId` = id хмари з `r-warmup`; хмара стоїть раніше);
  - уся вікторина проходить `quizSchema`; кількість раундів і запитань у межах `LIMITS`;
  - `the helpers build valid questions` (`survey` з 4 рядками; сума популярності ≤ 100; `surveyFromCloud(…, [])` має `rows: []`).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server/scripts` → FAIL.
- [ ] **Step 3: Implement** помічники й запитання демо.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server/scripts
  git commit -m "feat(server): demo gets a «100 до 1» board in classic and a «100 до 1» built from the warm-up word cloud"
  ```

### Задача 7. Телефон: поля відповідей, екран після надсилання, власні збіги на розкритті; спільне табло

**Files:**
- Create: `apps/web/src/screens/SurveyInput.tsx`, `apps/web/src/screens/SurveyBoard.tsx`, тести `SurveyInput.test.tsx`, `SurveyBoard.test.tsx`
- Modify: `apps/web/src/screens/AnswerInput.tsx`, `apps/web/src/screens/PlayerScreen.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `AnswerInput.test.tsx`, `PlayerScreen.test.tsx`

**Interfaces:**
- Produces (`SurveyInput.tsx`):
  ```tsx
  export function SurveyInput(props: { answers: number; onSubmit: (a: Answer) => void; submitLabel?: string; autoFocus?: boolean }): JSX.Element;
  ```
  - `answers` полів одразу (`maxLength LIMITS.surveyAnswer`, `aria-label` `t('surveyAnswerN', { n })` «Відповідь {n}», `enterKeyHint="next"`). Enter переводить на наступне поле, на останньому — надсилає.
  - Повтори (за `cloudKey`) підсвічено з підписом `t('surveySame')` «Ця відповідь уже є».
  - Кнопка `t('submit')` вимкнена, доки всі поля порожні → `{ type: 'survey', values: обрізані непорожні }`.
  - Підказка над полями: `t('surveyHint', { n: answers })` «Назви до {n} найпопулярніших відповідей».
- Produces (`SurveyBoard.tsx`):
  ```tsx
  /**
   * Табло «100 до 1»: рядок на місце — номер, текст, популярність, нікнейми під текстом; закритий рядок — смуга з номером.
   * Нещодавно відкритий рядок перегортається (клас .is-flipping, без анімації за prefers-reduced-motion).
   * big — сцена; showClosed — пульт показує тексти закритих рядків блідими з позначкою «ще закрито».
   */
  export function SurveyBoard(props: { info: SurveyInfo; big?: boolean; showClosed?: boolean }): JSX.Element;
  ```
  - Рядки — `<li class="survey-row">` у порядку `rank`.
  - Закритий — `.is-closed` і `aria-label` `t('surveyClosedRow', { rank })` «Рядок {rank} закрито».
  - Відкритий без авторів — підпис `t('surveyNobody')` «Ніхто не назвав».
- Changes:
  - `AnswerInput.tsx`: `case 'survey'` → `question.survey === null ? null : <SurveyInput answers={question.survey.answers} … />`.
  - `PlayerScreen.tsx`:
    - після надсилання на `question`/`locked` — `t('surveySent')` «Відповіді надіслано» і список своїх `values`;
    - на розкритті — список `me.survey.lines`: влучені з місцем і популярністю (`t('surveyLineHit', { value, rank, popularity })` «{value} — місце {rank}, {popularity}»), мимо — `t('surveyLineMiss', { value })` «{value} — немає на табло»;
    - під списком наявний рядок результату з балами й `t('surveyBoardOnStage')` «Табло — на екрані»;
    - глядач на клітинці поля — `SurveyBoard` з `view.survey`.
  - `i18n.ts`: `surveyAnswerN`, `surveySame`, `surveyHint`, `surveySent`, `surveyLineHit`, `surveyLineMiss`, `surveyBoardOnStage`, `surveyClosedRow`, `surveyNobody`.
  - `styles.css`:
    - `.survey-input` (поля ≥ 44 px), `.survey-board`, `.survey-row` (сітка: номер · текст · популярність), `.survey-row.is-closed`, `.survey-row.is-flipping` (`rotateX`), `.survey-by` (нікнейми дрібно, перенос);
    - телефон 375 — без прокрутки вбік.

- [ ] **Step 1: Write the failing tests.**
  - `SurveyInput.test.tsx`:
    - три поля для `answers: 3`, «Відповісти» вимкнена;
    - «Яблуко» і « яблуко » → «Ця відповідь уже є»;
    - Enter у першому полі фокусує друге;
    - надсилання «Яблуко», «», «Банан» → `{ type: 'survey', values: ['Яблуко', 'Банан'] }`.
  - `SurveyBoard.test.tsx`:
    - 5 рядків, 2 відкриті знизу → три `.is-closed` без тексту, «Груша» і «Кавун» з популярністю;
    - відкритий без авторів → «Ніхто не назвав»;
    - `showClosed` показує тексти закритих рядків.
  - `AnswerInput.test.tsx`: `survey` з `answers: 2` → два поля й надсилання.
  - `PlayerScreen.test.tsx`:
    - після надсилання — «Відповіді надіслано» і свої відповіді;
    - розкриття — «Яблуко — місце 1, 32», «ананас — немає на табло», «Табло — на екрані»;
    - глядач на клітинці бачить табло.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web` → FAIL.
- [ ] **Step 3: Implement** за інтерфейсом (зразок `CloudInput.tsx`).
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): «100 до 1» on the phone — up to N answer fields with duplicate hints, sent answers, own lines with place and popularity on the reveal; shared survey board with closed rows and names"
  ```

### Задача 8. Сцена, пульт, історія: табло, покрокове відкриття, попередження про пропуск

**Files:**
- Modify: `apps/web/src/screens/StageScreen.tsx`, `apps/web/src/screens/HostScreen.tsx`, `apps/web/src/pages/GameHistory.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `StageScreen.test.tsx`, `HostScreen.test.tsx`, `History.test.tsx` (наявний тест сторінки історії)

**Interfaces:**
- Changes (`StageScreen.tsx`), `survey`:
  - на `question`/`locked`:
    - `SurveyBoard big` із закритими рядками;
    - `t('surveyOnPhone', { n })` «Пишіть до {n} відповідей на телефоні»;
    - лічильник `answeredOf`;
    - для дошки з хмари — підпис `t('surveyFromCloud')` «Дошка з ваших відповідей у хмарі слів»;
  - на `reveal` — `SurveyBoard big` з `view.survey`; щойно відкритий рядок (`shown` зріс) перегортається;
  - рядок «Правильна відповідь» (`correctText`) не показується;
  - на полі — те саме табло (на клітинці відповідає вибравший).
- Changes (`HostScreen.tsx`):
  - кнопки оцінки («Правильно» / «Неправильно» / «Частково») не показуються для `survey`; рядок відповіді — `answerText` з позначками;
  - панель `.host-survey`:
    - `SurveyBoard showClosed` з `view.survey` (уся дошка з авторами наживо);
    - підпис джерела (`surveyFromCloud` або `t('surveyFromHost')` «Ваша дошка»);
  - головна кнопка на `reveal` «100 до 1», поки `shown < total`, — `t('surveyNextRow', { shown: shown + 1, total })` «Відкрити рядок {shown} з {total}» (та сама `host:next`);
  - поруч `t('surveyAllRows')` «Відкрити всі» → `act('host:survey-all')`;
  - коли все відкрито, — звична «Далі»;
  - `view.surveySkipped` → попередження `.host-warning` з `t('surveySkipped', { text })` на кожен текст (видно на всіх етапах раунду).
- Changes (`GameHistory.tsx`), `survey`:
  - табло (`SurveyBoard`, усе відкрито) з `SurveyInfo`, складеним з `question.rows` і `responses` (`by` — нікнейми з `payload.rows`);
  - `surveyFromCloud` → підпис `t('surveyFromCloudHistory')` «Дошка з хмари слів»;
  - відповіді — `answerText` з позначками.
- `i18n.ts`: `surveyOnPhone`, `surveyFromCloud`, `surveyFromHost`, `surveyNextRow`, `surveyAllRows`, `surveySkipped`, `surveyFromCloudHistory`.
- `styles.css`: `.host-survey`, `.host-warning`, табло сцени `big` — 8 рядків уміщуються в 1280 × 720 (рядок ≈ 64 px, шрифт зменшується класом для 7–8 рядків).

- [ ] **Step 1: Write the failing tests.**
  - `StageScreen.test.tsx`:
    - survey на `question`: 5 `.survey-row.is-closed`, «Пишіть до 3 відповідей на телефоні», немає «Правильна відповідь»;
    - на `reveal` з `shown 2` — тексти двох нижніх рядків, решта закриті;
    - дошка з хмари — підпис «Дошка з ваших відповідей…».
  - `HostScreen.test.tsx`:
    - survey: уся дошка з популярністю й авторами, немає кнопок «Правильно»;
    - на `reveal` з `shown 1` з 5 — головна кнопка «Відкрити рядок 2 з 5» → `send('host:next')`;
    - «Відкрити всі» → `send('host:survey-all')`;
    - `shown 5` — «Далі»;
    - `surveySkipped: ['Що ви назвали про Київ?']` → «Запитання «Що ви назвали про Київ?» пропущено…».
  - `History.test.tsx`: гра з дошкою з хмари й дошкою ведучого — табло з авторами, «Дошка з хмари слів», відповіді «яблучко ✓, ананас ✗».
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web` → FAIL.
- [ ] **Step 3: Implement** за інтерфейсом.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): stage shows a closed «100 до 1» board, then rows flipping open bottom-up with names; host sees the whole board live, opens rows one by one or all at once, gets a warning for a skipped survey; history shows survey boards with names"
  ```

### Задача 9. Редактор: дошка ведучого, джерело «з хмари №…», запасні рядки, обмеження клітинок, перевірки чернетки

**Files:**
- Create: `apps/web/src/editor/SurveyEditor.tsx`, `apps/web/src/editor/SurveyEditor.test.tsx`
- Modify: `apps/web/src/editor/QuestionEditor.tsx`, `apps/web/src/editor/BoardEditor.tsx`, `apps/web/src/editor/QuizEditor.tsx` (передати джерела хмар), `apps/web/src/editor/draft.ts`, `apps/web/src/editor/draft-storage.ts`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `QuizEditor.test.tsx`, `BoardEditor.test.tsx`, `draft.test.ts`, `draft-storage.test.ts`

**Interfaces:**
- Produces (`draft.ts`):
  ```ts
  /** «Хмари слів», що стоять раніше за запитання (roundIndex, questionIndex) у класиці: номер хмари у вікторині (від 1), id, текст. */
  export function cloudSources(quiz: Pick<Quiz, 'rounds'>, roundIndex: number, questionIndex: number): { n: number; id: string; text: string }[];
  ```
- Produces (`SurveyEditor.tsx`):
  ```tsx
  export function SurveyEditor(props: {
    question: Extract<Question, { type: 'survey' }>;
    onChange: (q: Question) => void;
    /** Хмари раніше в класиці; [] на полі або коли хмар немає. */
    clouds: { n: number; id: string; text: string }[];
    /** На полі джерела «з хмари» немає. */
    allowCloud: boolean;
  }): JSX.Element;
  ```
  - **Джерело дошки** — група `aria-pressed`: «Мої відповіді» (`surveySourceHost`) і «Відповіді з хмари» (`surveySourceCloud`).
    - Друга кнопка вимкнена, якщо `clouds` порожні або `!allowCloud`. Підпис: `t('surveyNoClouds')` «Додайте раніше в класиці «хмару слів» — з її відповідей збереться дошка.»
    - Вибір хмари — `<select>` з `t('surveyCloudOption', { n, text })` «Хмара №{n}: «{text}»» → `cloudId`.
    - Підказка `t('surveyCloudHint')` «Дошка збереться в грі: до 8 найчастіших слів, популярність — частка гравців, що написали слово. Сховані вами слова не потраплять.»
  - **Рядки** (картка `.survey-row-edit` на рядок):
    - поле «Відповідь {n}» (`surveyRowText`, `maxLength LIMITS.surveyRowText`);
    - `NumberField` «Людей зі 100» (`surveyPopularity`, 1…100);
    - «Інші написання» — наявні `Rows` написань (як у «тексті»);
    - кнопки «＋ Рядок» (до 8) і «Прибрати» (від 4).
  - Рядок `t('surveyTotal', { total })` «Разом: {total} зі 100». Понад 100 — клас `.is-over` і підпис `t('surveyTotalOver')` «Понад 100 — зменште популярність.»
  - **З хмари:**
    - рядки сховано за перемикачем «Запасні рядки, якщо хмара порожня» (`surveySpare`);
    - вимкнено → `rows: []` (з підтвердженням `confirm(t('surveySpareDropConfirm'))`, якщо там був текст);
    - увімкнено → 4 порожні рядки;
    - без запасних — підказка `t('surveySkipHint')` «Якщо хмара не дасть жодного слова, запитання пропуститься.»
  - `NumberField` «Відповідей від гравця» (`surveyAnswersField`, 1…5).
  - Підказка `t('surveyPointsHint')` «Рядок з популярністю 30 дає 30 % ціни. Більше за ціну гравець не отримає.»
- Changes (`QuestionEditor.tsx`): `Body` `case 'survey'` → `<SurveyEditor clouds={…} allowCloud={roundType === 'classic'} />`. `QuestionEditor` отримує `clouds` від `QuizEditor` (через `cloudSources` для поточної позиції запитання; на полі — `[]`).
- Changes (`BoardEditor.tsx`): тип `survey` → клітинка `{ kind: 'normal', answerMode: 'phone', penalty: 'none' }` і `t('surveyCellNote')` «"100 до 1" грають лише з телефона на звичайній клітинці.» замість вибору виду й способу (як `wallCellNote`). `cloudId` на полі прибирається.
- Changes (`draft.ts`):
  - `cleanQuestion`: тексти й написання рядків обрізаються; порожні додаткові написання відкидаються; з `cloudId` і без увімкнених запасних — `rows: []`;
  - `problemKey`, `survey`:
    - менше 4 заповнених рядків без `cloudId` (або в запасних) → `problemSurveyRows` «Запитання {index}: потрібно щонайменше 4 відповіді з популярністю.»;
    - сума понад 100 → `problemSurveyTotal` «Запитання {index}: разом популярність {total} — більше за 100.»;
    - повтор написання → `problemSurveyDuplicate` «Запитання {index}: «{text}» веде у два рядки.»;
    - `cloudId`, якого немає серед `cloudSources` (хмару видалено, переміщено далі або це не хмара) → `problemSurveyCloud` «Запитання {index}: хмари для дошки вже немає раніше в класиці — виберіть іншу або введіть свої відповіді.»;
  - `problemsOf` (місце):
    - `survey` у бліці, фіналі, на бліц- чи усній клітинці → `problemSurveyPlace` «Запитання {index}: "100 до 1" діє лише в класиці й на звичайній клітинці поля з телефона.»;
    - з `cloudId` на полі → той самий `problemSurveyCloud`.
- Changes (`draft-storage.ts`, `revive`), `survey`:
  - рядки — масив об'єктів з рядками (`popularity` через `numberOr`, 0 за замовчуванням, `accepted` — масив рядків), інакше 5 порожніх;
  - `answers` через `numberOr`, типово 3;
  - `cloudId` — рядок або нічого.
- `i18n.ts`: усі ключі, названі вище: `surveySourceHost`, `surveySourceCloud`, `surveyNoClouds`, `surveyCloudOption`, `surveyCloudHint`, `surveyRowText`, `surveyPopularity`, `surveyAddRow`, `surveyRemoveRow`, `surveyTotal`, `surveyTotalOver`, `surveySpare`, `surveySpareDropConfirm`, `surveySkipHint`, `surveyAnswersField`, `surveyPointsHint`, `surveyCellNote`, `problemSurveyRows`, `problemSurveyTotal`, `problemSurveyDuplicate`, `problemSurveyCloud`, `problemSurveyPlace`.

- [ ] **Step 1: Write the failing tests.**
  - `draft.test.ts`:
    - `cloudSources`: хмара в раунді 0 і хмара в раунді 1 після запитання → для запитання 2 раунду 1 лише хмари, що стоять раніше, з номерами 1 і 2;
    - survey з 3 заповненими рядками → `problemSurveyRows`; сума 110 → `problemSurveyTotal` з `total: 110`; «Яблуко» і «яблуко» в різних рядках → `problemSurveyDuplicate`;
    - `cloudId` на видалену хмару → `problemSurveyCloud`;
    - survey на усній клітинці → `problemSurveyPlace`.
  - `draft-storage.test.ts`: survey з `popularity: 'x'` → 0; `answers: 9` → обрізано до межі або 3 (за `numberOr`); `cloudId` зберігся.
  - `SurveyEditor.test.tsx`:
    - зміна «Відповідь 1» і «Людей зі 100» → `onChange`;
    - «Разом: 90 зі 100», понад 100 → «Понад 100…»;
    - «＋ Рядок» до 8, далі кнопки немає; «Прибрати» — лише від 5 рядків;
    - «Відповіді з хмари» вимкнена без хмар (з підписом);
    - вибір «Хмара №1: «…»» → `cloudId`, рядки сховано, «Якщо хмара не дасть жодного слова, запитання пропуститься.»;
    - перемикач запасних → 4 порожні рядки.
  - `QuizEditor.test.tsx`:
    - чип «100 до 1» у класиці → 5 рядків, «Відповідей від гравця» = 3; заповнення 4 рядків і «Зберегти» шле `{ type: 'survey', rows: [...4], answers: 3, timeLimit: 45 }`;
    - класика з хмарою вище → «Відповіді з хмари» активна, збережене має `cloudId` і `rows: []`;
    - у бліці й фіналі немає чипа «100 до 1».
  - `BoardEditor.test.tsx`: тип «100 до 1» на усній клітинці перемикає її на звичайну з телефона й показує «"100 до 1" грають лише з телефона…»; джерела «з хмари» немає.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/editor` → FAIL.
- [ ] **Step 3: Implement** за інтерфейсом. На 375 px картка рядка: відповідь на всю ширину, «Людей зі 100» і кнопка «Прибрати» в ряд під нею, написання нижче.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): editor for «100 до 1» — host board rows with popularity and spellings and a running total, or answers from an earlier word cloud with optional spare rows; answers per player; board cell rules and draft checks"
  ```

### Задача 10. Довідка ведучого: «100 до 1», хмара як джерело, оновлені записи бафів, клітинок, раундів і налаштувань

**Files:**
- Modify: `apps/web/src/help/questions.ts`, `apps/web/src/help/powers.ts`, `apps/web/src/help/cells.ts`, `apps/web/src/help/rounds.ts`, `apps/web/src/help/settings.ts`, `apps/web/src/screens/HostScreen.tsx`
- Test: `apps/web/src/help/host-help.test.ts`, `HostScreen.test.tsx`

**Interfaces:**
- `questions.ts`, запис `survey` (вписаний у задачі 1; тут звірити з рушієм і доповнити):
  - `title: '100 до 1'` (= `t('type_survey')`);
  - «Що це»: «Гравці вгадують найпопулярніші відповіді опитування, як у телешоу.»;
  - «Як іде в грі»:
    - ви задаєте 4–8 відповідей: у кожної популярність (людей зі 100, разом не більше 100) і інші написання;
    - або берете дошку з «хмари слів», що прозвучала раніше в класиці: у грі збереться до 8 найчастіших слів, популярність — частка гравців, що написали слово; сховані слова не потрапляють;
    - якщо хмара порожня, грають ваші запасні рядки, а без них запитання пропускається (пульт про це скаже);
    - гравець пише до N відповідей (N — 1–5, задаєте ви); написання порівнюються, як у текстовому запитанні;
    - сцена показує закрите табло; на розкритті ви відкриваєте рядки знизу вгору кнопкою «Відкрити рядок» або всі одразу; біля рядка видно, хто його назвав;
  - «Бали»:
    - «Кожен влучений рядок — ціна × популярність / 100. Той самий рядок двічі не рахується. Більше за ціну гравець не отримає.»;
    - «Половина ціни й більше вважається правильною відповіддю: вона йде в серію, точність і досягнення.»;
    - «Штраф «мінус» — лише за відповідь без жодного влучення.»;
    - «Бонусу за швидкість немає. На полі — ціна клітинки × позначка × множник раунду.»;
  - «Порада»:
    - «Додайте поширені написання: «яблучко» до «Яблуко». Зарахувати інше написання під час гри не вийде.»;
    - «Дошка з хмари — найкращий спосіб «опитати» сам зал: спершу хмара, через кілька запитань — «100 до 1».»;
    - «Розподіліть популярність нерівно: так табло цікавіше.»;
  - «Обмеження»:
    - `${LIMITS.minSurveyRows}–${LIMITS.maxSurveyRows} відповідей, до ${LIMITS.surveyRowText} символів.`;
    - `1–${LIMITS.maxSurveyAnswers} відповідей від гравця, типово ${LIMITS.defaultSurveyAnswers}.`;
    - «Класика й звичайна клітинка поля з телефона; дошка з хмари — лише в класиці.»;
    - «Діють бафи «Подвійні бали», «Більше часу», «Щит», «Підказка ведучого», «Заміна запитання»; 50/50, «Друга спроба» й «Запитання в залі» — ні.».
- `questions.ts`, `wordcloud.tip` + «Хмару, що прозвучала, можна взяти за дошку «100 до 1» далі в грі.»
- `powers.ts`:
  - `BUFF_HELP.fifty.limits` + «Не діє на «100 до 1»: варіантів немає.»;
  - `BUFF_HELP.retry.limits` + «Не діє на «100 до 1»: гравець і так пише кілька відповідей.»;
  - `BUFF_HELP.audience.limits` + «Не діє на «100 до 1»: голоси залу розкрили б табло.»;
  - `BUFF_HELP.double.how` або `points` — згадка, що на «100 до 1» подвоюються бали за дошку (якщо поле переліку місць є).
- `cells.ts`: `normal.limits` + «"100 до 1" — лише з телефона.»; `voice.limits` і `blitz.limits` + «Не для "100 до 1".».
- `rounds.ts`:
  - `classic.tip` + «"100 до 1" з хмари слів: спершу хмара, потім табло з відповідей самих гравців.»;
  - `board.limits` + «"100 до 1" — лише з дошкою ведучого (з хмари — у класиці).»;
  - `blitz.limits` і `final.limits` + «"100 до 1" тут недоступне.».
- `settings.ts`: `speedBonus` + «Не нараховується на "100 до 1".».
- Пульт: панель `.host-survey` має `<HelpButton id="question.survey" />` біля заголовка.

- [ ] **Step 1: Write the failing tests.**
  - `host-help.test.ts`:
    - наявні тести «кожен тип має запис» і «назви збігаються» тепер покривають `survey`;
    - новий `10e entries tell the engine numbers`:
      - `question.survey.limits` містить `${LIMITS.minSurveyRows}–${LIMITS.maxSurveyRows}` і `1–${LIMITS.maxSurveyAnswers}`;
      - `question.survey.points` містить «ціна × популярність / 100» і «Половина ціни»;
      - `question.survey.how` містить «знизу вгору» і «пропускається»;
      - `question.wordcloud.tip` містить «100 до 1» (тест 10d перевернути);
    - `related entries mention 100 до 1`:
      - `buff.fifty`, `buff.retry`, `buff.audience` — «100 до 1»;
      - `cell.normal`, `cell.voice` — «100 до 1»;
      - `round.board`, `round.blitz`, `round.final` — «100 до 1»;
      - `setting.speedBonus` — «100 до 1».
  - `HostScreen.test.tsx`: survey → кнопка «Довідка: 100 до 1» у панелі; натиск нічого не надсилає.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/help apps/web/src/screens/HostScreen.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Звірити кожне речення з рушієм задач 2–3 і з рішеннями плану.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "docs(web): host help for «100 до 1» (host board or a board from a word cloud, popularity scoring capped at the price, half as correct, row-by-row reveal, skipped survey); word cloud, buff, cell, round and speed-bonus entries updated; ⓘ on the host survey panel"
  ```

### Задача 11. Наскрізний сценарій 10e з кадрами

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе з задач 1–10. Помічники:
  - `open`, `register`, `join`, `shot`, `afterSplash`, `expectNoSideScroll`, `expectStageFits`;
  - `snapshot`, `problems`, `socketFrames`, `framesBeforeReveal`, `scoreOf`, `totalOf`, `toNextQuestion`.
- Нові помічники у файлі:
  ```ts
  /** Заповнює поля «Відповідь N» значеннями й натискає «Відповісти». */
  async function answerSurvey(page: Page, values: string[]): Promise<void>;
  /** Тексти відкритих рядків табло на сторінці (зверху вниз). */
  const openRows = async (page: Page) => page.locator('.survey-row:not(.is-closed) .survey-text').allTextContents();
  ```

- [ ] **Step 1: Add the scenario** у кінець файлу за зразком 10d:
  ```ts
  it('part 10e: «100 до 1» — the editor builds a host board and a cloud board (375 px too), rows never leak before the reveal, the stage opens rows bottom-up with names, popularity scoring with the cap, a cloud board without hidden words, a skipped survey warns the host', async () => {
    try {
      await surveyGame();
    } catch (error) {
      await snapshot();
      throw error;
    }
  });
  ```
  **Підготовка `surveyGame()`:**
  1. `const host = await open('host10e', 1280, 900); await register(host, 'host', 'Ірина Ведуча', 'host10e@example.com');`
  2. Вікторина «Сто до одного 10e» через `POST /api/quizzes`, `settings: { leaderboard: 'end' }`, раунд `r1` класика (`speedBonus: false`, `DEFAULT_RULES`, `shuffleOptions: false`):
     - `k1` wordcloud «Назвіть фрукт», `words: 3`, 30 с;
     - `s1` survey «Назвіть фрукт, який люблять діти», `answers: 3`, 45 с, 1000. Рядки:
       - `row-apple` «Яблуко» 32 `['яблучко']`;
       - `row-banana` «Банан» 25;
       - `row-straw` «Полуниця» 15;
       - `row-melon` «Кавун» 10;
       - `row-pear` «Груша» 8.
     - `s2` survey «Фрукти залу: назвіть два», `answers: 2`, 45 с, 1000, `cloudId: 'k1'`, `rows: []`;
     - `k2` wordcloud «Назвіть овоч», `words: 1`, 20 с;
     - `s3` survey «Овочі залу», `answers: 2`, 45 с, 1000, `cloudId: 'k2'`, `rows: []` (у `k2` ніхто не напише — `s3` пропуститься);
     - `q1` single «Кінець?» («Так», «Ні»), 20 с, 100.

  **Кроки з перевірками й кадрами (у такому порядку):**
  1. **Редактор (1280 × 900).** «Редагувати» у «Сто до одного 10e»:
     - **Запитання 2.** Видно 5 рядків, «Разом: 90 зі 100», «Відповідей від гравця» = 3.
     - «Людей зі 100» рядка 1 = 50 → «Разом: 108 зі 100» і «Понад 100…» → повернути 32 → кадр `p10e-editor-survey`.
     - 375 × 812: `expectNoSideScroll(host, 'p10e-editor-survey-375')` (кадр) → назад 1280 × 900.
     - **Запитання 3.** Активна «Відповіді з хмари», вибрано «Хмара №1: «Назвіть фрукт»», «Якщо хмара не дасть жодного слова, запитання пропуститься.» → кадр `p10e-editor-survey-cloud`.
     - «Зберегти». `GET /api/quizzes/<id>`: `s2.cloudId === 'k1'`, `s2.rows` порожній.
  2. **Гра.**
     - «Грати» → `code`, `stageUrl`; `stage = open('stage10e', 1280, 720)` → `stage.goto(stageUrl)`; почати збирати `socketFrames(stage)`.
     - `olya = open('olya10e', 375, 812)`, `petro = open('petro10e', 375, 812)`, `join` обох; почати збирати `socketFrames(olya)` і `socketFrames(petro)`.
     - «Почати гру» → `afterSplash` → «Почати раунд» → `afterSplash(host, olya, petro, stage)`.
  3. **Хмара k1.**
     - Оля: «Яблуко», «Банан», «Вишня»; Петро: «яблуко», «Слива».
     - Пульт: торкнутися «Слива» (сховати) → «Показати результати» → `toNextQuestion(host)`.
  4. **Дошка ведучого s1.**
     - Сцена: 5 `.survey-row.is-closed`, «Пишіть до 3 відповідей на телефоні» → кадр `p10e-stage-survey-question`.
     - Оля: заповнює «яблучко», «Банан» → кадр `p10e-phone-survey` → `expectNoSideScroll(olya, 'p10e-phone-survey')` → дописує «ананас» → «Відповісти» → «Відповіді надіслано».
     - Петро: «Яблуко», « яблуко » → бачить «Ця відповідь уже є» → третє «Кавун» → «Відповісти».
     - Запитання закривається (усі відповіли).
     - Пульт: уся дошка, біля «Яблуко» — «Оля, Петро», біля «Кавун» — «Петро»; немає кнопок «Правильно» → кадр `p10e-host-survey`.
     - **Перевірка витоку:** жоден з `framesBeforeReveal` Олі, Петра й сцени не містить «Полуниця», «Груша», `row-straw`, `"popularity":3`.
     - «Показати відповідь» → головна кнопка «Відкрити рядок 1 з 5»:
       - натиснути двічі → сцена: `openRows` = `['Кавун', 'Груша']` (місця 4 і 5), «Груша» — «Ніхто не назвав», «Кавун» — «Петро»;
       - сцена не містить «Яблуко» → кадр `p10e-stage-survey-half`.
     - «Відкрити всі» → `openRows` — 5 рядків, «Яблуко» вгорі з «Оля, Петро» → `expectStageFits(stage, 'p10e-stage-survey-full')` (кадр).
     - Телефон Олі: «яблучко — місце 1, 32», «ананас — немає на табло», бали 570 → кадр `p10e-phone-survey-result`.
     - `totalOf(host, 'Оля') === 570`, Петро — 420.
     - «Далі» (усі рядки відкрито) → наступне запитання.
  5. **Дошка з хмари s2.**
     - Сцена: 3 закриті рядки й «Дошка з ваших відповідей у хмарі слів». «Слива» схована й не потрапила: на пульті рядки «Яблуко» 100, «Банан» 50, «Вишня» 50.
     - Оля: «яблуко», «банан» → «Відповісти»; Петро: «Слива», «Вишня» → «Відповісти».
     - «Показати відповідь» → «Відкрити всі» → кадр `p10e-stage-survey-cloud`.
     - Бали: Оля +1000 (150 % → ціна; разом 1570), Петро +500 (разом 920).
     - Жоден кадр сокета сцени й телефонів не містить «Слива» у рядках табло (перевірити, що `"text":"Слива"` немає в жодному кадрі сцени).
     - «Далі».
  6. **Пропуск s3.**
     - Хмара k2: ніхто не пише; пульт закриває запитання → «Показати результати» → «Далі».
     - Відкривається `q1` («Кінець?»), а не «Овочі залу».
     - Пульт показує «Запитання «Овочі залу» пропущено: хмара не дала слів…» → кадр `p10e-host-skip`.
     - Лічильник запитань на пульті — «з 5».
     - Обидва відповідають на `q1`, розкриття.
  7. **Історія.** Пульт → «Завершити гру» → історія гри:
     - табло `s1` з авторами й «яблучко ✓, Банан ✓, ананас ✗»;
     - `s2` з «Дошка з хмари слів» і рядками «Яблуко», «Банан», «Вишня»;
     - запитання «Овочі залу» в історії немає.
  8. `expect(problems).toEqual([])`.

- [ ] **Step 2: Run** `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts`. Очікується PASS усіх сценаріїв.
  - Наявні сценарії шукають кнопки за назвою. Новий чип «100 до 1» і кнопки «Відкрити рядок…» / «Відкрити всі» можуть зачепити `getByRole('button', { name: … })` без `exact` — тоді додати `exact`.
  - Переглянути кадри в `apps/server/e2e/artifacts/shots`:
    - редактор на 375 px: картки рядків, «Людей зі 100» і написання не вилазять за край;
    - телефон: три поля й «Відповісти» видно без прокрутки над клавіатурою (поле ≥ 44 px), результат читається;
    - сцена: закрите табло й 5 відкритих рядків з нікнеймами вміщуються в 720 px, перегортання не лишає рядок напівповерненим на кадрі;
    - пульт: дошка з авторами, кнопки «Відкрити рядок» і «Відкрити всі» ≥ 44 px, попередження про пропуск помітне.
- [ ] **Step 3: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2` → PASS.
- [ ] **Step 4: Commit**
  ```bash
  git add apps/server/e2e/full-game.e2e.ts
  git commit -m "test: part 10e end-to-end — editor builds a host board and a cloud board (375 px too); survey rows never reach phones or the stage before the reveal; the stage opens rows bottom-up with names; popularity scoring with the cap; a cloud board without hidden words; a skipped survey warns the host; history shows survey boards"
  ```

Після фінальної рецензії гілку злити в `main`, запустити `pnpm vitest run --maxWorkers=2` і `git push origin main`. **`GAME_STATE_VERSION` піднято до 5**, але `READABLE_STATE_VERSIONS = [2, 3, 4, 5]`, тож кімнати, збережені до розгортання, відновлюються, і живі ігри пуш не обриває. Перевірка `live_room` не обов'язкова. Якщо рецензія змінить це рішення (стан 4 стане нечитабельним), то за правилом 14a спершу `SELECT count(*) FROM live_room;` у базі Render і пуш лише за 0.

У звіті власникові назвати рішення:
- **Дошка ведучого:**
  - 4–8 відповідей до 40 символів, популярність 1–100 (разом ≤ 100), інші написання;
  - гравець пише 1–5 відповідей (типово 3), порівняння — як у текстовому запитанні.
- **Бали:**
  - ціна × популярність / 100 за кожен влучений рядок, той самий рядок раз, не більше ціни;
  - від половини ціни — «правильно»; мінус лише без жодного влучення; бонусу за швидкість немає;
  - зарахувати інше написання під час гри не можна.
- **Дошка з хмари:**
  - лише в класиці, хмара має стояти раніше;
  - до 8 найчастіших слів без схованих, популярність — частка гравців, що писали;
  - порожня хмара — запасні рядки ведучого, без них запитання пропускається з попередженням на пульті (без запису, балів і впливу на точність).
- **Розкриття:**
  - ведучий відкриває рядки знизу вгору кнопкою «Відкрити рядок» або «Відкрити всі», без автотаймера;
  - біля кожного рядка — хто назвав.
- **Де діє:** класика й звичайна клітинка поля з телефона (не усна, не бліц, не фінал, не дуелі, не запасні).
- **Бафи:**
  - діють «Подвійні бали», «Більше часу», «Щит», «Підказка ведучого», «Заміна запитання»;
  - не діють 50/50, «Друга спроба», «Запитання в залі»;
  - дебафи — як завжди.
- **Формат стану:** `GAME_STATE_VERSION` 5 (`Play.survey`), старі версії 2–4 читаються — пуш не обриває ігор. Міграцій немає.
- **Демо:** у «demo» — «100 до 1» з дошкою ведучого в `r-x3` і з хмари розминки в `r-rules`.
