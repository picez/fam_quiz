import { afterEach, describe, expect, it, vi } from 'vitest';
import { setHideAnti, deletePushSubscription, fetchQuizLikes, createPrize, deletePrize, gamePrizes, myPrizes, placePrizes, updatePrize, authProviders, claimSlot, continueGame, deleteSavedGame, gameSlots, getFavoriteStickers, saveFavoriteStickers, createAutopilotGame, getAutopilotCheck, deleteQuiz, follow, unfollow, googleSignIn, listQuizzes, me, signIn, signOut, signUp, updateQuiz, uploadAudio, uploadImage } from './api';

afterEach(() => vi.unstubAllGlobals());

function respond(status: number, body?: unknown) {
  const fetchMock = vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('api', () => {
  it('returns the account fields on success', async () => {
    respond(200, { id: 'u1', name: 'Олена', email: 'o@example.com' });
    expect(await me()).toEqual({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com' });
  });

  it('passes our own error codes through', async () => {
    respond(401, { error: 'unauthorized' });
    expect(await me()).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('keeps the reason of an invalid payload so the page can say what is wrong', async () => {
    respond(400, { error: 'invalid_payload', reason: 'prize_empty' });
    expect(await createPrize({ name: 'x', trophy: null, engraving: null, real: null, title: null, diploma: false })).toEqual({
      ok: false,
      error: 'invalid_payload:prize_empty',
    });
    respond(400, { error: 'invalid_payload' });
    expect(await me()).toEqual({ ok: false, error: 'invalid_payload' });
  });

  it('talks to the prize routes', async () => {
    const content = { name: 'x', trophy: null, engraving: null, real: null, title: null, diploma: true };
    const fetchMock = respond(200, []) as unknown as { mock: { calls: any[][] } };
    await myPrizes();
    expect(fetchMock.mock.calls[0]).toEqual(['/api/me/prizes', expect.objectContaining({ method: 'GET' })]);
    await updatePrize('a b', content);
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/me/prizes/a%20b');
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({ method: 'PUT' });
    await deletePrize('p1');
    expect(fetchMock.mock.calls[2]![1]).toMatchObject({ method: 'DELETE' });
    await gamePrizes('123456');
    expect(fetchMock.mock.calls[3]![0]).toBe('/api/games/by-code/123456/prizes');
    await placePrizes('123456', ['a', null, null]);
    expect(fetchMock.mock.calls[4]![1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ places: ['a', null, null] }) });
  });

  it('translates sign-in and sign-up failures into our codes', async () => {
    respond(422, { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL', message: 'User already exists.' });
    expect(await signUp('Олена', 'o@example.com', 'password1')).toEqual({ ok: false, error: 'email_taken' });

    respond(401, { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' });
    expect(await signIn('o@example.com', 'nope')).toEqual({ ok: false, error: 'bad_credentials' });

    respond(400, { code: 'PASSWORD_TOO_SHORT', message: 'Password too short' });
    expect(await signUp('Олена', 'o@example.com', '123')).toEqual({ ok: false, error: 'password_short' });

    respond(400, { code: 'INVALID_EMAIL', message: 'Invalid email' });
    expect(await signUp('Олена', 'nope', 'password1')).toEqual({ ok: false, error: 'bad_email' });
  });

  it('recognises a sign-in refused because the app was opened at another address', async () => {
    respond(403, { code: 'INVALID_ORIGIN', message: 'Invalid origin' });
    expect(await signIn('o@example.com', 'password1')).toEqual({ ok: false, error: 'wrong_address' });
    respond(403, { code: 'MISSING_OR_NULL_ORIGIN', message: 'Missing or null Origin' });
    expect(await signIn('o@example.com', 'password1')).toEqual({ ok: false, error: 'wrong_address' });
  });

  it('reports too many attempts and a lost connection', async () => {
    respond(429, { error: 'Too Many Requests' });
    expect(await signIn('o@example.com', 'password1')).toEqual({ ok: false, error: 'too_many' });

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('failed to fetch'))));
    expect(await me()).toEqual({ ok: false, error: 'offline' });
  });

  it('returns a list as data', async () => {
    const list = [{ id: 'q1', title: 'Гра', description: '', questionCount: 2, updatedAt: '2026-10-12T10:00:00.000Z' }];
    respond(200, list);
    expect(await listQuizzes()).toEqual({ ok: true, data: list });
  });

  it('treats an empty 204 response as success', async () => {
    const fetchMock = respond(204);
    expect(await deleteQuiz('q1')).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/quizzes/q1', expect.objectContaining({ method: 'DELETE' }));
  });

  it('sends updates with PUT and sign-out with an empty JSON object', async () => {
    const put = respond(200, { id: 'q1' });
    await updateQuiz('q1', { title: 'Гра', description: '', settings: { leaderboard: 'each' }, rounds: [] });
    expect(put).toHaveBeenCalledWith('/api/quizzes/q1', expect.objectContaining({ method: 'PUT' }));

    const out = respond(200, { success: true });
    await signOut();
    expect(out).toHaveBeenCalledWith('/api/auth/sign-out', expect.objectContaining({ method: 'POST', body: '{}' }));
  });
});

describe('uploadImage', () => {
  it('sends the file itself with its type and returns the address', async () => {
    const fetchMock = respond(201, { url: '/uploads/0123456789abcdef.png' });
    const file = new File([new Uint8Array(4)], 'a.png', { type: 'image/png' });
    expect(await uploadImage(file)).toEqual({ ok: true, url: '/uploads/0123456789abcdef.png' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/uploads');
    expect(init.body).toBe(file);
    expect(new Headers(init.headers).get('content-type')).toBe('image/png');
  });

  it('passes the refusal code through', async () => {
    respond(413, { error: 'too_large' });
    const file = new File([new Uint8Array(4)], 'a.png', { type: 'image/png' });
    expect(await uploadImage(file)).toEqual({ ok: false, error: 'too_large' });
  });
});

describe('uploadAudio', () => {
  it('sends the file with its type to the audio route', async () => {
    const fetchMock = respond(201, { url: '/uploads/0123456789abcdef.mp3' });
    const file = new File([new Uint8Array(4)], 'a.mp3', { type: 'audio/mpeg' });
    expect(await uploadAudio(file)).toEqual({ ok: true, url: '/uploads/0123456789abcdef.mp3' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/uploads/audio');
    expect(init.body).toBe(file);
    expect(new Headers(init.headers).get('content-type')).toBe('audio/mpeg');
  });

  it('an unknown or missing browser type is replaced by the type from the file name', async () => {
    for (const [name, type, sent] of [
      ['song.m4a', 'audio/x-m4a-weird', 'audio/mp4'],
      ['song.ogg', '', 'audio/ogg'],
      ['song.mp3', 'application/octet-stream', 'audio/mpeg'],
      ['song.m4a', 'audio/x-m4a', 'audio/x-m4a'],
    ] as const) {
      const fetchMock = respond(201, { url: '/uploads/0123456789abcdef.mp3' });
      await uploadAudio(new File([new Uint8Array(4)], name, { type }));
      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(new Headers(init.headers).get('content-type')).toBe(sent);
    }
  });

  it('passes the refusal code through', async () => {
    respond(400, { error: 'bad_audio' });
    expect(await uploadAudio(new File([new Uint8Array(4)], 'a.mp3', { type: 'audio/mpeg' }))).toEqual({ ok: false, error: 'bad_audio' });
  });
});

describe('sign-in with Google', () => {
  it('asks the server whether Google is available', async () => {
    respond(200, { google: true });
    expect(await authProviders()).toEqual({ ok: true, google: true });
  });

  it('asks for the Google address with the page to return to and where to report a failure', async () => {
    const fetchMock = respond(200, { url: 'https://accounts.google.com/x', redirect: true });
    expect(await googleSignIn('/host/123456')).toMatchObject({ ok: true, url: 'https://accounts.google.com/x' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/auth/sign-in/social');
    expect(JSON.parse(String(init.body))).toEqual({
      provider: 'google',
      callbackURL: '/host/123456',
      errorCallbackURL: '/login',
    });
  });

  it('follow sends PUT without a body and unfollow sends DELETE', async () => {
    const fetchMock = respond(204);
    expect(await follow('u 2')).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/me/friends/u%202', { method: 'PUT', headers: undefined, body: undefined });
    await unfollow('u 2');
    expect(fetchMock).toHaveBeenLastCalledWith('/api/me/friends/u%202', { method: 'DELETE', headers: undefined, body: undefined });
  });
});

describe('autopilot', () => {
  it('creates a no-host game with the author nickname', async () => {
    const fetchMock = respond(201, { gameId: 'g', code: '123456', stageToken: 's', token: 't', playerId: 'p' });
    const result = await createAutopilotGame('q1', 'Марта');
    expect(result).toEqual({ ok: true, gameId: 'g', code: '123456', stageToken: 's', token: 't', playerId: 'p' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/games');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ quizId: 'q1', autopilot: true, nickname: 'Марта' });
  });

  it('asks the server whether a quiz can run without a host', async () => {
    const fetchMock = respond(200, { blocked: [], changed: [] });
    expect(await getAutopilotCheck('q1')).toEqual({ ok: true, blocked: [], changed: [] });
    expect(fetchMock).toHaveBeenCalledWith('/api/quizzes/q1/autopilot', { method: 'GET', headers: undefined, body: undefined });
  });
});

describe('favourite stickers (13a)', () => {
  it('reads and saves the list through /api/me/stickers', async () => {
    let fetchMock = respond(200, { favorites: ['nyaBeach'] });
    expect(await getFavoriteStickers()).toEqual({ ok: true, favorites: ['nyaBeach'] });
    expect(fetchMock).toHaveBeenCalledWith('/api/me/stickers', { method: 'GET', headers: undefined, body: undefined });

    fetchMock = respond(200, { favorites: ['nyaCute', 'nyaBeach'] });
    expect(await saveFavoriteStickers(['nyaCute', 'nyaBeach'])).toEqual({ ok: true, favorites: ['nyaCute', 'nyaBeach'] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/me/stickers');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ favorites: ['nyaCute', 'nyaBeach'] });
  });

  it('a guest gets unauthorized', async () => {
    respond(401, { error: 'unauthorized' });
    expect(await getFavoriteStickers()).toEqual({ ok: false, error: 'unauthorized' });
  });
});

describe('saved games (13b)', () => {
  it('continues, deletes, lists the places and claims one', async () => {
    let fetchMock = respond(201, { gameId: 'g1', code: '123456', hostToken: 'h', stageToken: 's' });
    expect(await continueGame('g 1')).toEqual({ ok: true, gameId: 'g1', code: '123456', hostToken: 'h', stageToken: 's' });
    expect(fetchMock).toHaveBeenCalledWith('/api/games/g%201/continue', expect.objectContaining({ method: 'POST', body: '{}' }));

    fetchMock = respond(204);
    expect(await deleteSavedGame('g1')).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/games/g1', expect.objectContaining({ method: 'DELETE' }));

    fetchMock = respond(200, { slots: [], mine: null });
    expect(await gameSlots('123456')).toEqual({ ok: true, data: { slots: [], mine: null } });
    expect(fetchMock).toHaveBeenCalledWith('/api/games/by-code/123456/slots', expect.objectContaining({ method: 'GET' }));

    fetchMock = respond(409, { error: 'slot_taken' });
    expect(await claimSlot('123456', 's1')).toEqual({ ok: false, error: 'slot_taken' });
    expect(fetchMock).toHaveBeenCalledWith('/api/games/by-code/123456/claim', expect.objectContaining({ method: 'POST', body: expect.stringContaining('"slotId":"s1"') }));
  });
});

describe('fetchQuizLikes', () => {
  it('returns the counts on 200 and null otherwise', async () => {
    const fetchMock = respond(200, { quiz: 2, questions: { q1: 1 } });
    expect(await fetchQuizLikes('a b')).toEqual({ quiz: 2, questions: { q1: 1 } });
    expect(fetchMock.mock.calls[0]).toEqual(['/api/quizzes/a%20b/likes', expect.anything()]);
    respond(404, { error: 'not_found' });
    expect(await fetchQuizLikes('x')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    expect(await fetchQuizLikes('x')).toBeNull();
  });
});

describe('push api', () => {
  it('deletes a subscription by endpoint', async () => {
    const fetchMock = respond(204);
    await deletePushSubscription('https://fcm.googleapis.com/fcm/send/a');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/me/push',
      expect.objectContaining({ method: 'DELETE', body: '{"endpoint":"https://fcm.googleapis.com/fcm/send/a"}' }),
    );
  });
});

describe('setHideAnti (12j)', () => {
  it('sends PUT with the switch', async () => {
    const fetchMock = respond(200, { hideAnti: true }) as unknown as { mock: { calls: any[][] } };
    expect(await setHideAnti(true)).toEqual({ ok: true, data: { hideAnti: true } });
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/me/achievements/hide-anti');
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ hide: true }) });
  });
});
