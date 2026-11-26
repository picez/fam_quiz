import type { PublicQuestion, SoloWatch } from '@quiz/shared';
import { t } from '../i18n';
import { ChainWords } from './ChainView';
import { LetterTiles } from './LetterWordsView';
import { TimedListCells } from './TimedListView';
import { WordLadderColumn, WordLadderGoal } from './WordLadderView';

/**
 * Живий показ того, хто відповідає сам (клітинка поля, продане запитання «Аукціону»): ім'я й зроблене ним — знахідки списку,
 * слова драбини, слова з літер, пройдені слова ланцюжка. Глядачам телефонів і сцені; stage — на сцені ціль драбини, плитки набору
 * й слова ланцюжка вже стоять під запитанням, тож тут їх не повторюємо; named — false, коли «Відповідає …» екран уже пише над запитанням.
 */
export function SoloWatchView({ solo, question, stage = false, named = true }: { solo: SoloWatch; question: PublicQuestion; stage?: boolean; named?: boolean }) {
  const progress = solo.progress;
  return (
    <section className={`solo-watch solo-watch-${progress.kind}`} aria-live="polite">
      {named && <p className="lead solo-watch-name">{t('boardAnswering', { name: solo.nickname })}</p>}
      {progress.kind === 'timedlist' && (
        <>
          <p className="meta solo-watch-count">
            <bdi dir="ltr">{t('listCount', { found: progress.found.length, total: progress.total })}</bdi>
            {progress.wrong > 0 && <span className="tag timedlist-wrong">{t('listWrong', { wrong: progress.wrong })}</span>}
          </p>
          <TimedListCells total={progress.total} found={progress.found} />
        </>
      )}
      {progress.kind === 'wordladder' && question.wordladder !== undefined && (
        <>
          {!stage && <WordLadderGoal start={question.wordladder.start} target={question.wordladder.target} />}
          <WordLadderColumn start={question.wordladder.start} target={question.wordladder.target} words={progress.words} letters={question.wordladder.letters} />
          <p className="meta solo-watch-count">{progress.finished ? t('wordLadderAnswerDone', { steps: progress.words.length }) : t('wordLadderLiveSteps', { steps: progress.words.length })}</p>
        </>
      )}
      {progress.kind === 'letterwords' && (
        <>
          {!stage && question.letterwords !== undefined && <LetterTiles letters={question.letterwords.letters} />}
          <p className="meta solo-watch-count">{t('lettersLive', { n: progress.words.length })}</p>
          {progress.words.length > 0 && (
            <ol className="solo-watch-words" lang="uk" dir="auto">
              {[...progress.words].reverse().map((word) => (
                <li key={word.text}>
                  <span className="letterwords-word">{word.text}</span>
                  <span className="tag">{t('lettersLength', { n: word.letters })}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
      {progress.kind === 'chain' && (
        <>
          <p className="meta solo-watch-count">
            <bdi dir="ltr">{t('chainRowWords', { solved: progress.solved, total: progress.total })}</bdi>
            {progress.hints > 0 && <span className="tag">{t('chainHints', { count: progress.hints })}</span>}
          </p>
          {!stage && question.chain !== null && <ChainWords first={question.chain.first} masks={progress.masks} current={progress.solved} />}
        </>
      )}
    </section>
  );
}
