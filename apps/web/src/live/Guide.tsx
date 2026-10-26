import type { GuideView } from "@quiz/shared";
import { guidePageText } from "../guide-text";
import { t } from "../i18n";

/**
 * Сторінка «Як грати»: stage — заголовок, номер, пункти зі значками й рядками балів, «Те саме — у ваших телефонах»;
 * phone — заголовок, номер, назви й рядки; host — заголовок, номер і назви пунктів. Без анімацій появи.
 */
export function GuidePageView({
  guide,
  size,
  autopilot = false,
}: {
  guide: GuideView;
  size: "stage" | "phone" | "host";
  autopilot?: boolean;
}) {
  const page = guide.pages[guide.page];
  if (page === undefined) return null;
  const text = guidePageText(page, autopilot);
  const stage = size === "stage";
  const host = size === "host";
  return (
    <section className={`guide is-${size}`} aria-labelledby="guide-title">
      <p className="guide-kicker">{`${t("guideTitle")} · ${t("guidePageOf", { index: guide.page + 1, total: guide.pages.length })}`}</p>
      <h1 id="guide-title" className="guide-title">
        {text.title}
      </h1>
      {!host &&
        text.lead.map((line) => (
          <p key={line} className="guide-lead">
            {line}
          </p>
        ))}
      {text.items.length > 0 && (
        <ul className="guide-items">
          {text.items.map((item, i) => {
            // Рядок балів, що вже стоїть у рядку пункту (режим ставок фіналу), удруге не повторюється.
            const details = item.details.filter(
              (detail) => !item.line.includes(detail),
            );
            return (
              <li key={i} className="guide-item">
                {stage && (
                  <span className="guide-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                )}
                <span className="guide-text">
                  <span className="guide-name">{item.name}</span>
                  {!host && <span className="guide-line">{item.line}</span>}
                  {stage && details.length > 0 && (
                    <span className="guide-details">
                      {details.map((detail) => (
                        <span key={detail}>{detail}</span>
                      ))}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {stage && <p className="guide-phones">{t("guidePhonesToo")}</p>}
    </section>
  );
}
