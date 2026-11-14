import { questionsOf, type Quiz } from '@quiz/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DraftNote } from '../groups/templates';
import { t } from '../i18n';

/** Звідки запитання (12l): лише в редакторі й поруч із чернеткою — у вікторині зв'язку з записом немає. */
export interface GroupDraftEntry {
  groupId: string;
  itemId: string;
  notes: DraftNote[];
}
export interface GroupDrafts {
  entries: Record<string, GroupDraftEntry>;
  /** щойно складено «Вікториною з групи» */
  fresh?: true;
}
interface GroupDraftsApi {
  entries: Record<string, GroupDraftEntry>;
  add: (questionId: string, entry: GroupDraftEntry) => void;
  /** notes → [], запис лишається для позначки «використано». */
  dismiss: (questionId: string) => void;
}

const GroupDraftsContext = createContext<GroupDraftsApi | null>(null);

export function GroupDraftsProvider({ initial, onChange, children }: { initial: GroupDrafts | null; onChange: (next: GroupDrafts) => void; children: ReactNode }) {
  const [entries, setEntries] = useState<Record<string, GroupDraftEntry>>(() => initial?.entries ?? {});
  const latest = useRef(onChange);
  latest.current = onChange;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // Будь-яка зміна знімає «щойно складено»: повідомлення вже показано.
    latest.current({ entries });
  }, [entries]);
  const update = useCallback((change: (current: Record<string, GroupDraftEntry>) => Record<string, GroupDraftEntry>) => setEntries(change), []);
  const add = useCallback((questionId: string, entry: GroupDraftEntry) => update((current) => ({ ...current, [questionId]: entry })), [update]);
  const dismiss = useCallback(
    (questionId: string) =>
      update((current) => {
        const entry = current[questionId];
        return entry === undefined ? current : { ...current, [questionId]: { ...entry, notes: [] } };
      }),
    [update],
  );
  const api = useMemo(() => ({ entries, add, dismiss }), [entries, add, dismiss]);
  return <GroupDraftsContext.Provider value={api}>{children}</GroupDraftsContext.Provider>;
}

/** Поза провайдером — null (QuestionEditor у тестах і SparesEditor). */
export function useGroupDrafts(): GroupDraftsApi | null {
  return useContext(GroupDraftsContext);
}

/** Нагадування над запитанням із запису групи: що перевірити; «Зрозуміло» ховає їх. */
export function GroupDraftNotes({ questionId }: { questionId: string }) {
  const drafts = useGroupDrafts();
  const entry = drafts?.entries[questionId];
  if (drafts === null || entry === undefined || entry.notes.length === 0) return null;
  return (
    <aside className="group-draft-notes" role="note" aria-label={t('groupNoteTitle')}>
      <p className="group-draft-notes-title">{t('groupNoteTitle')}</p>
      <ul>
        {entry.notes.map((note) => (
          <li key={note.key}>{t(note.key, note.vars)}</li>
        ))}
      </ul>
      <button type="button" className="btn btn-small" onClick={() => drafts.dismiss(questionId)}>
        {t('groupNoteDismiss')}
      </button>
    </aside>
  );
}

/** Що позначати після збереження: групи → id записів, чиї запитання є у збереженій вікторині. */
export function usesToMark(drafts: GroupDrafts, quiz: Quiz): Map<string, string[]> {
  const present = new Set(questionsOf(quiz).map((question) => question.id));
  const marks = new Map<string, string[]>();
  for (const [questionId, entry] of Object.entries(drafts.entries)) {
    if (!present.has(questionId)) continue;
    const list = marks.get(entry.groupId) ?? [];
    if (!list.includes(entry.itemId)) list.push(entry.itemId);
    marks.set(entry.groupId, list);
  }
  return marks;
}
