import { LIMITS, type Question } from '@quiz/shared';
import { t } from '../i18n';
import { newId } from './new-id';
import { NumberField } from './QuestionEditor';

type Wall = Extract<Question, { type: 'wall' }>;

const blankTile = () => ({ id: newId(), text: '' });

/** Стіна зв'язків: 4×4 або 3×3, назва кожної групи, плитки, ліміт помилок. */
export function WallEditor({ question, onChange }: { question: Wall; onChange: (q: Question) => void }) {
  const { groups } = question;
  const size = groups.length;

  const resize = (to: 3 | 4) => {
    if (to === size) return;
    if (to === 3) {
      const kept = groups.slice(0, 3).map((group) => ({ ...group, tiles: group.tiles.slice(0, 3) }));
      const dropsText =
        groups.slice(3).some((group) => group.name.trim() !== '' || group.tiles.some((tile) => tile.text.trim() !== '')) ||
        groups.slice(0, 3).some((group) => group.tiles.slice(3).some((tile) => tile.text.trim() !== ''));
      if (dropsText && !window.confirm(t('wallShrinkConfirm'))) return;
      onChange({ ...question, groups: kept });
      return;
    }
    onChange({
      ...question,
      groups: [...groups.map((group) => ({ ...group, tiles: [...group.tiles, blankTile()] })), { id: newId(), name: '', tiles: Array.from({ length: 4 }, blankTile) }],
    });
  };

  const setGroup = (index: number, patch: Partial<Wall['groups'][number]>) =>
    onChange({ ...question, groups: groups.map((group, i) => (i === index ? { ...group, ...patch } : group)) });

  const per = Number.isFinite(question.points) ? Math.round(question.points / size) : Number.NaN;
  const max = Number.isFinite(question.points) ? Math.round((question.points * (size - 1)) / size) : Number.NaN;

  return (
    <>
      <div className="reveal-modes" role="group" aria-label={t('wallSizeLabel')}>
        {([4, 3] as const).map((value) => (
          <button
            type="button"
            key={value}
            className={size === value ? 'chip is-on' : 'chip'}
            aria-pressed={size === value}
            onClick={() => resize(value)}
          >
            {t(value === 4 ? 'wallSize4' : 'wallSize3')}
          </button>
        ))}
      </div>
      {groups.map((group, index) => (
        <div className="wall-group-edit" role="group" aria-labelledby={`wall-group-${group.id}`} key={group.id}>
          <span className="wall-group-title" id={`wall-group-${group.id}`}>
            <span className={`wall-swatch wall-color-${index}`} aria-hidden="true" />
            {t('wallGroupN', { n: index + 1 })}
          </span>
          <label className="field compact">
            <span>{t('wallGroupName', { n: index + 1 })}</span>
            <input value={group.name} maxLength={LIMITS.wallGroupName} onChange={(event) => setGroup(index, { name: event.target.value })} />
          </label>
          <div className="pair wall-tiles-edit">
            {group.tiles.map((tile, at) => (
              <label className="field compact" key={tile.id}>
                <span className="sr-only">{t('wallTileN', { k: at + 1 })}</span>
                <input
                  placeholder={t('wallTileN', { k: at + 1 })}
                  value={tile.text}
                  maxLength={LIMITS.wallTile}
                  onChange={(event) => setGroup(index, { tiles: group.tiles.map((other) => (other.id === tile.id ? { ...other, text: event.target.value } : other)) })}
                />
              </label>
            ))}
          </div>
        </div>
      ))}
      <p className="meta">{t('wallGroupNameHint')}</p>
      <NumberField label={t('wallMistakesField')} value={question.mistakes} onChange={(mistakes) => onChange({ ...question, mistakes })} />
      {Number.isFinite(per) && <p className="meta">{t('wallPointsHint', { per, max })}</p>}
      <p className="meta">{t('wallOrderHint')}</p>
    </>
  );
}
