import { afterEach, describe, expect, it, vi } from 'vitest';
import { authProviders, deleteQuiz, googleSignIn, listQuizzes, me, signIn, signOut, signUp, updateQuiz, uploadImage } from './api';

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
    await updateQuiz('q1', { title: 'Гра', description: '', settings: { speedBonus: true, leaderboard: 'each', shuffleOptions: false }, questions: [] });
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
});
