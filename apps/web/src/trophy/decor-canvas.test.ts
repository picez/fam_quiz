import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Inscription, TrophyDecor } from '@quiz/shared';
import { NICK_FONT_LOADERS, resetNickFontCache } from '../nick-fonts';
import {
  drawBack,
  drawBand,
  drawPhotoCard,
  drawPhotoDisc,
  drawPhotoRing,
  drawPlaque,
  drawRim,
  inscriptionFont,
  loadInscriptionFont,
  toneImageData,
} from './decor-canvas';
import { BAND_PX, PHOTO_BOX, coverCrop, metalStops, rimUnit } from './decor-layout';

interface Call {
  name: string;
  args: unknown[];
  font: string;
  fillStyle: unknown;
  textAlign: string;
}

function fakeCtx() {
  const calls: Call[] = [];
  const state: Record<string, unknown> = { font: '10px serif', fillStyle: '#000', strokeStyle: '#000', textAlign: 'start' };
  const gradients: { args: number[]; stops: [number, string][] }[] = [];
  const ctx = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'measureText') {
          return (text: string) => {
            const px = Number(/(\d+(?:\.\d+)?)px/.exec(String(state.font))?.[1] ?? 10);
            return { width: text.length * px * 0.5 };
          };
        }
        if (prop === 'createLinearGradient') {
          return (...args: number[]) => {
            const g = { args, stops: [] as [number, string][], addColorStop: (o: number, c: string) => void g.stops.push([o, c]) };
            gradients.push(g);
            return g;
          };
        }
        if (prop === 'getImageData') {
          return (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) });
        }
        if (prop in state) return state[prop];
        return (...args: unknown[]) => {
          calls.push({ name: prop, args, font: String(state.font), fillStyle: state.fillStyle, textAlign: String(state.textAlign) });
        };
      },
      set(_t, prop: string, value) {
        state[prop] = value;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, gradients, state };
}

const insc = (over: Partial<Inscription>): Inscription => ({ place: 'rim', text: 'T', font: null, look: 'engraved', color: '#3a2a0e', ...over });
const FAMILY_RIM = "Сімейний Ґрааль сім'ї комендантів · для найрозумнішого Індіани Джонса";
const img = { width: 800, height: 600 } as unknown as CanvasImageSource & { width: number; height: number };
const decor = (over: Partial<TrophyDecor> = {}): TrophyDecor => ({
  photos: [
    { url: '/uploads/aaaaaaaaaaaaaaaa.jpg', crop: { x: 0.5, y: 0.5, scale: 1 } },
    { url: '/uploads/bbbbbbbbbbbbbbbb.jpg', crop: { x: 0.5, y: 0.5, scale: 1 } },
    { url: '/uploads/cccccccccccccccc.jpg', crop: { x: 0.5, y: 0.5, scale: 1 } },
  ],
  photoPlace: 'ring',
  frame: 'none',
  photoStyle: 'normal',
  inscriptions: [],
  effect: { kind: 'none' },
  appearance: 'spin',
  stickers: [],
  ...over,
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  resetNickFontCache();
});

describe('decor canvas', () => {
  it('the family rim is drawn as baked', () => {
    const { ctx, calls, gradients } = fakeCtx();
    drawRim(ctx, insc({ place: 'rim', text: FAMILY_RIM }), 'gold');
    const first = calls.find((c) => c.name === 'fillRect')!;
    expect(first.args).toEqual([0, 0, 2048, 96]);
    expect(gradients[0]!.stops.map((s) => s[1])).toEqual([...metalStops('gold', 'band')]);
    const unit = rimUnit(FAMILY_RIM);
    const texts = calls.filter((c) => c.name === 'fillText');
    expect(texts).toHaveLength(2);
    expect(texts.every((c) => c.font === '600 54px Georgia, serif')).toBe(true);
    expect(texts[0]!.args[0]).toBe(unit);
    expect(texts[0]!.fillStyle).toBe('rgba(255,246,214,0.55)');
    expect(texts[1]!.fillStyle).toBe('#3a2a0e');
    const width = unit.length * 54 * 0.5;
    const scale = calls.find((c) => c.name === 'scale')!;
    expect(scale.args).toEqual([2048 / width, 1]);
    expect((texts[0]!.args[1] as number) > 0).toBe(true);
  });

  it('the family plaque has two lines', () => {
    const { ctx, calls } = fakeCtx();
    drawPlaque(ctx, insc({ place: 'plaque', text: 'Хочеш я тобі Ді…\nҐрааль покажу?' }), 'gold');
    const texts = calls.filter((c) => c.name === 'fillText');
    const one = texts.find((c) => c.args[0] === 'Хочеш я тобі Ді…' && c.args[2] === 148)!;
    const two = texts.find((c) => c.args[0] === 'Ґрааль покажу?' && c.args[2] === 264)!;
    expect(one.textAlign).toBe('center');
    expect(two.textAlign).toBe('center');
    const strokes = calls.filter((c) => c.name === 'stroke').length;
    expect(strokes).toBe(2);
  });

  it('plaque outlines use the baked colours', () => {
    const { ctx, state } = fakeCtx();
    const seen: unknown[] = [];
    const proxy = new Proxy(ctx, {
      get: (t, p) => (p === 'stroke' ? () => seen.push(state.strokeStyle) : Reflect.get(t, p)),
      set: (t, p, v) => Reflect.set(t, p, v),
    });
    drawPlaque(proxy, insc({ place: 'plaque', text: 'A' }), 'gold');
    expect(seen).toEqual(['#7c5e22', '#f6e3a6']);
  });

  it('looks', () => {
    const colored = fakeCtx();
    drawBand(colored.ctx, insc({ place: 'band', text: 'Hi', look: 'colored' }), 'silver');
    expect(colored.calls.filter((c) => c.name === 'fillText')).toHaveLength(1);
    const embossed = fakeCtx();
    drawBand(embossed.ctx, insc({ place: 'band', text: 'Hi', look: 'embossed' }), 'silver');
    const texts = embossed.calls.filter((c) => c.name === 'fillText');
    expect(texts).toHaveLength(3);
    expect(texts[0]!.fillStyle).toBe('rgba(255,246,214,0.7)');
    expect(texts[1]!.fillStyle).toBe('rgba(0,0,0,0.45)');
  });

  it('back wraps into at most 3 lines on a circle', () => {
    const { ctx, calls } = fakeCtx();
    drawBack(ctx, insc({ place: 'back', text: 'one two three four five six seven eight nine ten', look: 'colored' }), 'bronze');
    expect(calls.some((c) => c.name === 'arc')).toBe(true);
    const lines = calls.filter((c) => c.name === 'fillText');
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines.length).toBeLessThanOrEqual(3);
  });

  it('fonts', () => {
    expect(inscriptionFont('brush', 40)).toBe("700 40px 'Amatic SC', Georgia, serif");
    expect(inscriptionFont('heavy', 40).startsWith('400 ')).toBe(true);
    expect(inscriptionFont('hand', 40).startsWith('600 ')).toBe(true);
    expect(inscriptionFont(null, 54)).toBe('600 54px Georgia, serif');
  });

  it('a failed font resolves', async () => {
    vi.spyOn(NICK_FONT_LOADERS, 'pixel').mockRejectedValue(new Error('chunk'));
    // Шрифт не підвантажився: FontFaceSet не знаходить жодної грані.
    vi.stubGlobal('document', { fonts: { load: vi.fn(() => Promise.resolve([])) } });
    await expect(loadInscriptionFont('pixel')).resolves.toBe(false);
    vi.unstubAllGlobals();
  });

  it('a hanging font times out', async () => {
    vi.useFakeTimers();
    vi.spyOn(NICK_FONT_LOADERS, 'elegant').mockResolvedValue(undefined);
    const fonts = { load: vi.fn(() => new Promise<never>(() => {})) };
    vi.stubGlobal('document', { fonts });
    let done = false;
    const p = loadInscriptionFont('elegant').then((loaded) => {
      done = true;
      return loaded;
    });
    await vi.advanceTimersByTimeAsync(2999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(await p).toBe(false);
    expect(done).toBe(true);
    expect(fonts.load).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('loads the faces for the inscription letters', async () => {
    vi.spyOn(NICK_FONT_LOADERS, 'hand').mockResolvedValue(undefined);
    const fonts = { load: vi.fn(() => Promise.resolve([{}])) };
    vi.stubGlobal('document', { fonts });
    await expect(loadInscriptionFont('hand', 'Чемпіон')).resolves.toBe(true);
    // Без тексту FontFaceSet.load бере лише пробіл (латинський підмножина), і кирилиця малюється запасним шрифтом.
    expect(fonts.load).toHaveBeenCalledWith(inscriptionFont('hand', 40), 'ЧЕМПІОН Чемпіон');
    vi.unstubAllGlobals();
  });

  it('null font loads nothing', async () => {
    const spies = Object.values(NICK_FONT_LOADERS).length;
    const loaders = (Object.keys(NICK_FONT_LOADERS) as (keyof typeof NICK_FONT_LOADERS)[]).map((k) =>
      vi.spyOn(NICK_FONT_LOADERS, k).mockResolvedValue(undefined),
    );
    await expect(loadInscriptionFont(null)).resolves.toBe(true);
    expect(spies).toBe(8);
    for (const l of loaders) expect(l).not.toHaveBeenCalled();
  });

  it('a missing photo leaves its tile dark', () => {
    const { ctx, calls } = fakeCtx();
    drawPhotoRing(ctx, [img, null, img], decor(), 'gold');
    expect(calls[0]!.name).toBe('fillRect');
    expect(calls[0]!.args).toEqual([0, 0, 450, 204]);
    expect(calls[0]!.fillStyle).toBe('#20160c');
    expect(calls.filter((c) => c.name === 'drawImage')).toHaveLength(2);
  });

  it('ring uses the cover crop', () => {
    const { ctx, calls } = fakeCtx();
    const d = decor();
    drawPhotoRing(ctx, [img, img, img], d, 'gold');
    const c = coverCrop(img, { width: 134, height: 188 }, d.photos[0]!.crop);
    const first = calls.find((x) => x.name === 'drawImage')!;
    expect(first.args).toEqual([img, c.sx, c.sy, c.sw, c.sh, 8, 8, 134, 188]);
  });

  it('the crop preview box is what the trophy draws', () => {
    const crop = { x: 0.3, y: 0.6, scale: 1.7 };
    const d = decor({ photos: [{ url: '/uploads/aaaaaaaaaaaaaaaa.jpg', crop }] });
    const card = fakeCtx();
    drawPhotoCard(card.ctx, img, d.photos[0]!, d, PHOTO_BOX.plaque, 'gold');
    const c = coverCrop(img, PHOTO_BOX.plaque, crop);
    expect(card.calls.find((x) => x.name === 'drawImage')!.args.slice(0, 5)).toEqual([img, c.sx, c.sy, c.sw, c.sh]);
    const disc = fakeCtx();
    drawPhotoDisc(disc.ctx, img, d.photos[0]!, d, 512, 'gold');
    const e = coverCrop(img, PHOTO_BOX.medallion, crop);
    expect(disc.calls.find((x) => x.name === 'drawImage')!.args.slice(0, 5)).toEqual([img, e.sx, e.sy, e.sw, e.sh]);
  });

  it('toneImageData', () => {
    const bw = new Uint8ClampedArray([255, 0, 0, 255]);
    toneImageData(bw, 'bw');
    expect([...bw]).toEqual([76, 76, 76, 255]);
    const sepia = new Uint8ClampedArray([100, 100, 100, 255]);
    toneImageData(sepia, 'sepia');
    expect([...sepia]).toEqual([135, 120, 94, 255]);
    const normal = new Uint8ClampedArray([10, 20, 30, 255]);
    toneImageData(normal, 'normal');
    expect([...normal]).toEqual([10, 20, 30, 255]);
  });

  it('a toned ring tile is read back and written', () => {
    const { ctx, calls } = fakeCtx();
    drawPhotoRing(ctx, [img], decor({ photoStyle: 'bw' }), 'gold');
    expect(calls.some((c) => c.name === 'putImageData')).toBe(true);
  });

  it('a scaled-down canvas tones the tile in canvas pixels', () => {
    const { ctx: inner, calls } = fakeCtx();
    const ctx = new Proxy(inner, {
      get: (target, prop) =>
        prop === 'getTransform' ? () => ({ a: 0.5, d: 0.5, e: 0, f: 0 }) : Reflect.get(target, prop),
    });
    drawPhotoRing(ctx, [img, img], decor({ photoStyle: 'sepia' }), 'gold');
    const puts = calls.filter((c) => c.name === 'putImageData');
    // Клітинка 1: x 158, y 8, 134×188 у повних координатах → половина в пікселях полотна.
    expect(puts[1]!.args.slice(1)).toEqual([79, 4]);
    expect((puts[1]!.args[0] as { data: Uint8ClampedArray }).data.length).toBe(67 * 94 * 4);
  });

  it('round frame clips a circle', () => {
    const { ctx, calls } = fakeCtx();
    drawPhotoDisc(ctx, img, decor().photos[0]!, decor({ frame: 'round' }), 256);
    expect(calls.some((c) => c.name === 'arc')).toBe(true);
    expect(calls.some((c) => c.name === 'clip')).toBe(true);
  });

  it('a card with a missing photo stays dark and rounded frames clip', () => {
    const { ctx, calls } = fakeCtx();
    drawPhotoCard(ctx, null, decor().photos[0]!, decor({ frame: 'rounded' }), { width: 512, height: 256 });
    expect(calls.some((c) => c.name === 'drawImage')).toBe(false);
    expect(calls.find((c) => c.name === 'fillRect')!.args).toEqual([0, 0, 512, 256]);
  });

  it('the disc rim is drawn after the photo is toned', () => {
    const { ctx, calls } = fakeCtx();
    drawPhotoDisc(ctx, img, decor().photos[0]!, decor({ frame: 'gold', photoStyle: 'sepia' }), 256);
    const put = calls.findIndex((c) => c.name === 'putImageData');
    const rim = calls.findIndex((c) => c.name === 'fill' && c.args[0] === 'evenodd');
    expect(put).toBeGreaterThan(-1);
    expect(rim).toBeGreaterThan(put);
  });

  it('band fills the face size', () => {
    const { ctx, calls } = fakeCtx();
    drawBand(ctx, insc({ place: 'band', text: 'Hi', look: 'colored' }), 'gold', BAND_PX.face);
    expect(calls.find((c) => c.name === 'fillRect')!.args).toEqual([0, 0, 1024, 128]);
    const text = calls.find((c) => c.name === 'fillText')!;
    const px = Number(/(\d+(?:\.\d+)?)px/.exec(text.font)![1]);
    expect(px).toBeLessThanOrEqual(88);
    expect(px).toBeGreaterThan(44);
    expect(text.args[2]).toBe(64);
    const ring = fakeCtx();
    drawBand(ring.ctx, insc({ place: 'band', text: 'Hi', look: 'colored' }), 'gold');
    expect(ring.calls.find((c) => c.name === 'fillRect')!.args).toEqual([0, 0, 1024, 64]);
  });

  it('medallion bezel is painted when there is no frame', () => {
    const arcRadii = (calls: Call[]) => calls.filter((c) => c.name === 'arc').map((c) => c.args[2]);
    const none = fakeCtx();
    drawPhotoDisc(none.ctx, img, decor().photos[0]!, decor({ frame: 'none' }), 512, 'gold', true);
    expect(arcRadii(none.calls)).toContain(256);
    expect(arcRadii(none.calls)).toContain(256 - 512 * 0.035);
    expect(none.calls.some((c) => c.name === 'fill' && c.args[0] === 'evenodd')).toBe(true);
    const framed = fakeCtx();
    drawPhotoDisc(framed.ctx, img, decor().photos[0]!, decor({ frame: 'gold' }), 512, 'gold', true);
    expect(arcRadii(framed.calls)).toContain(256 - 512 * 0.07);
    expect(arcRadii(framed.calls)).not.toContain(256 - 512 * 0.035);
    const off = fakeCtx();
    drawPhotoDisc(off.ctx, img, decor().photos[0]!, decor({ frame: 'none' }), 512, 'gold');
    expect(arcRadii(off.calls)).not.toContain(256 - 512 * 0.035);
    expect(off.calls.some((c) => c.name === 'fill' && c.args[0] === 'evenodd')).toBe(false);
  });

  it('a framed card tones before the frame stroke', () => {
    const { ctx, calls } = fakeCtx();
    drawPhotoCard(ctx, img, decor().photos[0]!, decor({ frame: 'gold', photoStyle: 'bw' }), { width: 200, height: 100 });
    const put = calls.findIndex((c) => c.name === 'putImageData');
    const stroke = calls.findIndex((c) => c.name === 'stroke');
    expect(put).toBeGreaterThan(-1);
    expect(stroke).toBeGreaterThan(put);
  });
});
