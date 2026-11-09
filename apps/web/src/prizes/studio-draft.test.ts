import { EMPTY_DECOR, prizeContentSchema, type Inscription, type PrizeContent, type TrophyDecor } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { contentOf, draftFrom, photoLimit, studioIssues, studioLook, studioReducer, type StudioAction, type StudioDraft } from './studio-draft';

const url = (n: number) => `/uploads/${String(n).padStart(16, 'a')}.jpg`;
const crop = { x: 0.5, y: 0.5, scale: 1 };
const insc = (over: Partial<Inscription> = {}): Inscription => ({ place: 'rim', text: 'Браво', font: null, look: 'engraved', color: '#3a2a0e', ...over });
const decorOf = (over: Partial<TrophyDecor> = {}): TrophyDecor => ({ ...EMPTY_DECOR, ...over });
const base = (over: Partial<PrizeContent> = {}): PrizeContent => ({
  name: 'Кубок',
  trophy: { kind: 'cup', material: 'gold' },
  engraving: null,
  real: null,
  title: null,
  diploma: false,
  ...over,
});
const run = (draft: StudioDraft, ...actions: StudioAction[]) => actions.reduce(studioReducer, draft);

describe('studio draft', () => {
  it('a new draft', () => {
    const draft = draftFrom(null);
    expect(draft.trophy).toEqual({ kind: 'cup', material: 'gold' });
    expect(draft.decor).toEqual(EMPTY_DECOR);
    expect(draft.name).toBe('');
    const content = contentOf({ ...draft, name: 'Кубок' }, null);
    expect(prizeContentSchema.safeParse(content).success).toBe(true);
    expect(content.trophy).not.toHaveProperty('decor');
    expect(studioLook(draft)).toEqual({ kind: 'cup', material: 'gold', decor: EMPTY_DECOR });
  });

  it('an old prize renamed keeps no decor', () => {
    const initial = base({ trophy: { kind: 'cup', material: 'silver' }, engraving: 'Браво' });
    const content = contentOf({ ...draftFrom(initial), name: 'Нова' }, initial);
    expect(content).toEqual({ ...initial, name: 'Нова' });
    expect(content.trophy).not.toHaveProperty('decor');
    const medal = base({ trophy: { kind: 'medal', material: 'bronze' } });
    expect(contentOf(draftFrom(medal), medal).trophy).not.toHaveProperty('decor');
  });

  it('emptied decor is removed', () => {
    const initial = base({ trophy: { kind: 'cup', material: 'gold', decor: decorOf({ inscriptions: [insc()], appearance: 'rise' }) } });
    const draft = run(draftFrom(initial), { type: 'inscription', place: 'rim', value: null }, { type: 'appearance', appearance: 'spin' });
    expect(contentOf(draft, initial).trophy!.decor).toBeNull();
  });

  it('the grail always carries decor', () => {
    const draft = { ...draftFrom(null), trophy: { kind: 'grail', material: 'gold' } } as StudioDraft;
    expect(contentOf(draft, null).trophy!.decor).toEqual(EMPTY_DECOR);
    const initial = base({ trophy: { kind: 'grail', material: 'gold' } });
    expect(contentOf(draftFrom(initial), initial).trophy!.decor).toEqual(EMPTY_DECOR);
  });

  it('kind switch keeps the draft and saves only supported places', () => {
    const photos = [1, 2, 3].map((n) => ({ url: url(n), crop }));
    let draft = draftFrom(null);
    draft = run(draft, { type: 'addPhotos', urls: photos.map((p) => p.url) }, { type: 'inscription', place: 'rim', value: insc() });
    const cup = contentOf(draft, null).trophy!.decor!;
    expect(cup.photos).toHaveLength(3);
    expect(cup.inscriptions.map((i) => i.place)).toEqual(['rim']);

    draft = run(draft, { type: 'trophy', kind: 'medal' });
    expect(draft.decor.photos).toHaveLength(3);
    expect(draft.decor.inscriptions).toHaveLength(1);
    // nothing the medal has is set, so the shown decor is empty: no decor key for a prize that had none
    expect(contentOf(draft, null).trophy).not.toHaveProperty('decor');
    const withEffect = run(draft, { type: 'effect', kind: 'sparks' });
    const medal = contentOf(withEffect, null).trophy!.decor!;
    expect(medal.photos).toEqual([]);
    expect(medal.inscriptions).toEqual([]);
    expect(medal.effect.kind).toBe('sparks');

    draft = run(draft, { type: 'trophy', kind: 'cup' });
    const back = contentOf(draft, null).trophy!.decor!;
    expect(back.photos).toHaveLength(3);
    expect(back.inscriptions.map((i) => i.place)).toEqual(['rim']);
  });

  it('a trophy comes back from none with the draft decor', () => {
    const draft = run(draftFrom(null), { type: 'effect', kind: 'fire' }, { type: 'trophy', kind: null }, { type: 'trophy', kind: 'star' });
    expect(draft.trophy).toEqual({ kind: 'star', material: 'gold' });
    expect(draft.decor.effect.kind).toBe('fire');
    expect(studioLook(run(draft, { type: 'trophy', kind: null }))).toBeNull();
  });

  it('photo limits', () => {
    expect([photoLimit('ring'), photoLimit('gems'), photoLimit('medallion'), photoLimit('plaque'), photoLimit('backdrop')]).toEqual([16, 8, 1, 1, 1]);
    let draft = run(draftFrom(null), { type: 'addPhotos', urls: Array.from({ length: 20 }, (_, i) => url(i)) });
    expect(draft.decor.photos).toHaveLength(16);
    expect(draft.decor.photos.every((p) => p.crop.scale === 1 && p.crop.x === 0.5)).toBe(true);
    expect(run(draft, { type: 'addPhotos', urls: [url(99)] })).toBe(draft);

    draft = run(draft, { type: 'photoPlace', place: 'medallion' });
    expect(draft.decor.photos.map((p) => p.url)).toEqual([url(0)]);

    draft = run(draftFrom(null), { type: 'addPhotos', urls: [url(1), url(2), url(3)] }, { type: 'movePhoto', from: 2, to: 0 });
    expect(draft.decor.photos.map((p) => p.url)).toEqual([url(3), url(1), url(2)]);
    draft = run(draft, { type: 'removePhoto', index: 1 });
    expect(draft.decor.photos.map((p) => p.url)).toEqual([url(3), url(2)]);
    const next = { x: 0.2, y: 0.8, scale: 2 };
    draft = run(draft, { type: 'crop', index: 1, crop: next });
    expect(draft.decor.photos.map((p) => p.crop)).toEqual([crop, next]);
  });

  it('inscriptions and stickers stay in place order', () => {
    let draft = run(
      draftFrom(null),
      { type: 'inscription', place: 'plaque', value: insc({ place: 'plaque' }) },
      { type: 'inscription', place: 'rim', value: insc() },
    );
    expect(draft.decor.inscriptions.map((i) => i.place)).toEqual(['rim', 'plaque']);
    draft = run(draft, { type: 'inscription', place: 'rim', value: insc({ text: 'Інше' }) });
    expect(draft.decor.inscriptions.map((i) => i.text)).toEqual(['Інше', 'Браво']);
    draft = run(draft, { type: 'inscription', place: 'rim', value: null });
    expect(draft.decor.inscriptions.map((i) => i.place)).toEqual(['plaque']);

    draft = run(draftFrom(null), { type: 'sticker', place: 'right', id: 'a' }, { type: 'sticker', place: 'front', id: 'b' });
    expect(draft.decor.stickers.map((s) => s.place)).toEqual(['front', 'right']);
    draft = run(draft, { type: 'sticker', place: 'front', id: 'c' });
    expect(draft.decor.stickers[0]).toEqual({ id: 'c', place: 'front' });
    draft = run(draft, { type: 'sticker', place: 'front', id: null });
    expect(draft.decor.stickers.map((s) => s.place)).toEqual(['right']);
  });

  it('glow colour', () => {
    expect(run(draftFrom(null), { type: 'effect', kind: 'glow' }).decor.effect).toEqual({ kind: 'glow', color: '#ffd36b' });
    expect(run(draftFrom(null), { type: 'effect', kind: 'glow', color: '#112233' }).decor.effect).toEqual({ kind: 'glow', color: '#112233' });
    const fire = run(draftFrom(null), { type: 'effect', kind: 'fire', color: '#000000' }).decor.effect;
    expect(fire).toEqual({ kind: 'fire' });
    expect(fire).not.toHaveProperty('color');
  });

  it('simple fields', () => {
    const draft = run(
      draftFrom(null),
      { type: 'name', value: 'N' },
      { type: 'engraving', value: 'E' },
      { type: 'title', value: 'T' },
      { type: 'diploma', value: true },
      { type: 'real', value: { text: 'R', photoUrl: null } },
      { type: 'material', material: 'diamond' },
      { type: 'frame', frame: 'gold' },
      { type: 'photoStyle', style: 'sepia' },
    );
    expect(contentOf(draft, null)).toMatchObject({ name: 'N', engraving: 'E', title: 'T', diploma: true, real: { text: 'R', photoUrl: null } });
    expect(draft.trophy!.material).toBe('diamond');
    expect(draft.decor.frame).toBe('gold');
    expect(draft.decor.photoStyle).toBe('sepia');
  });
});

describe('studio issues', () => {
  it('a ready prize has none', () => {
    expect(studioIssues(base())).toEqual([]);
  });

  it('an empty name', () => {
    expect(studioIssues(base({ name: '' }))).toEqual(['name']);
    expect(studioIssues(base({ name: '   ' }))).toEqual(['name']);
  });

  it('no options at all comes first', () => {
    expect(studioIssues(base({ trophy: null }))).toEqual(['prize_empty']);
    expect(studioIssues(base({ trophy: null, name: '' }))).toEqual(['prize_empty', 'name']);
  });

  it('a rim over the limit', () => {
    const decor = decorOf({ inscriptions: [insc({ text: 'а'.repeat(81) })] });
    expect(studioIssues(base({ trophy: { kind: 'cup', material: 'gold', decor } }))).toEqual(['decor_text_length']);
  });

  it('too many photos for the place', () => {
    const decor = decorOf({ photoPlace: 'medallion', photos: [{ url: url(1), crop }, { url: url(2), crop }] });
    expect(studioIssues(base({ trophy: { kind: 'cup', material: 'gold', decor } }))).toEqual(['decor_too_many_photos']);
  });

  it('a photo and a text on the plaque', () => {
    const draft = run(
      draftFrom(null),
      { type: 'name', value: 'К' },
      { type: 'photoPlace', place: 'plaque' },
      { type: 'addPhotos', urls: [url(1)] },
      { type: 'inscription', place: 'plaque', value: insc({ place: 'plaque' }) },
    );
    expect(studioIssues(contentOf(draft, null))).toEqual(['decor_plaque_twice']);
  });

  it('other schema failures are fill', () => {
    expect(studioIssues(base({ real: { text: '', photoUrl: null } }))).toEqual(['fill']);
  });
});
