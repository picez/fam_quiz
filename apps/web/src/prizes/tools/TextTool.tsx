import { DECOR_LIMITS, DECOR_SUPPORT, INSCRIPTION_LOOKS, INSCRIPTION_PLACES, NICK_FONTS, lookLevel, type Inscription, type InscriptionPlace, type NickFont } from '@quiz/shared';
import { useEffect, useId, useState, type JSX } from 'react';
import { t, type TextKey } from '../../i18n';
import { loadNickFont } from '../../nick-fonts';
import { layoutDecor } from '../../trophy/decor-places';
import type { ToolProps } from '../PrizeStudio';
import { INSCRIPTION_COLOR } from '../studio-draft';
import { ColorField } from './ColorField';
import { inscriptionNote } from './StickerPicker';

type Style = Omit<Inscription, 'place' | 'text'>;
const NEW_STYLE: Style = { font: null, look: 'engraved', color: INSCRIPTION_COLOR };
const styleOf = ({ font, look, color }: Style): Style => ({ font, look, color });

/**
 * «Написи»: кожне місце форми вмикається перемикачем, далі текст з лічильником, шрифт (класичний і 8 шрифтів
 * нікнейму, закриті за рівнем), вигляд і колір. Набір тексту йде як typing: кубок оновиться, коли він стихне.
 * Увімкнене місце без тексту живе лише тут (у чернетці напису ще немає, тож і помилки довжини теж).
 */
export function TextTool({ draft, dispatch, level, stored }: ToolProps): JSX.Element {
  const { decor } = draft;
  const places = draft.trophy === null ? [] : DECOR_SUPPORT[draft.trophy.kind].inscription;
  // Стиль місця, увімкненого без тексту (і останній стиль, якщо текст стерли).
  const [pending, setPending] = useState<Partial<Record<InscriptionPlace, Style>>>({});
  const id = useId();

  // Шрифт зі збереженого оформлення цього призу лишається чинним, навіть закритий (як на сервері).
  const kept = (stored?.inscriptions ?? []).map((i) => i.font);
  const open = NICK_FONTS.filter((font) => lookLevel('font', font) <= level || kept.includes(font));
  const openKey = open.join(' ');

  // Відкриті шрифти вантажаться, лише коли якесь місце увімкнене.
  const anyOn = places.some((place) => pending[place] !== undefined || decor.inscriptions.some((i) => i.place === place));
  useEffect(() => {
    if (!anyOn) return;
    for (const font of openKey.split(' ')) if (font !== '') void loadNickFont(font as NickFont);
  }, [anyOn, openKey]);

  // Увімкнене без тексту місце теж рахується в розкладці: примітка про переїзд видна одразу, ще до набору.
  const unsaved = places
    .filter((place) => pending[place] !== undefined && !decor.inscriptions.some((i) => i.place === place))
    .map((place): Inscription => ({ place, text: ' ', ...pending[place]! }));
  const inscriptions = [...decor.inscriptions, ...unsaved].sort((a, b) => INSCRIPTION_PLACES.indexOf(a.place) - INSCRIPTION_PLACES.indexOf(b.place));
  const layout = draft.trophy === null ? null : layoutDecor(draft.trophy.kind, { ...decor, inscriptions });
  const plaqueTaken = decor.photoPlace === 'plaque' && decor.photos.length > 0;

  return (
    <div className="studio-tool">
      {places.map((place) => {
        const saved = decor.inscriptions.find((i) => i.place === place);
        // Лише стиль: збережений напис несе ще й place і text, а старий text не повинен перекрити набраний.
        const style: Style | undefined = saved !== undefined ? styleOf(saved) : pending[place];
        const on = style !== undefined;
        const text = saved?.text ?? '';
        const max = DECOR_LIMITS[place];
        const taken = place === 'plaque' && plaqueTaken;
        const field = `${id}-${place}-text`;

        const remember = (next: Style) => setPending((all) => ({ ...all, [place]: next }));
        const setText = (value: string) => {
          const current = style ?? NEW_STYLE;
          remember(current);
          dispatch({ type: 'inscription', place, value: value === '' ? null : { place, text: value, ...current } }, true);
        };
        const setStyle = (patch: Partial<Style>, typing = false) => {
          const next = { ...(style ?? NEW_STYLE), ...patch };
          remember(next);
          if (saved !== undefined) dispatch({ type: 'inscription', place, value: { ...saved, ...patch } }, typing);
        };
        const toggle = (value: boolean) => {
          if (value) remember(NEW_STYLE);
          else {
            setPending(({ [place]: _, ...rest }) => rest);
            if (saved !== undefined) dispatch({ type: 'inscription', place, value: null });
          }
        };
        const fonts = `${id}-${place}-font`;
        const placed = layout?.inscriptions.find((i) => i.inscription.place === place);
        // Табличку з фото пояснює studioPlaqueTaken — друга примітка там зайва.
        const note = on && !taken && placed !== undefined ? inscriptionNote(placed) : null;

        return (
          <fieldset key={place} className="studio-group studio-text">
            <legend>
              <label className="check studio-text-toggle">
                <input type="checkbox" checked={on} disabled={taken && !on} onChange={(event) => toggle(event.target.checked)} />
                {t(`studioText_${place}` as TextKey)}
              </label>
            </legend>
            {taken && <p className="meta">{t('studioPlaqueTaken')}</p>}
            {note !== null && <p className="meta">{note}</p>}
            {on && (
              <div className="studio-part">
                <div className="field">
                  <label htmlFor={field}>{t('studioTextField')}</label>
                  {place === 'plaque' ? (
                    <textarea id={field} rows={2} maxLength={max} value={text} onChange={(event) => setText(event.target.value)} />
                  ) : (
                    <input id={field} type="text" maxLength={max} value={text} onChange={(event) => setText(event.target.value)} />
                  )}
                  <span className="meta studio-text-count">{t('studioTextCount', { n: text.length, max })}</span>
                </div>

                <fieldset className="studio-choice studio-fonts">
                  <legend>{t('studioFont')}</legend>
                  <label>
                    <input type="radio" name={fonts} checked={style.font === null} onChange={() => setStyle({ font: null })} />
                    <span className="studio-font-tile studio-font-classic" aria-hidden="true">
                      {t('studioFontSample')}
                    </span>
                    {t('studioFontClassic')}
                  </label>
                  {NICK_FONTS.map((font) => {
                    const need = lookLevel('font', font);
                    const locked = !open.includes(font) && style.font !== font;
                    return (
                      <label key={font} className={locked ? 'is-locked' : undefined}>
                        <input type="radio" name={fonts} checked={style.font === font} disabled={locked} onChange={() => setStyle({ font })} />
                        <span className={`studio-font-tile nick-font-${font}`} aria-hidden="true">
                          {t('studioFontSample')}
                        </span>
                        {t(`font_${font}` as TextKey)}
                        {locked && <span className="look-lock">{t('lookLocked', { level: t('levelFromLevel', { n: need }) })}</span>}
                      </label>
                    );
                  })}
                </fieldset>

                <fieldset className="studio-choice">
                  <legend>{t('studioLook')}</legend>
                  {INSCRIPTION_LOOKS.map((look) => (
                    <label key={look}>
                      <input type="radio" name={`${id}-${place}-look`} checked={style.look === look} onChange={() => setStyle({ look })} />
                      {t(`studioLook_${look}` as TextKey)}
                    </label>
                  ))}
                </fieldset>

                <ColorField label={t('studioColor')} value={style.color} onChange={(color, typing) => setStyle({ color }, typing)} />
              </div>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
