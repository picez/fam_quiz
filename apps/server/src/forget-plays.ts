import { DELETED_FACT, DELETED_NICKNAME } from '@quiz/shared';
import type { PlayRef } from './db/schema';

/**
 * Видалений акаунт (58) у журналі гри (game.plays): `gone` — його учасники цієї гри (id → нікнейм у ній).
 * «Правда про гравця»: його факт — DELETED_FACT, автор — DELETED_NICKNAME, його варіант у кожному запитанні — DELETED_NICKNAME;
 * «Малюнок» (художник) і місця «Думай інакше» зберігають нікнейм без id — замінюється збіг з його нікнеймом у цій грі.
 * Решта журналу тримає лише id учасників. Повертає той самий масив, якщо нічого не змінилося.
 */
export function forgetInPlays(plays: PlayRef[], gone: ReadonlyMap<string, string>): PlayRef[] {
  if (gone.size === 0) return plays;
  const names = new Set([...gone.values()].filter((name) => name !== ''));
  let changed = false;
  const next = plays.map((ref) => {
    let out = ref;
    const { truth, drawing, think } = ref;
    if (truth !== undefined) {
      const authored = gone.has(truth.author);
      const q = truth.question;
      const options = q.type === 'single' ? q.options.map((o) => (gone.has(o.id) ? { ...o, text: DELETED_NICKNAME } : o)) : null;
      const touched = authored || (q.type === 'single' && q.options.some((o) => gone.has(o.id)));
      if (touched) {
        const question = { ...q, ...(authored ? { text: DELETED_FACT } : {}), ...(options === null ? {} : { options }) } as typeof q;
        out = { ...out, truth: { ...truth, question, ...(authored ? { authorName: DELETED_NICKNAME } : {}) } };
      }
    }
    if (drawing !== undefined && names.has(drawing.drawer)) out = { ...out, drawing: { ...drawing, drawer: DELETED_NICKNAME } };
    if (think?.places !== undefined && think.places.some((p) => names.has(p.nickname))) {
      out = { ...out, think: { ...think, places: think.places.map((p) => (names.has(p.nickname) ? { ...p, nickname: DELETED_NICKNAME } : p)) } };
    }
    if (out !== ref) changed = true;
    return out;
  });
  return changed ? next : plays;
}
