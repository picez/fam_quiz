import type { JSX } from 'react';
import { FeedTabs } from '../feed/FeedTabs';
import { t } from '../i18n';
import { useFeedBadge } from '../useFeedBadge';

/** Календар (/feed/calendar): заглушка, справжня сторінка — наступна задача. */
export function Calendar(): JSX.Element {
  const badge = useFeedBadge(true);
  return (
    <main className="app wide feed-page">
      <FeedTabs badge={badge} />
      <p className="meta">{t('loading')}</p>
    </main>
  );
}
