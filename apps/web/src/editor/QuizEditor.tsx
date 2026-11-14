import { LIMITS, allowedBuffs, questionsOf, roundQuestions, roundTrials, type Question, type Quiz, type QuizLikes, type Round } from '@quiz/shared';
import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import {
  booleanCounts,
  cleaned,
  cloudSources,
  duplicateQuestion,
  firstProblem,
  groupDraftPlace,
  moveItem,
  newBlitzRound,
  newBoardRound,
  newAuctionRound,
  newTruthRound,
  newPuzzlesRound,
  newQuestRound,
  newBetsRound,
  newFinalRound,
  newWipeoutQuestion,
  newWipeoutRound,
  newLadderQuestion,
  newLadderRound,
  resizeLadder,
  newSurvivalRound,
  newClassicRound,
  newQuestion,
  problemsOf,
  questionTypesFor,
  swapGaps,
} from './draft';
import { BoardEditor } from './BoardEditor';
import { GroupPicker } from '../groups/GroupPicker';
import type { GroupDraft } from '../groups/templates';
import { useGroupDrafts } from './group-drafts';
import { LikeCount } from './LikeCount';
import { HelpButton } from '../help/HelpButton';
import { DuelsEditor } from './DuelsEditor';
import { PowersEditor, settleFamilyPrices } from './PowersEditor';
import { QuestionEditor } from './QuestionEditor';
import { RoundSettings } from './RoundSettings';
import { RoundStrip } from './RoundStrip';
import { SparesEditor } from './SparesEditor';
import { TeamsEditor } from './TeamsEditor';

interface Props {
  initial: Quiz;
  heading: string;
  /** Повідомлення над формою, наприклад про відновлену чернетку. */
  notice?: string | null;
  /** Викликається після кожної зміни, щоб чернетку можна було зберегти про запас. */
  onDraft?: (quiz: Quiz) => void;
  /** Зберігає вікторину; повертає текст помилки або null. */
  onSave: (quiz: Quiz) => Promise<string | null>;
  onCancel: () => void;
  /** Лічильники лайків збереженої вікторини; без них сердець не видно. */
  likes?: QuizLikes;
}

/**
 * Редактор «список і сцена»: зверху назва й правила, далі раунди; ліворуч список запитань, праворуч одне запитання
 * таким, яким його побачать гравці. На вузькому екрані список ховається за кнопку.
 */
export function QuizEditor({ initial, heading, notice = null, onDraft, onSave, onCancel, likes }: Props) {
  const [quiz, setQuiz] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [roundIndex, setRoundIndex] = useState(0);
  const [selected, setSelected] = useState(0);
  const [listOpen, setListOpen] = useState(false);
  /** Панель «Запитання з групи» відкрита (12l). */
  const [pickerOpen, setPickerOpen] = useState(false);
  const groupDrafts = useGroupDrafts();
  const [problems, setProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  /** Розділ «Дуелі» розгорнуто: автором або помилкою в ньому. */
  const [duelsOpen, setDuelsOpen] = useState(false);
  /** Розділ «Запасні запитання» розгорнуто: автором або помилкою в ньому. */
  const [sparesOpen, setSparesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Клітинка поля, яку треба показати після невдалого збереження. */
  const [boardFocus, setBoardFocus] = useState<{ category: number; index: number } | null>(null);
  /** Запитання, яке зараз перетягують у списку. */
  const dragged = useRef<number | null>(null);
  const { rounds, settings } = quiz;
  const ri = Math.min(roundIndex, rounds.length - 1);
  const round = rounds[ri];
  // У полі плаского списку запитань немає: ним керує BoardEditor. У «Правді про гравця» запитань теж немає: їх створює гра.
  const questions: Question[] = round.type === 'board' || round.type === 'truth' ? [] : round.questions;
  const current = questions[Math.min(selected, questions.length - 1)];
  const last = questions.length - 1;

  // Закриття вкладки чи перезавантаження з незбереженими змінами: браузер перепитає.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const update = (next: Quiz) => {
    setQuiz(next);
    setDirty(true);
    setProblems([]);
    onDraft?.(next);
  };
  const setRounds = (next: Quiz['rounds']) => update({ ...quiz, rounds: next });
  const setRound = (next: Round) => setRounds(rounds.map((r, index) => (index === ri ? next : r)));
  const setQuestions = (next: Question[]) => {
    if (round.type !== 'board' && round.type !== 'truth') setRound({ ...round, questions: next });
  };
  /** Запитань у всій вікторині: ліміт 200 діє на всі раунди разом. */
  const total = questionsOf(quiz).length + quiz.rounds.reduce((sum, r) => sum + roundTrials(r).length, 0);
  const gaps = swapGaps(quiz);
  const roomForMore =
    questions.length <
      (round.type === 'wipeout'
        ? LIMITS.maxWipeoutQuestions
        : round.type === 'survival'
          ? LIMITS.maxSurvivalQuestions
          : round.type === 'ladder'
            ? LIMITS.maxLadderQuestions
            : round.type === 'puzzles'
              ? LIMITS.maxPuzzles
              : round.type === 'quest'
                ? LIMITS.maxQuestQuestions
                : LIMITS.maxQuestions) &&
    total < LIMITS.maxQuizQuestions;
  const setAwayPenalty = (on: boolean) => {
    const { awayPenalty: _off, ...rest } = settings;
    update({ ...quiz, settings: on ? { ...rest, awayPenalty: true } : rest });
  };
  const setNewcomers = (on: boolean) => {
    const { newcomers: _off, ...rest } = settings;
    update({ ...quiz, settings: on ? { ...rest, newcomers: true } : rest });
  };
  const setFamily = (on: boolean) => {
    const { family: _off, ...rest } = settings;
    // Ціни схованих у сімейній грі дебафів поля вже не мають — недописану ціну тихо виправляємо, щоб вона не блокувала збереження.
    update({ ...quiz, settings: on ? settleFamilyPrices({ ...rest, family: true }) : rest });
  };
  const setTeams = (teams: Quiz['settings']['teams']) => {
    const { teams: _off, ...rest } = settings;
    update({ ...quiz, settings: teams === undefined ? rest : { ...rest, teams } });
  };
  const setSettings = (patch: Partial<Quiz['settings']>) => update({ ...quiz, settings: { ...settings, ...patch } });

  const select = (index: number) => {
    setSelected(index);
    setListOpen(false);
  };

  /** Переносить запитання на нове місце; виділення лишається на тому, що було вибране. */
  const move = (from: number, to: number) => {
    const next = moveItem(questions, from, to);
    if (next === questions) return;
    const picked = questions[selected];
    setQuestions(next);
    setSelected(next.indexOf(picked));
  };

  const remove = () => {
    const hasText = current.text.trim() !== '';
    if (hasText && !window.confirm(t('removeQuestionConfirm', { index: selected + 1 }))) return;
    const rest = questions.filter((_, index) => index !== selected);
    if (round.type === 'ladder') setRound(resizeLadder({ ...round, questions: rest }, rest.length, selected));
    else setQuestions(rest);
    setSelected(Math.max(0, selected === last ? selected - 1 : selected));
  };

  const add = () => {
    if (round.type === 'ladder') {
      setRound(resizeLadder({ ...round, questions: [...questions, newLadderQuestion()] }, questions.length + 1));
      select(questions.length);
      return;
    }
    // У «Головоломках» нове запитання — згенероване судоку (інших типів там немає).
    setQuestions([...questions, round.type === 'wipeout' ? newWipeoutQuestion(questions[last]) : round.type === 'survival' ? { ...newQuestion('single'), points: 100 } : newQuestion(round.type === 'puzzles' ? 'sudoku' : 'single')]);
    select(questions.length);
  };

  /** Чернетка із запису групи — в кінець списку, як «Додати запитання», і з тією самою ціною (12l). */
  const addFromGroup = (draft: GroupDraft, source: { groupId: string; itemId: string }) => {
    const points = round.type === 'wipeout' ? newWipeoutQuestion(questions[last]).points : round.type === 'survival' ? 100 : draft.question.points;
    const question = { ...draft.question, points } as Question;
    setQuestions([...questions, question]);
    select(questions.length);
    groupDrafts?.add(question.id, { ...source, notes: draft.notes });
  };

  const duplicate = () => {
    const next = [...questions];
    next.splice(selected + 1, 0, duplicateQuestion(current));
    setQuestions(next);
    select(selected + 1);
  };

  const selectRound = (index: number) => {
    setRoundIndex(index);
    setSelected(0);
    setBoardFocus(null);
    setListOpen(false);
  };

  const addRound = (type: Round['type']) => {
    const fresh =
      type === 'blitz' ? newBlitzRound() : type === 'board' ? newBoardRound() : type === 'final' ? newFinalRound() : type === 'bets' ? newBetsRound() : type === 'auction' ? newAuctionRound() : type === 'truth' ? newTruthRound() : type === 'puzzles' ? newPuzzlesRound() : type === 'wipeout' ? newWipeoutRound() : type === 'survival' ? newSurvivalRound() : type === 'ladder' ? newLadderRound() : type === 'quest' ? newQuestRound() : newClassicRound();
    setRounds([...rounds, fresh]);
    selectRound(rounds.length);
  };

  const renameRound = (index: number) => {
    const title = window.prompt(t('roundNamePrompt', { index: index + 1 }), rounds[index].title);
    if (title === null) return;
    setRounds(rounds.map((r, i) => (i === index ? { ...r, title: title.slice(0, LIMITS.roundTitle) } : r)));
  };

  /** Переносить раунд; вибраним лишається той самий раунд. */
  const moveRound = (from: number, to: number) => {
    const next = moveItem(rounds, from, to);
    if (next === rounds) return;
    setRounds(next);
    setRoundIndex(next.indexOf(rounds[ri]));
  };

  const removeRound = (index: number) => {
    if (rounds.length === 1) return;
    const target = rounds[index];
    const targetQuestions = roundQuestions(target);
    const targetTrials = roundTrials(target);
    const hasText = [...targetQuestions, ...targetTrials].some((q) => q.text.trim() !== '');
    if (hasText && !window.confirm(t('removeRoundConfirm', { index: index + 1, count: targetQuestions.length + targetTrials.length }))) return;
    setRounds(rounds.filter((_, i) => i !== index));
    selectRound(Math.max(0, index === rounds.length - 1 ? index - 1 : index));
  };

  const cancel = () => {
    if (dirty && !window.confirm(t('discardConfirm'))) return;
    onCancel();
  };

  const save = async () => {
    const found = problemsOf(quiz);
    setProblems(found);
    if (found.length > 0) {
      if (found.some((problem) => problem.startsWith(t('duelsTitle')))) setDuelsOpen(true);
      // Помилка в питанні на виживання лежить у налаштуваннях раунду: відкриваємо їх.
      const trialPrefix = t('problemSurvivalTrial', { index: 0, problem: '' }).split('0')[0];
      if (found.some((problem) => problem.includes(trialPrefix) || problem.includes(t('problemSurvivalTrials')))) setSettingsOpen(true);
      // Суми рівнів і неспалимі лежать у налаштуваннях раунду.
      if (found.some((problem) => problem.includes(t('problemLadderLevels', { max: LIMITS.maxLadderLevel })) || problem.includes(t('problemLadderSafe')))) setSettingsOpen(true);
      // Ставки: найбільша ставка й числа лежать у налаштуваннях раунду.
      const betsMaxPrefix = t('problemBetsMax', { min: 0, max: 0 }).split('0')[0];
      if (found.some((problem) => problem.includes(betsMaxPrefix) || problem.includes(t('problemRules')))) setSettingsOpen(true);
      // Ціна й таймер «Правди про гравця» — у налаштуваннях раунду.
      if (found.some((problem) => problem.includes(t('problemTruthNumbers', { max: LIMITS.maxPoints, min: LIMITS.minTime, maxTime: LIMITS.maxTime })))) setSettingsOpen(true);
      const sparePrefixes = [t('sparesTitle'), t('problemSparesEmpty'), t('spareN', { index: '' }).trim()];
      if (found.some((problem) => sparePrefixes.some((prefix) => problem.startsWith(prefix)))) setSparesOpen(true);
      // Показати запитання, яке треба виправити: воно може бути далеко у списку.
      const broken = firstProblem(quiz);
      if (broken !== null) {
        setRoundIndex(broken.round);
        setSelected(broken.question);
        setBoardFocus(broken.cell === null ? null : { ...broken.cell });
      }
      return;
    }
    setSaving(true);
    const error = await onSave(cleaned(quiz));
    setSaving(false);
    if (error === null) setDirty(false);
    else setProblems([error]);
  };

  return (
    <main className="app editor">
      <h1 className="brand">{heading}</h1>
      {likes !== undefined && likes.quiz > 0 && <p className="meta">{t('quizLikesLine', { count: likes.quiz })}</p>}
      <a className="quiet-link help-link" href="/help" target="_blank" rel="noreferrer">
        {t('helpLink')}
        <span aria-hidden="true"> ↗</span>
      </a>

      {notice !== null && (
        <p className="banner" role="status">
          {notice}
        </p>
      )}

      <section className="editor-quiz">
        <label className="field">
          <span>{t('quizTitle')}</span>
          <input value={quiz.title} maxLength={120} onChange={(event) => update({ ...quiz, title: event.target.value })} />
        </label>

        <details className="rules">
          <summary>{t('settingsTitle')}</summary>
          <label className="field">
            <span>{t('quizDescription')}</span>
            <input
              value={quiz.description}
              maxLength={500}
              onChange={(event) => update({ ...quiz, description: event.target.value })}
            />
          </label>
          <div className="with-help">
            <label className="field">
              <span>{t('leaderboardLabel')}</span>
              <select
                value={settings.leaderboard}
                onChange={(event) => setSettings({ leaderboard: event.target.value === 'end' ? 'end' : 'each' })}
              >
                <option value="each">{t('leaderboardEach')}</option>
                <option value="end">{t('leaderboardEnd')}</option>
              </select>
            </label>
            <HelpButton id="setting.leaderboard" />
          </div>
          <div className="with-help">
            <label className="field field-check">
              <input type="checkbox" checked={settings.newcomers === true} onChange={(event) => setNewcomers(event.target.checked)} />
              <span>{t('newcomersLabel')}</span>
            </label>
            <HelpButton id="setting.newcomers" />
          </div>
          <p className="meta">{t('newcomersHint')}</p>
          <div className="with-help">
            <label className="field field-check">
              <input type="checkbox" checked={settings.family === true} onChange={(event) => setFamily(event.target.checked)} />
              <span>{t('familyLabel')}</span>
            </label>
            <HelpButton id="setting.family" />
          </div>
          <p className="meta">{t('familyHint')}</p>
          <div className="with-help">
            <label className="field field-check">
              <input type="checkbox" checked={settings.awayPenalty === true} onChange={(event) => setAwayPenalty(event.target.checked)} />
              <span>{t('awayPenaltyLabel')}</span>
            </label>
            <HelpButton id="setting.away" />
          </div>
          <p className="meta">{t('awayPenaltyHint')}</p>
        </details>

        <details className="rules teams">
          <summary>{t('teamsTitle')}</summary>
          <TeamsEditor teams={settings.teams} onChange={setTeams} />
        </details>

        <details className="rules powers">
          <summary>{t('powersTitle')}</summary>
          <PowersEditor settings={settings} family={settings.family === true} spares={quiz.spares} gaps={gaps} onChange={(powers) => setSettings(powers)} />
        </details>

        <details className="rules spares" open={sparesOpen} onToggle={(event) => setSparesOpen(event.currentTarget.open)}>
          <summary>{t('sparesTitle')}</summary>
          <p className="meta with-help">
            <span>{t('sparesTitle')}</span>
            <HelpButton id="setting.spares" />
          </p>
          <SparesEditor
            likes={likes?.questions}
            spares={quiz.spares}
            onChange={(spares) => {
              const { spares: _old, ...rest } = quiz;
              update(spares === undefined ? rest : { ...rest, spares });
            }}
          />
        </details>

        <details className="rules duels" open={duelsOpen} onToggle={(event) => setDuelsOpen(event.currentTarget.open)}>
          <summary>{t('duelsTitle')}</summary>
          <p className="meta with-help">
            <span>{t('duelsTitle')}</span>
            <HelpButton id="setting.duels" />
          </p>
          <DuelsEditor
            duels={quiz.duels}
            onChange={(duels) => {
              const { duels: _old, ...rest } = quiz;
              update(duels === undefined ? rest : { ...rest, duels });
              if (duels !== undefined) setDuelsOpen(true);
            }}
          />
        </details>
      </section>

      <RoundStrip
        rounds={rounds}
        selected={ri}
        onSelect={selectRound}
        onAdd={addRound}
        onRename={renameRound}
        onMove={moveRound}
        onRemove={removeRound}
      />
      <RoundSettings round={round} index={ri + 1} total={total} buffs={allowedBuffs(quiz)} lastRound={ri === rounds.length - 1} onChange={setRound} open={settingsOpen} onToggle={setSettingsOpen} />

      <div className="editor-grid">
        <aside className="editor-side">
          {round.type !== 'board' && round.type !== 'final' && round.type !== 'truth' && (
            <>
              {/* На вузькому екрані список схований; ці кнопки гортають запитання й відкривають його. */}
              <div className="question-nav">
                <button
                  type="button"
                  className="btn btn-icon"
                  aria-label={t('prevQuestion')}
                  disabled={selected === 0}
                  onClick={() => select(selected - 1)}
                >
                  <span className="flip-rtl" aria-hidden="true">
                    ‹
                  </span>
                </button>
                <button
                  type="button"
                  className="btn question-nav-all"
                  aria-label={t('allQuestions')}
                  aria-expanded={listOpen}
                  onClick={() => setListOpen(!listOpen)}
                >
                  {`${selected + 1} / ${questions.length}`}
                  <span aria-hidden="true"> ☰</span>
                </button>
                <button
                  type="button"
                  className="btn btn-icon"
                  aria-label={t('nextQuestion')}
                  disabled={selected === last}
                  onClick={() => select(selected + 1)}
                >
                  <span className="flip-rtl" aria-hidden="true">
                    ›
                  </span>
                </button>
              </div>

              <ol className={listOpen ? 'question-list is-open' : 'question-list'}>
                {questions.map((question, index) => {
                  const text = question.text.trim() === '' ? t('untitled') : question.text;
                  return (
                    <li
                      key={question.id}
                      className={index === selected ? 'is-on' : undefined}
                      draggable
                      onDragStart={() => {
                        dragged.current = index;
                      }}
                      onDragEnd={() => {
                        dragged.current = null;
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (dragged.current !== null) move(dragged.current, index);
                        dragged.current = null;
                      }}
                    >
                      <button
                        type="button"
                        className="question-item"
                        aria-current={index === selected}
                        aria-label={`${t('questionN', { index: index + 1 })} ${text}`}
                        onClick={() => select(index)}
                      >
                        <span className="grip" aria-hidden="true">
                          ⋮⋮
                        </span>
                        <span className="letter">{index + 1}</span>
                        <span className="question-item-text">{text}</span>
                        <LikeCount count={likes?.questions[question.id]} />
                        {round.type === 'wipeout' && <span className="question-item-price">{question.points}</span>}
                        {round.type === 'ladder' && (
                          <span className="question-item-price">
                            {round.safe.includes(index) && <span role="img" aria-label={t('ladderSafeMark')}>🛡 </span>}
                            {round.levels[index]}
                          </span>
                        )}
                        <span className="question-item-type">{t(`typeShort_${question.type}`)}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>

              {groupDraftPlace(round) === 'list' ? (
                <div className="editor-add-row">
                  <button type="button" className="btn btn-dashed" disabled={!roomForMore} onClick={add}>
                    {t('addQuestion')}
                  </button>
                  <button type="button" className="btn btn-dashed" disabled={!roomForMore} onClick={() => setPickerOpen(true)}>
                    {t('groupFromButton')}
                  </button>
                </div>
              ) : (
                <button type="button" className="btn btn-dashed" disabled={!roomForMore} onClick={add}>
                  {t('addQuestion')}
                </button>
              )}
              {pickerOpen && (
                <GroupPicker
                  target={{ types: questionTypesFor(round.type), booleans: booleanCounts(questions) }}
                  onPick={addFromGroup}
                  onClose={() => setPickerOpen(false)}
                />
              )}
            </>
          )}
        </aside>

        {round.type === 'truth' ? (
          <section className="editor-stage">
            <p className="meta truth-editor-note">{t('truthEditorNote')}</p>
          </section>
        ) : round.type === 'board' ? (
          <section className="editor-stage">
            <BoardEditor
              likes={likes?.questions}
              key={round.id}
              round={round}
              focus={boardFocus}
              roomForMore={total < LIMITS.maxQuizQuestions}
              roomForCategory={total + LIMITS.minCategoryQuestions <= LIMITS.maxQuizQuestions}
              swapOn={settings.buffs?.includes('swap') ?? false}
              legacySpares={gaps.legacyBoard}
              onChange={setRound}
            />
          </section>
        ) : (
          <section className="editor-stage" aria-label={t('questionN', { index: selected + 1 })}>
            <QuestionEditor
              key={current.id}
              question={current}
              showPoints={round.type !== 'final' && round.type !== 'bets' && round.type !== 'ladder'}
              showReveal={round.type === 'classic'}
              showTime={round.type !== 'ladder' || round.timer}
              fixedOptions={round.type === 'ladder' ? LIMITS.ladderOptions : undefined}
              types={questionTypesFor(round.type)}
              clouds={cloudSources(quiz, ri, Math.min(selected, questions.length - 1))}
              allowCloud={round.type === 'classic'}
              betsCut={round.type === 'bets' ? true : round.type === 'auction' ? 'auction' : false}
              onChange={(next) => setQuestions(questions.map((question, index) => (index === selected ? next : question)))}
            />
            {round.type !== 'final' && (
            <div className="toolbar">
              <button type="button" className="btn btn-small" disabled={!roomForMore} onClick={duplicate}>
                {t('duplicate')}
              </button>
              <button
                type="button"
                className="btn btn-small"
                aria-label={t('moveQuestionUp', { index: selected + 1 })}
                disabled={selected === 0}
                onClick={() => move(selected, selected - 1)}
              >
                {t('moveUpShort')}
              </button>
              <button
                type="button"
                className="btn btn-small"
                aria-label={t('moveQuestionDown', { index: selected + 1 })}
                disabled={selected === last}
                onClick={() => move(selected, selected + 1)}
              >
                {t('moveDownShort')}
              </button>
              <button
                type="button"
                className="btn btn-small btn-danger"
                aria-label={t('removeQuestion', { index: selected + 1 })}
                disabled={questions.length === 1 || (round.type === 'wipeout' && questions.length <= LIMITS.minWipeoutQuestions) || (round.type === 'survival' && questions.length <= LIMITS.minSurvivalQuestions) || (round.type === 'ladder' && questions.length <= LIMITS.minLadderQuestions)}
                title={
                  round.type === 'wipeout' && questions.length <= LIMITS.minWipeoutQuestions
                    ? t('wipeoutMinHint', { min: LIMITS.minWipeoutQuestions })
                    : round.type === 'survival' && questions.length <= LIMITS.minSurvivalQuestions
                      ? t('survivalMinHint', { min: LIMITS.minSurvivalQuestions })
                      : round.type === 'ladder' && questions.length <= LIMITS.minLadderQuestions
                        ? t('ladderMinHint', { min: LIMITS.minLadderQuestions })
                        : undefined
                }
                onClick={remove}
              >
                {t('remove')}
              </button>
            </div>
            )}
          </section>
        )}
      </div>

      {/* Повідомлення живуть у закріпленій панелі: їх видно, хоч би де була прокрутка. */}
      <footer className="actions">
        {problems.length > 0 && (
          <ul className="error problems" role="alert">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}
        <button type="button" className="btn" onClick={cancel}>
          {t('cancel')}
        </button>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
          {t(saving ? 'saving' : 'save')}
        </button>
      </footer>
    </main>
  );
}
