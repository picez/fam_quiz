import { allowedBuffs, allowedDebuffs, BUFF_KINDS, DEBUFF_KINDS, READY_BUFFS, type BuffKind, type DebuffKind, type QuizSettings } from '@quiz/shared';
import { BUFF_ICONS, buffName } from '../buff-meta';
import { DEBUFF_ICONS, debuffName } from '../debuff-meta';
import { t, type TextKey } from '../i18n';

interface Props {
  settings: QuizSettings;
  onChange: (powers: { debuffs: DebuffKind[]; buffs: BuffKind[] }) => void;
}

const toggled = <K extends string>(all: readonly K[], list: K[], kind: K, on: boolean) =>
  all.filter((item) => (item === kind ? on : list.includes(item)));

/** Розділ «Бафи й дебафи»: прапорці й «Усі / Жодного»; onChange завжди дає обидва масиви у порядку списків. */
export function PowersEditor({ settings, onChange }: Props) {
  const debuffs = allowedDebuffs({ settings });
  const buffs = allowedBuffs({ settings });

  return (
    <>
      <fieldset className="powers-group">
        <legend>{t('powersDebuffs')}</legend>
        <div className="powers-bulk">
          <button type="button" className="btn btn-small" onClick={() => onChange({ debuffs: [...DEBUFF_KINDS], buffs })}>
            {t('powersAll')}
          </button>
          <button type="button" className="btn btn-small" onClick={() => onChange({ debuffs: [], buffs })}>
            {t('powersNone')}
          </button>
        </div>
        <div className="powers-list">
          {DEBUFF_KINDS.map((kind) => (
            <label className="powers-item" key={kind}>
              <input
                type="checkbox"
                checked={debuffs.includes(kind)}
                onChange={(event) => onChange({ debuffs: toggled(DEBUFF_KINDS, debuffs, kind, event.target.checked), buffs })}
              />
              <span aria-hidden="true">{DEBUFF_ICONS[kind]}</span>
              <span>{debuffName(kind)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="powers-group">
        <legend>{t('powersBuffs')}</legend>
        <div className="powers-bulk">
          <button type="button" className="btn btn-small" onClick={() => onChange({ debuffs, buffs: [...READY_BUFFS] })}>
            {t('powersAll')}
          </button>
          <button type="button" className="btn btn-small" onClick={() => onChange({ debuffs, buffs: [] })}>
            {t('powersNone')}
          </button>
        </div>
        <div className="powers-list">
          {BUFF_KINDS.map((kind) => {
            const ready = READY_BUFFS.includes(kind);
            return (
              <label className="powers-item" key={kind}>
                <input
                  type="checkbox"
                  disabled={!ready}
                  checked={buffs.includes(kind)}
                  onChange={(event) => onChange({ debuffs, buffs: toggled(BUFF_KINDS, buffs, kind, event.target.checked) })}
                />
                <span aria-hidden="true">{BUFF_ICONS[kind]}</span>
                <span>{buffName(kind)}</span>
                {!ready && <span className="powers-soon">{t('powersSoon')}</span>}
              </label>
            );
          })}
        </div>
        {buffs.map((kind) => (
          <p className="meta" key={kind}>
            {`${BUFF_ICONS[kind]} ${buffName(kind)} — ${t(`buffTip_${kind}` as TextKey)}`}
          </p>
        ))}
      </fieldset>
    </>
  );
}
