/** Позначка антигугла на початку тексту позначки (12e). */
const AWAY_EMOJI = '🙈';

/** Текст позначки «🙈 …» (12e): емодзі — лише для ока (aria-hidden), читач екрана чує самі слова. Текст без емодзі — як є. */
export function AwayLabel({ text }: { text: string }) {
  if (!text.startsWith(`${AWAY_EMOJI} `)) return <>{text}</>;
  return (
    <>
      <span aria-hidden="true">{AWAY_EMOJI}</span>
      {text.slice(AWAY_EMOJI.length)}
    </>
  );
}
