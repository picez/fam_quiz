import type { GuideSkipView } from '@quiz/shared';
import { t } from '../i18n';
import { useGuardedSend } from './useGuardedSend';
import type { Send } from './types';

/** 75: телефон гравця в автопілоті — кнопка-перемикач і рядок «Хочуть пропустити: N з M» (завжди). */
export function GuideSkipVote({ skip, paused, send, onError }: { skip: GuideSkipView; paused: boolean; send: Send; onError: (message: string | null) => void }) {
  const guard = useGuardedSend(send, onError);
  const mine = skip.mine === true;
  return (
    <div className="guide-skip">
      <button type="button" className="btn guide-skip-button" aria-pressed={mine} disabled={paused || guard.busy} onClick={() => void guard.run('player:guide-skip', { skip: !mine })}>
        {t(mine ? 'guideSkipCancel' : 'guideSkipVote')}
      </button>
      <p className="meta guide-skip-count" role="status">
        {t('guideSkipCount', { votes: skip.votes, of: skip.of })}
      </p>
    </div>
  );
}

/** 75: сцена — рядок лише з votes ≥ 1; інакше null. */
export function GuideSkipLine({ skip }: { skip: GuideSkipView }) {
  if (skip.votes < 1) return null;
  return (
    <div className="guide-skip is-stage">
      <p className="meta guide-skip-count" role="status">
        {t('guideSkipCount', { votes: skip.votes, of: skip.of })}
      </p>
    </div>
  );
}
