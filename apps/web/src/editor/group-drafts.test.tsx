// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Quiz } from '@quiz/shared';
import { newClassicRound, newQuestion, newQuiz } from './draft';
import { clearGroupDrafts, loadGroupDrafts, saveGroupDrafts } from './draft-storage';
import { GroupDraftNotes, GroupDraftsProvider, useGroupDrafts, usesToMark, type GroupDrafts } from './group-drafts';

afterEach(cleanup);
beforeEach(() => sessionStorage.clear());

const note = { key: 'groupNoteBlankName' as const };

function Adder({ questionId }: { questionId: string }) {
  const drafts = useGroupDrafts();
  return (
    <button type="button" onClick={() => drafts?.add(questionId, { groupId: 'g1', itemId: 'i1', notes: [note] })}>
      додати
    </button>
  );
}

describe('group drafts (12l)', () => {
  it('shows the reminders of a drafted question; «Зрозуміло» hides them and keeps the entry', () => {
    const onChange = vi.fn();
    render(
      <GroupDraftsProvider initial={null} onChange={onChange}>
        <Adder questionId="q1" />
        <GroupDraftNotes questionId="q1" />
        <GroupDraftNotes questionId="q2" />
      </GroupDraftsProvider>,
    );
    expect(screen.queryByRole('note')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'додати' }));
    expect(screen.getByRole('note').textContent).toContain('Із запису групи');
    expect(screen.getByRole('note').textContent).toContain('Заміни ім’я героя в тексті на «___»');
    expect(screen.getAllByRole('note')).toHaveLength(1);
    expect(onChange).toHaveBeenLastCalledWith({ entries: { q1: { groupId: 'g1', itemId: 'i1', notes: [note] } } });

    fireEvent.click(screen.getByRole('button', { name: 'Зрозуміло' }));
    expect(screen.queryByRole('note')).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith({ entries: { q1: { groupId: 'g1', itemId: 'i1', notes: [] } } });
  });

  it('outside a provider there are no reminders', () => {
    const { container } = render(<GroupDraftNotes questionId="q1" />);
    expect(container.innerHTML).toBe('');
  });

  it('marks only the records whose questions are still in the saved quiz, per group', () => {
    const a = newQuestion('single');
    const b = newQuestion('boolean');
    const quiz: Quiz = { ...newQuiz(), rounds: [{ ...newClassicRound(), questions: [a, b] }] };
    const drafts: GroupDrafts = {
      entries: {
        [a.id]: { groupId: 'g1', itemId: 'i1', notes: [] },
        [b.id]: { groupId: 'g2', itemId: 'i2', notes: [note] },
        gone: { groupId: 'g1', itemId: 'i3', notes: [] },
      },
    };
    expect([...usesToMark(drafts, quiz)]).toEqual([
      ['g1', ['i1']],
      ['g2', ['i2']],
    ]);
  });

  it('keeps the drafts next to the quiz draft in sessionStorage; broken JSON is null', () => {
    const drafts: GroupDrafts = { entries: { q1: { groupId: 'g1', itemId: 'i1', notes: [note, { key: 'groupNoteClipped', vars: { max: 300 } }] } }, fresh: true };
    saveGroupDrafts(undefined, drafts);
    expect(sessionStorage.getItem('quiz:groupdraft:new')).not.toBeNull();
    expect(loadGroupDrafts(undefined)).toEqual(drafts);
    expect(loadGroupDrafts('q1')).toBeNull();
    saveGroupDrafts('q1', { entries: {} });
    expect(loadGroupDrafts('q1')).toEqual({ entries: {} });
    clearGroupDrafts(undefined);
    expect(loadGroupDrafts(undefined)).toBeNull();
    sessionStorage.setItem('quiz:groupdraft:new', '{nope');
    expect(loadGroupDrafts(undefined)).toBeNull();
    sessionStorage.setItem('quiz:groupdraft:new', JSON.stringify({ entries: { q1: { groupId: 'g1' } } }));
    expect(loadGroupDrafts(undefined)).toBeNull();
  });
});
