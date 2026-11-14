import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { GROUP_CODE, type GroupJoinPreview } from '@quiz/shared';
import { getGroupJoin, joinGroup } from '../api';
import { countText, errorText, t } from '../i18n';
import { nickText } from '../nick';
import { loginFor } from '../profile/ProfileSubpage';
import { useAccount } from '../useAccount';

type Preview = { status: 'loading' } | { status: 'gone' } | { status: 'error'; message: string } | { status: 'ready'; group: GroupJoinPreview };

/** Вступ за посиланням /groups/join/:код (12k): гостя — на вхід і назад; учаснику — «Ти вже в цій групі»; іншим — картка й «Приєднатися». */
export function GroupJoin() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const account = useAccount();
  const valid = GROUP_CODE.test(code);
  const signedIn = account.status === 'signed-in';
  const [preview, setPreview] = useState<Preview>({ status: 'loading' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!signedIn || !valid) return;
    let current = true;
    void getGroupJoin(code).then((result) => {
      if (!current) return;
      if (result.ok) {
        const { ok: _ok, ...group } = result;
        setPreview({ status: 'ready', group });
      } else if (result.error === 'group_not_found') setPreview({ status: 'gone' });
      else setPreview({ status: 'error', message: errorText(result.error) });
    });
    return () => {
      current = false;
    };
  }, [signedIn, valid, code]);

  const join = async () => {
    setBusy(true);
    const result = await joinGroup(code);
    setBusy(false);
    if (result.ok) navigate(`/profile/groups/${encodeURIComponent(result.id)}`, { replace: true });
    else if (result.error === 'group_not_found') setPreview({ status: 'gone' });
    else setError(errorText(result.error));
  };

  const body = () => {
    if (!valid) return <p className="meta group-join-gone">{t('groupJoinGone')}</p>;
    if (account.status === 'anonymous') {
      return (
        <>
          <p>{t('groupJoinSignIn')}</p>
          <Link className="btn btn-primary" to={loginFor(`/groups/join/${code}`)}>
            {t('menuSignIn')}
          </Link>
        </>
      );
    }
    if (account.status === 'unknown') return <p className="error" role="alert">{errorText(account.error)}</p>;
    if (!signedIn || preview.status === 'loading') return <p className="meta">{t('loading')}</p>;
    if (preview.status === 'gone') return <p className="meta group-join-gone">{t('groupJoinGone')}</p>;
    if (preview.status === 'error') return <p className="error" role="alert">{preview.message}</p>;
    const { group } = preview;
    return (
      <section className="group-join-card">
        <span className="group-card-emoji" aria-hidden="true">
          {group.emoji}
        </span>
        <h2>{group.name}</h2>
        {group.description !== '' && <p>{group.description}</p>}
        <p className="meta">{countText('groupPeople', group.people, { count: group.people })}</p>
        {group.owner !== null && <p>{t('groupJoinFrom', { owner: nickText(group.owner.nickname) })}</p>}
        {group.member ? (
          <>
            <p>{t('groupJoinAlready')}</p>
            <Link className="btn btn-primary" to={`/profile/groups/${encodeURIComponent(group.id)}`}>
              {t('groupJoinOpen')}
            </Link>
          </>
        ) : (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void join()}>
            {t('groupJoinButton')}
          </button>
        )}
        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    );
  };

  return (
    <main className="app group-join">
      <h1 className="brand">{t('groupJoinTitle')}</h1>
      {body()}
    </main>
  );
}
