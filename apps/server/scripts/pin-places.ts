import type { PinMap } from '@quiz/shared';

/** Згенеровано apps/web/scripts/build-maps.mjs: частки x/y міст на вбудованих мапах (для демо, тестів і e2e). Не редагувати вручну. */
export const PIN_PLACES = {
  ukraine: { kyiv: { x: 0.4709, y: 0.2552 }, lviv: { x: 0.1263, y: 0.3041 }, odesa: { x: 0.4802, y: 0.7304 }, kharkiv: { x: 0.7726, y: 0.2963 }, simferopol: { x: 0.6768, y: 0.9085 }, uzhhorod: { x: 0.0229, y: 0.4355 } },
  europe: { paris: { x: 0.4257, y: 0.6067 }, rome: { x: 0.5325, y: 0.7783 }, berlin: { x: 0.5479, y: 0.5412 }, madrid: { x: 0.324, y: 0.7707 }, london: { x: 0.4082, y: 0.542 }, kyiv: { x: 0.7278, y: 0.5638 } },
  world: { kyiv: { x: 0.5714, y: 0.2415 }, tokyo: { x: 0.8582, y: 0.3343 }, cairo: { x: 0.5802, y: 0.3704 }, newYork: { x: 0.3113, y: 0.3024 }, rio: { x: 0.3825, y: 0.7077 }, sydney: { x: 0.8905, y: 0.7778 } },
} as const satisfies Record<PinMap, Record<string, { x: number; y: number }>>;
