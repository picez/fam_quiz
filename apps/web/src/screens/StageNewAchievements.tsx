import type { JSX } from 'react';
import { isAnti, type NewAchievementsStage } from '@quiz/shared';
import { ACHIEVEMENT_ICONS } from '../achievement-meta';
import { t, type TextKey } from '../i18n';

/** Скільки людей і значків на людину вміщує слайд 1280 × 720. */
const PEOPLE = 8;
const BADGES = 3;

/** Слайд «Нові досягнення» (12j): до 8 людей, до 3 значків з назвами на людину й «+N»; понад 8 — «Ще людей: N». */
export function StageNewAchievements({ stage }: { stage: NewAchievementsStage }): JSX.Element {
  const shown = stage.people.slice(0, PEOPLE);
  const more = stage.people.length - shown.length;
  return (
    <>
      <h1 className="question award-title">{t('stageNewAchievements')}</h1>
      {/* Понад 5 рядків — дрібніший шрифт; рядок завжди один: довга назва значка обрізається трикрапкою, а не переносить рядок. */}
      <ul className={shown.length > 5 ? 'stage-new-achievements is-many' : 'stage-new-achievements'}>
        {shown.map((person, index) => (
          <li key={`${index}:${person.nickname}`} className="stage-new-achievements-row">
            <span className="stage-new-achievements-name">{person.nickname}</span>
            {person.ids.slice(0, BADGES).map((id) => (
              <span key={id} className={isAnti(id) ? 'stage-new-achievement is-anti' : 'stage-new-achievement'}>
                <span aria-hidden="true">{ACHIEVEMENT_ICONS[id]}</span> <span className="stage-new-achievement-name">{t(`achievement_${id}` as TextKey)}</span>
              </span>
            ))}
            {person.ids.length > BADGES && <span className="stage-new-achievements-more">{t('stageNewAchievementsMore', { count: person.ids.length - BADGES })}</span>}
          </li>
        ))}
      </ul>
      {more > 0 && <p className="lead stage-new-achievements-people">{t('stageNewAchievementsPeople', { count: more })}</p>}
    </>
  );
}
