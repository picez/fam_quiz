import type { PrizeContent, TrophyDecor } from '@quiz/shared';
import { useEffect, useMemo, useReducer, useRef, useState, type JSX, type KeyboardEvent } from 'react';
import { t, type TextKey } from '../i18n';
import { webglAvailable } from '../trophy/loadEngine';
import { TrophyView, type TrophyViewHandle } from '../trophy/TrophyView';
import { contentOf, draftFrom, studioIssues, studioLook, studioReducer, type StudioAction, type StudioDraft, type StudioIssue } from './studio-draft';
import { PhotoTool } from './tools/PhotoTool';
import { PrizeTool } from './tools/PrizeTool';
import { ShapeTool } from './tools/ShapeTool';
import { TextTool } from './tools/TextTool';
import { useSettled } from './useSettled';

export type StudioTool = 'shape' | 'photos' | 'texts' | 'effects' | 'appear' | 'prize';

/** Те, що отримує кожен інструмент шухляди. typing — дія з текстового поля: кубок оновиться, коли набір стихне. */
export interface ToolProps {
  draft: StudioDraft;
  dispatch: (action: StudioAction, typing?: boolean) => void;
  level: number;
  replay: () => void;
  /** Збережене оформлення цього призу: його шрифти й наліпки лишаються чинними, навіть закриті за рівнем (як на сервері). */
  stored?: TrophyDecor | null;
}

export interface PrizeStudioProps {
  initial: PrizeContent | null;
  /** Зарезервований приз: без «Зберегти» й без інструментів, лише studioReadOnly. */
  readOnly: boolean;
  level: number;
  busy: boolean;
  error: string | null;
  onSave: (content: PrizeContent) => void;
  onCancel: () => void;
}

const TOOLS: readonly StudioTool[] = ['shape', 'photos', 'texts', 'effects', 'appear', 'prize'];
const TOOL_LABEL: Record<StudioTool, TextKey> = {
  shape: 'studioToolShape',
  photos: 'studioToolPhotos',
  texts: 'studioToolTexts',
  effects: 'studioToolEffects',
  appear: 'studioToolAppear',
  prize: 'studioToolPrize',
};
const TOOL_ICON: Record<StudioTool, string> = { shape: '🏆', photos: '📷', texts: '✒️', effects: '✨', appear: '🎬', prize: '🎁' };
/** Інструменти, що оформлюють сам трофей: без трофея їм нічого робити. */
const NEEDS_TROPHY: readonly StudioTool[] = ['photos', 'texts', 'effects', 'appear'];
/** Ефекти й поява (задача 11) — поки що порожні панелі. */
const PANELS: Record<StudioTool, ((props: ToolProps) => JSX.Element) | null> = {
  shape: ShapeTool,
  photos: PhotoTool,
  texts: TextTool,
  effects: null,
  appear: null,
  prize: PrizeTool,
};

const ISSUE_TEXT: Record<StudioIssue, TextKey> = {
  prize_empty: 'err_prize_empty',
  name: 'prizeNameRequired',
  decor_text_length: 'err_decor_text_length',
  decor_too_many_photos: 'err_decor_too_many_photos',
  decor_plaque_twice: 'err_decor_plaque_twice',
  fill: 'prizeFillOptions',
};

const ROTATE_HINT = 'studio-rotate-hint';

interface Edit {
  draft: StudioDraft;
  typing: boolean;
}

function editReducer(state: Edit, { action, typing }: { action: StudioAction; typing: boolean }): Edit {
  return { draft: studioReducer(state.draft, action), typing };
}

/**
 * Повноекранний редактор призу (варіант C): кубок на всю сцену крутиться пальцем, знизу (на широкому — праворуч)
 * шухляда з шістьма інструментами. Кожна зміна одразу на кубку; набір тексту — коли стихне (300 мс).
 */
export function PrizeStudio({ initial, readOnly, level, busy, error, onSave, onCancel }: PrizeStudioProps): JSX.Element {
  const start = useMemo(() => draftFrom(initial), [initial]);
  const [{ draft, typing }, send] = useReducer(editReducer, { draft: start, typing: false });
  const dispatch = useMemo(() => (action: StudioAction, typing = false) => send({ action, typing }), []);
  const [tool, setTool] = useState<StudioTool>(initial === null ? 'shape' : 'prize');
  const [open, setOpen] = useState(true);
  const tabRefs = useRef<Partial<Record<StudioTool, HTMLButtonElement | null>>>({});
  const trophyRef = useRef<TrophyViewHandle>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [webgl] = useState(webglAvailable);

  const draftLook = useMemo(() => studioLook(draft), [draft]);
  const look = useSettled(draftLook, typing ? 300 : 0);
  const content = useMemo(() => contentOf(draft, initial), [draft, initial]);
  const issues = useMemo(() => studioIssues(content), [content]);
  const changed = useMemo(() => JSON.stringify(draft) !== JSON.stringify(start), [draft, start]);

  // Полотно кладе рушій усередину TrophyView: підказку про поворот чіпляємо до нього, щойно воно з'явиться.
  const hasTrophy = look !== null;
  useEffect(() => {
    const box = stage.current;
    if (box === null || !hasTrophy) return;
    const describe = () => box.querySelectorAll('canvas').forEach((canvas) => canvas.setAttribute('aria-describedby', ROTATE_HINT));
    describe();
    const observer = new MutationObserver(describe);
    observer.observe(box, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [hasTrophy]);

  const cancel = () => {
    if (!readOnly && changed && !window.confirm(t('studioLeaveConfirm'))) return;
    onCancel();
  };

  const pick = (next: StudioTool) => {
    if (next === tool) setOpen((value) => !value);
    else {
      setTool(next);
      setOpen(true);
    }
  };

  const move = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = TOOLS.indexOf(tool);
    const rtl = document.documentElement.dir === 'rtl';
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    let target: StudioTool | null = null;
    if (step !== 0) target = TOOLS[(index + (rtl ? -step : step) + TOOLS.length) % TOOLS.length]!;
    else if (event.key === 'Home') target = TOOLS[0]!;
    else if (event.key === 'End') target = TOOLS[TOOLS.length - 1]!;
    if (target === null) return;
    event.preventDefault();
    setTool(target);
    setOpen(true);
    tabRefs.current[target]?.focus();
  };

  const toolProps: ToolProps = { draft, dispatch, level, replay: () => trophyRef.current?.replayAppearance(), stored: initial?.trophy?.decor ?? null };
  const blocked = draft.trophy === null && NEEDS_TROPHY.includes(tool);
  const Panel = PANELS[tool];
  const title = readOnly ? 'studioViewTitle' : initial === null ? 'studioNewTitle' : 'studioEditTitle';

  return (
    <div className="prize-studio">
      <header className="studio-head">
        <button type="button" className="btn btn-small" disabled={busy} onClick={cancel}>
          {t(readOnly ? 'profileBack' : 'cancel')}
        </button>
        <h1 className="studio-title">{t(title)}</h1>
        {!readOnly && (
          <button type="button" className="btn btn-small btn-primary" disabled={busy || issues.length > 0} onClick={() => onSave(content)}>
            {t('save')}
          </button>
        )}
      </header>

      <div className="studio-stage" ref={stage}>
        {look === null ? (
          <div className="studio-no-trophy">
            <span className="studio-no-trophy-icon" aria-hidden="true">
              🎁
            </span>
            <p className="meta">{t('studioNoTrophyHint')}</p>
          </div>
        ) : (
          <>
            <TrophyView ref={trophyRef} trophy={look} size="view" spin={false} interactive appear={false} />
            <p className="sr-only" id={ROTATE_HINT}>
              {t('studioRotateHint')}
            </p>
          </>
        )}
      </div>

      <section className="studio-drawer" aria-label={t('studioToolsLabel')}>
        {!webgl && <p className="studio-note">{t('studioNoWebgl')}</p>}
        {error !== null && (
          <p className="error studio-note" role="alert">
            {error}
          </p>
        )}
        {!readOnly && issues.length > 0 && (
          <div className="studio-issues">
            {issues.map((issue) => (
              <p key={issue} className="error">
                {t(ISSUE_TEXT[issue])}
              </p>
            ))}
          </div>
        )}
        {readOnly ? (
          <div className="studio-panel">
            <p className="studio-note">{t('studioReadOnly')}</p>
            <p className="studio-prize-name">{draft.name}</p>
          </div>
        ) : (
          <>
            <div role="tablist" className="studio-tabs" aria-label={t('studioToolsLabel')}>
              {TOOLS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`studio-tab-${id}`}
                  className="studio-tab"
                  aria-selected={tool === id}
                  aria-controls="studio-panel"
                  aria-expanded={tool === id && open}
                  aria-disabled={draft.trophy === null && NEEDS_TROPHY.includes(id) ? true : undefined}
                  tabIndex={tool === id ? 0 : -1}
                  ref={(element) => {
                    tabRefs.current[id] = element;
                  }}
                  onClick={() => pick(id)}
                  onKeyDown={move}
                >
                  <span className="studio-tab-icon" aria-hidden="true">
                    {TOOL_ICON[id]}
                  </span>
                  {t(TOOL_LABEL[id])}
                </button>
              ))}
            </div>
            <div role="tabpanel" id="studio-panel" className="studio-panel" aria-labelledby={`studio-tab-${tool}`} hidden={!open}>
              {blocked ? <p className="meta">{t('studioNeedsTrophy')}</p> : Panel !== null && <Panel {...toolProps} />}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
