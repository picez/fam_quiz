import { LIMITS, PIN_MAPS, PIN_MAP_ASPECT, type PinMap, type Question } from '@quiz/shared';
import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { PinFrame } from '../screens/PinFrame';
import { pinLayerSize, pinSpot } from '../screens/PinBoard';
import { ACCEPT, useImageUpload } from './ImageField';
import { NumberField } from './QuestionEditor';

type Pin = Extract<Question, { type: 'pin' }>;

/** Скільки чекати, поки браузер прочитає розміри щойно завантаженої картинки. */
const MEASURE_MS = 3000;

/** Пропорція картинки за адресою; null — не вдалося прочитати вчасно. */
function measure(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const image = new Image();
    const done = (value: number | null) => {
      window.clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(value);
    };
    const timer = window.setTimeout(() => done(null), MEASURE_MS);
    image.onload = () => done(image.naturalWidth > 0 && image.naturalHeight > 0 ? image.naturalWidth / image.naturalHeight : null);
    image.onerror = () => done(null);
    image.src = url;
  });
}

const CENTER = { x: 0.5, y: 0.5 };

/** Тіло запитання «точка»: основа (мапа чи своя картинка), правильна точка дотиком, кола наживо, радіуси. */
export function PinEditor({ question, onChange }: { question: Pin; onChange: (q: Question) => void }) {
  // Завантаження й вимірювання тривають довше за кадр: результат лягає на актуальне запитання.
  const latest = useRef({ question, onChange });
  latest.current = { question, onChange };
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // «Своя картинка» натиснули, але файл ще не завантажено: основа лишається колишньою.
  // Номер останнього вибору основи: запізніла відповідь завантаження чи вимірювання нічого не міняє.
  const request = useRef(0);
  /** Значення request у мить, коли вибрали файл. */
  const started = useRef(0);
  const [choosing, setChoosing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const own = question.map === null;

  const upload = useImageUpload((url) => {
    if (url === null) return;
    const mine = started.current;
    void measure(url).then((aspect) => {
      if (!mounted.current || mine !== request.current) return;
      if (aspect === null) return setProblem(t('pinImageFailed'));
      if (aspect < LIMITS.pinMinAspect || aspect > LIMITS.pinMaxAspect) return setProblem(t('pinAspectBad'));
      setProblem(null);
      setChoosing(false);
      const current = latest.current.question;
      latest.current.onChange({ ...current, map: null, aspect, imageUrl: url, target: CENTER });
    });
  });

  const pickMap = (map: PinMap) => {
    request.current += 1;
    setChoosing(false);
    setProblem(null);
    upload.clearError();
    if (question.map === map) return;
    onChange({ ...question, map, aspect: PIN_MAP_ASPECT[map], imageUrl: null, target: CENTER });
  };

  const { target, fullRadius, zeroRadius } = question;
  const { width, height } = pinLayerSize(question.aspect);
  const circles = Number.isFinite(fullRadius) && Number.isFinite(zeroRadius);
  const message = problem ?? upload.error;

  return (
    <>
      <div className="type-chips" role="group" aria-label={t('pinBaseLabel')}>
        {PIN_MAPS.map((map) => (
          <button type="button" key={map} className={!choosing && question.map === map ? 'chip is-on' : 'chip'} aria-pressed={!choosing && question.map === map} onClick={() => pickMap(map)}>
            {t(`pinMap_${map}`)}
          </button>
        ))}
        <button type="button" className={choosing || own ? 'chip is-on' : 'chip'} aria-pressed={choosing || own} onClick={() => {
            request.current += 1;
            setChoosing(true);
          }}>
          {t('pinOwnImage')}
        </button>
      </div>
      {(choosing || own) && (
        <div className="toolbar">
          <label className={upload.busy ? 'btn btn-small file-pick is-busy' : 'btn btn-small file-pick'}>
            <span>{t(upload.busy ? 'uploading' : own ? 'replaceImage' : 'pinUpload')}</span>
            <input type="file" accept={ACCEPT} disabled={upload.busy}
              onChange={(event) => {
                started.current = request.current;
                return upload.pick(event);
              }}
            />
          </label>
        </div>
      )}
      {message !== null && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      <PinFrame
        pin={{ map: question.map, aspect: question.aspect }}
        imageUrl={question.imageUrl}
        point={null}
        onPlace={(point) => onChange({ ...question, target: { x: point.x, y: point.y } })}
        overlay={
          <>
            {circles && Number.isFinite(target.x) && Number.isFinite(target.y) && (
              <svg className="pin-layer" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
                <circle className="pin-circle-zero" cx={target.x * width} cy={target.y * height} r={(zeroRadius / 100) * 1000} />
                <circle className="pin-circle-full" cx={target.x * width} cy={target.y * height} r={(fullRadius / 100) * 1000} />
              </svg>
            )}
            <span className="pin-target" role="img" aria-label={t('pinTarget')} style={pinSpot(target)}>
              ★
            </span>
          </>
        }
      />
      <p className="meta">{t('pinTargetHint')}</p>
      <div className="pair">
        <NumberField label={t('pinFull')} value={fullRadius} decimal onChange={(value) => onChange({ ...question, fullRadius: value })} />
        <NumberField label={t('pinZero')} value={zeroRadius} decimal onChange={(value) => onChange({ ...question, zeroRadius: value })} />
      </div>
      <p className="meta">{t('pinRadiusHint')}</p>
    </>
  );
}
