import { LIMITS, allowedBuffs, questionsOf, roundQuestions, roundTrials, type Question, type QuestionBankItem, type Quiz, type QuizLikes, type Round } from '@quiz/shared';
import { useDeferredValue, useEffect, useMemo, useReducer, useRef, useState, type FocusEvent } from 'react';
import { EditorCard } from './EditorCard';
import { IssuesPanel } from './IssuesPanel';
import { remindersOf } from './reminders';
import { isTouched, touchKey, touchReducer, UNTOUCHED } from './touched';
import { generalSummaries } from './summaries';
import { questionName } from '../format';
import { t } from '../i18n';
import {
  booleanCounts,
  cleaned,
  cloudSources,
  bankCopy,
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
  newThinkQuestion,
  newThinkRound,
  newClassicRound,
  newQuestion,
  placedPoints,
  placedProblemsOf,
  tabOf,
  type GeneralCard,
  type IssuePlace,
  questionTypesFor,
  roundCapacity,
  swapGaps,
} from './draft';
import { BoardEditor } from './BoardEditor';
import { GroupPicker } from '../groups/GroupPicker';
import { QuestionBank } from './QuestionBank';
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
  /** Збережена вікторина, що редагується: у банку запитань її рядки позначені «ця вікторина». */
  quizId?: string;
  /** Керована вкладка (адреса); без неї редактор тримає вкладку сам, типово «Раунди й запитання». */
  tab?: EditorTab;
  onTabChange?: (tab: EditorTab) => void;
}

export type EditorTab = 'general' | 'rounds';

/**
 * Редактор «список і сцена»: зверху назва й правила, далі раунди; ліворуч список запитань, праворуч одне запитання
 * таким, яким його побачать гравці. На вузькому екрані список ховається за кнопку.
 */
export function QuizEditor({ initial, heading, notice = null, onDraft, onSave, onCancel, likes, quizId, tab, onTabChange }: Props) {
  const [quiz, setQuiz] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [roundIndex, setRoundIndex] = useState(0);
  const [selected, setSelected] = useState(0);
  const [listOpen, setListOpen] = useState(false);
  /** Панель «Запитання з групи» відкрита (12l). */
  const [pickerOpen, setPickerOpen] = useState(false);
  /** Панель «Банк запитань» відкрита (38f). */
  const [bankOpen, setBankOpen] = useState(false);
  const groupDrafts = useGroupDrafts();
  /** Остання спроба зберегти не вдалася через помилки: у нижній панелі рядок «Не збережено». */
  const [saveFailed, setSaveFailed] = useState(false);
  /** Помилка сервера з onSave. */
  const [serverError, setServerError] = useState<string | null>(null);
  /** Панель «⚠ N» відкрита. */
  const [issuesOpen, setIssuesOpen] = useState(false);
  /** Куди прокрутити й поставити фокус після переходу до місця проблеми (селектор цілі). */
  const [jump, setJump] = useState<{ selector: string } | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  /** Розділ «Дуелі» розгорнуто: автором або помилкою в ньому. */
  const [duelsOpen, setDuelsOpen] = useState(false);
  /** Розділ «Запасні запитання» розгорнуто: автором або помилкою в ньому. */
  const [sparesOpen, setSparesOpen] = useState(false);
  /** Розділ «Бафи й дебафи» розгорнуто. */
  const [powersOpen, setPowersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ownTab, setOwnTab] = useState<EditorTab>('rounds');
  const currentTab = tab ?? ownTab;
  /** Єдиний спосіб перемкнути вкладку: і внутрішній стан, і адреса. */
  const showTab = (next: EditorTab) => {
    leaveQuestion();
    if (currentTab === 'general' && next !== 'general') touch({ type: 'leave', key: touchKey.general });
    setOwnTab(next);
    onTabChange?.(next);
  };
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
  // Живий підрахунок: від відкладеної копії, щоб набір тексту у великій вікторині не гальмував.
  const deferredQuiz = useDeferredValue(quiz);
  const errors = useMemo(() => placedProblemsOf(deferredQuiz), [deferredQuiz]);
  const reminders = useMemo(() => remindersOf(deferredQuiz), [deferredQuiz]);
  const tabErrors = (id: EditorTab) => errors.filter((problem) => tabOf(problem.place) === id).length;
  /** «Торкнуті» місця: червоне видно лише там, де автор щось змінив і вийшов, або після спроби зберегти. */
  const [touched, touch] = useReducer(touchReducer, UNTOUCHED);
  const visible = useMemo(() => {
    const seen = (key: string) => isTouched(touched, key);
    const roundTouched = (r: number) => {
      const target = deferredQuiz.rounds[r];
      if (target === undefined) return false;
      return seen(touchKey.round(target.id)) || [...roundQuestions(target), ...roundTrials(target)].some((q) => seen(touchKey.question(q.id)));
    };
    const shown = errors.filter(({ place }) => {
      if (place.kind === 'title') return seen(touchKey.title);
      if (place.kind === 'general') return seen(touchKey.general);
      if (place.kind === 'quiz') return touched.all;
      if (place.kind === 'question' || place.kind === 'cell') {
        const id = questionIdAt(deferredQuiz, place);
        return id !== null && seen(touchKey.question(id));
      }
      return roundTouched(place.round);
    });
    /** id запитань і клітинок із видимою помилкою. */
    const questionIds = new Set<string>();
    for (const { place } of shown) {
      const id = place.kind === 'question' || place.kind === 'cell' ? questionIdAt(deferredQuiz, place) : null;
      if (id !== null) questionIds.add(id);
    }
    const softIds = new Set<string>();
    for (const { place } of reminders) {
      const id = place.kind === 'question' || place.kind === 'cell' ? questionIdAt(deferredQuiz, place) : null;
      if (id !== null) softIds.add(id);
    }
    const flagged = new Set(shown.flatMap(({ place }) => ('round' in place ? [place.round] : [])));
    return { shown, questionIds, softIds, flagged };
  }, [errors, reminders, touched, deferredQuiz]);
  /** Перша видима помилка запитання чи клітинки з цим id. */
  const issueOf = (questionId: string) => {
    for (const { text, place } of visible.shown) {
      if ((place.kind === 'question' || place.kind === 'cell') && questionIdAt(deferredQuiz, place) === questionId) return { card: place.card, text };
    }
    return null;
  };
  const generalError = (card: GeneralCard) => {
    const texts = visible.shown.filter(({ place }) => place.kind === 'general' && place.card === card).map((problem) => problem.text);
    return texts.length === 0 ? null : texts.slice(0, 3).join('; ');
  };
  const settingsErrors = visible.shown.filter(({ place }) => place.kind === 'round' && place.settings && place.round === ri).map((problem) => problem.text);
  const titleError = visible.shown.find(({ place }) => place.kind === 'title')?.text ?? null;

  // Після переходу до місця: прокрутити ціль у поле зору й поставити фокус на її перше поле.
  useEffect(() => {
    if (jump === null) return;
    setJump(null);
    const target = document.querySelector<HTMLElement>(jump.selector);
    if (target === null) return;
    target.scrollIntoView?.({ block: 'center' });
    target.querySelector<HTMLElement>('input, textarea, select')?.focus();
  }, [jump]);

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
    setSaveFailed(false);
    setServerError(null);
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
  const summaries = generalSummaries(quiz);
  const roomForMore = questions.length < roundCapacity(round) && total < LIMITS.maxQuizQuestions;
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

  /** Автор покинув поточне запитання (інше запитання, раунд, вкладка, перенесення): змінене стає «торкнутим». */
  const leaveQuestion = () => {
    if (current !== undefined) touch({ type: 'leave', key: touchKey.question(current.id) });
  };
  /** Фокус вийшов за межі контейнера (не на інше його поле). */
  const focusLeft = (event: FocusEvent<HTMLElement>, container: Element | null) =>
    container !== null && !(event.relatedTarget instanceof Node && container.contains(event.relatedTarget));

  const select = (index: number) => {
    leaveQuestion();
    setSelected(index);
    setListOpen(false);
  };

  /** Переносить запитання на нове місце; виділення лишається на тому, що було вибране. */
  const move = (from: number, to: number) => {
    const next = moveItem(questions, from, to);
    if (next === questions) return;
    leaveQuestion();
    const picked = questions[selected];
    setQuestions(next);
    setSelected(next.indexOf(picked));
  };

  const remove = () => {
    const hasText = current.text.trim() !== '';
    if (hasText && !window.confirm(t('removeQuestionConfirm', { index: selected + 1 }))) return;
    leaveQuestion();
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
    // У «Головоломках» нове запитання — згенероване судоку (інших типів там немає); у «Думай інакше» — лише «Слово на тему».
    setQuestions([...questions, round.type === 'think' ? newThinkQuestion() : round.type === 'wipeout' ? newWipeoutQuestion(questions[last]) : round.type === 'survival' ? { ...newQuestion('single'), points: 100 } : newQuestion(round.type === 'puzzles' ? 'sudoku' : 'single')]);
    select(questions.length);
  };

  /** Чернетка із запису групи — в кінець списку, як «Додати запитання», і з тією самою ціною (12l). */
  const addFromGroup = (draft: GroupDraft, source: { groupId: string; itemId: string }) => {
    const points = placedPoints(round, questions[last], draft.question);
    const question = { ...draft.question, points } as Question;
    setQuestions([...questions, question]);
    select(questions.length);
    groupDrafts?.add(question.id, { ...source, notes: draft.notes });
  };

  /** Копії позначених запитань банку — в кінець раунду; виділення на першій копії. */
  const copyFromBank = (picks: QuestionBankItem[]) => {
    let after = questions[last];
    const added: Question[] = [];
    for (const pick of picks) {
      const fit = bankCopy(quiz, ri, pick.question, after);
      if (!('question' in fit)) continue;
      added.push(fit.question);
      after = fit.question;
    }
    setBankOpen(false);
    if (added.length === 0 || round.type === 'board' || round.type === 'truth') return;
    const next = [...questions, ...added];
    if (round.type === 'ladder') setRound(resizeLadder({ ...round, questions: next }, next.length));
    else setQuestions(next);
    select(questions.length);
  };

  const duplicate = () => {
    const next = [...questions];
    next.splice(selected + 1, 0, duplicateQuestion(current));
    setQuestions(next);
    select(selected + 1);
  };

  const selectRound = (index: number) => {
    leaveQuestion();
    touch({ type: 'leave', key: touchKey.round(round.id) });
    setRoundIndex(index);
    setSelected(0);
    setBoardFocus(null);
    setListOpen(false);
  };

  const addRound = (type: Round['type']) => {
    const fresh =
      type === 'blitz' ? newBlitzRound() : type === 'board' ? newBoardRound() : type === 'final' ? newFinalRound() : type === 'bets' ? newBetsRound() : type === 'auction' ? newAuctionRound() : type === 'truth' ? newTruthRound() : type === 'puzzles' ? newPuzzlesRound() : type === 'wipeout' ? newWipeoutRound() : type === 'survival' ? newSurvivalRound() : type === 'ladder' ? newLadderRound() : type === 'quest' ? newQuestRound() : type === 'think' ? newThinkRound() : newClassicRound();
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

  /** Відкриває розділ «Загального» з цією карткою (згортані — розгортає). */
  const openGeneralCard = (card: GeneralCard) => {
    if (card === 'powers') setPowersOpen(true);
    if (card === 'spares') setSparesOpen(true);
    if (card === 'duels') setDuelsOpen(true);
  };

  /** Перехід до місця проблеми чи нагадування: вкладка, раунд, запитання чи клітинка, потрібна картка. */
  const goTo = (place: IssuePlace) => {
    setIssuesOpen(false);
    if (place.kind === 'title') {
      titleRef.current?.scrollIntoView?.({ block: 'center' });
      titleRef.current?.focus();
      return;
    }
    if (place.kind === 'general') {
      showTab('general');
      openGeneralCard(place.card);
      setJump({ selector: `#editor-card-${place.card}` });
      return;
    }
    showTab('rounds');
    if (place.kind === 'quiz') return;
    selectRound(Math.min(place.round, rounds.length - 1));
    if (place.kind === 'round') {
      if (place.settings) setSettingsOpen(true);
      setJump({ selector: '.round-bar-row' });
    } else if (place.kind === 'question') {
      setSelected(place.question);
      setJump({ selector: `.editor-stage [data-card="${place.card}"]` });
    } else if (place.kind === 'cell') {
      setBoardFocus({ category: place.category, index: place.index });
      setJump({ selector: `.editor-stage [data-card="${place.card}"]` });
    } else {
      setBoardFocus({ category: place.category, index: 0 });
      setJump({ selector: '.editor-stage' });
    }
  };

  /** «Показати» в нижній панелі: відкриває панель і прокручує шапку в поле зору. */
  const showIssues = () => {
    setIssuesOpen(true);
    headRef.current?.scrollIntoView?.({ block: 'nearest' });
  };

  const cancel = () => {
    if (dirty && !window.confirm(t('discardConfirm'))) return;
    onCancel();
  };

  const save = async () => {
    const found = placedProblemsOf(quiz);
    setServerError(null);
    if (found.length > 0) {
      setSaveFailed(true);
      touch({ type: 'all' });
      for (const { place } of found) {
        if (place.kind === 'general') openGeneralCard(place.card);
        if (place.kind === 'round' && place.settings) setSettingsOpen(true);
      }
      // Показати запитання, яке треба виправити: воно може бути далеко у списку.
      const broken = firstProblem(quiz);
      if (broken !== null) {
        setRoundIndex(broken.round);
        setSelected(broken.question);
        setBoardFocus(broken.cell === null ? null : { ...broken.cell });
      }
      const tabs = found.map((problem) => tabOf(problem.place));
      if (tabs.includes('rounds')) showTab('rounds');
      else if (tabs.includes('general')) showTab('general');
      return;
    }
    setSaveFailed(false);
    setSaving(true);
    const error = await onSave(cleaned(quiz));
    setSaving(false);
    if (error === null) setDirty(false);
    else setServerError(error);
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
          <input
            ref={titleRef}
            value={quiz.title}
            maxLength={120}
            aria-invalid={titleError !== null ? true : undefined}
            aria-describedby={titleError !== null ? 'editor-title-error' : undefined}
            onChange={(event) => {
              touch({ type: 'edit', key: touchKey.title });
              update({ ...quiz, title: event.target.value });
            }}
            onBlur={() => touch({ type: 'leave', key: touchKey.title })}
          />
        </label>
        {titleError !== null && (
          <p className="error field-error" id="editor-title-error">
            {titleError}
          </p>
        )}
      </section>

      <div className="issues-bar" ref={headRef}>
        <div className="issues">
          {errors.length + reminders.length === 0 ? (
            <button type="button" className="btn btn-small issues-button is-clear" aria-disabled="true">
              {t('issuesNone')}
            </button>
          ) : (
            <button
              type="button"
              className={errors.length > 0 ? 'btn btn-small issues-button has-errors' : 'btn btn-small issues-button'}
              aria-expanded={issuesOpen}
              aria-controls="editor-issues"
              // Інакше натискання закрило б панель як «клік поза нею», а клік — одразу відкрив би знову.
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setIssuesOpen(!issuesOpen)}
            >
              {t('issuesButton', { errors: errors.length, reminders: reminders.length })}
            </button>
          )}
          {issuesOpen && errors.length + reminders.length > 0 && (
            <IssuesPanel id="editor-issues" errors={errors} reminders={reminders} onGo={goTo} onClose={() => setIssuesOpen(false)} />
          )}
        </div>
      </div>

      <div className="editor-tabs" role="tablist" aria-label={t('editorTabs')}>
        {(['general', 'rounds'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`editor-tab-${id}`}
            className={id === currentTab ? 'editor-tab is-on' : 'editor-tab'}
            aria-selected={id === currentTab}
            aria-controls={`editor-panel-${id}`}
            onClick={() => showTab(id)}
          >
            {t(id === 'general' ? 'editorTabGeneral' : 'editorTabRounds')}
            {tabErrors(id) > 0 && (
              <span className="editor-tab-badge" role="img" aria-label={t('editorTabErrors', { count: tabErrors(id) })}>
                {`⚠${tabErrors(id)}`}
              </span>
            )}
          </button>
        ))}
      </div>

      {currentTab === 'general' ? (
        <div
          className="editor-general"
          role="tabpanel"
          id="editor-panel-general"
          aria-labelledby="editor-tab-general"
          onChange={() => touch({ type: 'edit', key: touchKey.general })}
          onBlur={(event) => {
            if (focusLeft(event, event.currentTarget)) touch({ type: 'leave', key: touchKey.general });
          }}
        >
          <EditorCard card="about" id="editor-card-about" error={generalError('about')} title={t('cardAbout')}>
            <label className="field">
              <span>{t('quizDescription')}</span>
              <textarea
                rows={2}
                value={quiz.description}
                maxLength={500}
                onChange={(event) => update({ ...quiz, description: event.target.value })}
              />
            </label>
          </EditorCard>

          <EditorCard card="rules" id="editor-card-rules" error={generalError('rules')} title={t('cardRules')} className="rules">
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
          </EditorCard>

          <EditorCard card="teams" id="editor-card-teams" error={generalError('teams')} title={t('teamsTitle')} className="teams">
            <TeamsEditor teams={settings.teams} onChange={setTeams} />
          </EditorCard>

          <EditorCard card="powers" id="editor-card-powers" error={generalError('powers')} title={t('powersTitle')} className="rules powers" summary={summaries.powers} fold={{ open: powersOpen, onToggle: setPowersOpen }}>
            <PowersEditor settings={settings} family={settings.family === true} spares={quiz.spares} gaps={gaps} onChange={(powers) => setSettings(powers)} />
          </EditorCard>

          <EditorCard card="spares" id="editor-card-spares" error={generalError('spares')} title={t('sparesTitle')} className="rules spares" summary={summaries.spares} fold={{ open: sparesOpen, onToggle: setSparesOpen }}>
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
          </EditorCard>

          <EditorCard card="duels" id="editor-card-duels" error={generalError('duels')} title={t('duelsTitle')} className="rules duels" summary={summaries.duels} fold={{ open: duelsOpen, onToggle: setDuelsOpen }}>
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
          </EditorCard>
        </div>
      ) : (
        <div role="tabpanel" id="editor-panel-rounds" aria-labelledby="editor-tab-rounds">
        <div
          className="round-bar-row"
          onBlur={(event) => {
            const details = event.target instanceof Element ? event.target.closest('details.round-settings') : null;
            if (focusLeft(event, details)) touch({ type: 'leave', key: touchKey.round(round.id) });
          }}
        >
        <RoundStrip
          rounds={rounds}
          selected={ri}
          onSelect={selectRound}
          onAdd={addRound}
          onRename={renameRound}
          onMove={moveRound}
          onRemove={removeRound}
          flagged={visible.flagged}
        />
        <RoundSettings round={round} index={ri + 1} total={total} buffs={allowedBuffs(quiz)} lastRound={ri === rounds.length - 1}
          onChange={(next) => {
            touch({ type: 'edit', key: touchKey.round(round.id) });
            setRound(next);
          }}
          open={settingsOpen}
          onToggle={setSettingsOpen}
          flagged={settingsErrors.length > 0}
          errors={settingsErrors}
        />
        </div>

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
                    // 61: «Вгадай слово» без тексту зветься словом («Вгадай слово: ОЖИНА»), поки слова немає — типом.
                    const name = question.type === 'wordle' ? (question.word.trim() === '' ? t('type_wordle') : questionName(question)) : question.text;
                    const text = name.trim() === '' ? t('untitled') : name;
                    // ⚠ — видима помилка; ⓘ — лише нагадування (їх видно завжди, вони не червоні).
                    const mark = visible.questionIds.has(question.id) ? 'is-error' : visible.softIds.has(question.id) ? 'is-soft' : null;
                    const markId = `question-mark-${question.id}`;
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
                          aria-describedby={mark !== null ? markId : undefined}
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
                          {mark !== null && (
                            <span className={`question-item-mark ${mark}`} id={markId} role="img" aria-label={t(mark === 'is-error' ? 'markError' : 'markReminder')}>
                              {mark === 'is-error' ? '⚠' : 'ⓘ'}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ol>

                <div className="editor-add-row">
                  <button type="button" className="btn btn-dashed" disabled={!roomForMore} onClick={add}>
                    {t('addQuestion')}
                  </button>
                  {groupDraftPlace(round) === 'list' && (
                    <button type="button" className="btn btn-dashed" disabled={!roomForMore} onClick={() => setPickerOpen(true)}>
                      {t('groupFromButton')}
                    </button>
                  )}
                  <button type="button" className="btn btn-dashed" disabled={!roomForMore} onClick={() => setBankOpen(true)}>
                    {t('bankButton')}
                  </button>
                </div>
                {bankOpen && (
                  <QuestionBank
                    types={questionTypesFor(round.type)}
                    room={Math.max(0, Math.min(roundCapacity(round) - questions.length, LIMITS.maxQuizQuestions - total))}
                    quizId={quizId}
                    fit={(question) => bankCopy(quiz, ri, question, questions[last])}
                    onCopy={copyFromBank}
                    onClose={() => setBankOpen(false)}
                  />
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
                cellIssue={issueOf}
                onCellEdit={(id) => touch({ type: 'edit', key: touchKey.question(id) })}
                onCellLeave={(id) => touch({ type: 'leave', key: touchKey.question(id) })}
                onChange={setRound}
              />
            </section>
          ) : (
            <section className="editor-stage" aria-label={t('questionN', { index: selected + 1 })}>
              <QuestionEditor
                key={current.id}
                question={current}
                showPoints={round.type !== 'final' && round.type !== 'bets' && round.type !== 'ladder' && round.type !== 'think'}
                showReveal={round.type === 'classic'}
                showTime={round.type !== 'ladder' || round.timer}
                fixedOptions={round.type === 'ladder' ? LIMITS.ladderOptions : undefined}
                types={questionTypesFor(round.type)}
                clouds={cloudSources(quiz, ri, Math.min(selected, questions.length - 1))}
                allowCloud={round.type === 'classic'}
                betsCut={round.type === 'bets' ? true : round.type === 'auction' ? 'auction' : false}
                issue={issueOf(current.id)}
                onChange={(next) => {
                  touch({ type: 'edit', key: touchKey.question(current.id) });
                  setQuestions(questions.map((question, index) => (index === selected ? next : question)));
                }}
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
                  disabled={questions.length === 1 || (round.type === 'think' && questions.length <= LIMITS.minThinkQuestions) || (round.type === 'wipeout' && questions.length <= LIMITS.minWipeoutQuestions) || (round.type === 'survival' && questions.length <= LIMITS.minSurvivalQuestions) || (round.type === 'ladder' && questions.length <= LIMITS.minLadderQuestions)}
                  title={
                    round.type === 'think' && questions.length <= LIMITS.minThinkQuestions
                      ? t('thinkMinHint', { min: LIMITS.minThinkQuestions })
                      : round.type === 'wipeout' && questions.length <= LIMITS.minWipeoutQuestions
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
        </div>
      )}

      {/* Повідомлення живуть у закріпленій панелі: їх видно, хоч би де була прокрутка. */}
      <footer className="actions">
        {saveFailed && errors.length > 0 ? (
          <p className="error" role="alert">
            {t('saveBlocked', { count: errors.length })}{' '}
            <button type="button" className="btn btn-small btn-quiet" onClick={showIssues}>
              {t('saveBlockedShow')}
            </button>
          </p>
        ) : serverError !== null ? (
          <p className="error" role="alert">
            {serverError}
          </p>
        ) : null}
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

/** id запитання чи клітинки, на яку вказує місце; null — місця вже немає. */
function questionIdAt(quiz: Quiz, place: Extract<IssuePlace, { kind: 'question' | 'cell' }>): string | null {
  const target = quiz.rounds[place.round];
  if (target === undefined) return null;
  if (place.kind === 'cell') return target.type === 'board' ? (target.categories[place.category]?.cells[place.index]?.question.id ?? null) : null;
  return target.type === 'board' || target.type === 'truth' ? null : (target.questions[place.question]?.id ?? null);
}
