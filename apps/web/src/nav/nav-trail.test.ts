// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { backTarget, forgetTrail, recordStep } from './nav-trail';

const spot = (key: string, pathname: string, search = '') => ({ key, pathname, search });

beforeEach(forgetTrail);

describe('nav trail (76)', () => {
  it('remembers the page a push came from', () => {
    recordStep(null, spot('default', '/'), 'POP');
    recordStep(spot('default', '/'), spot('a', '/profile/friends'), 'PUSH');
    expect(backTarget('a')).toEqual({ from: '/', steps: 1 });
  });

  it('counts query-only pushes as more steps back to the same origin', () => {
    recordStep(spot('k0', '/quizzes', '?sort=title'), spot('k1', '/help'), 'PUSH');
    recordStep(spot('k1', '/help'), spot('k2', '/help', '?topic=x'), 'PUSH');
    expect(backTarget('k2')).toEqual({ from: '/quizzes?sort=title', steps: 2 });
  });

  it('a replace keeps the record of the replaced entry; a pop writes nothing', () => {
    recordStep(spot('k0', '/'), spot('k1', '/inbox'), 'PUSH');
    recordStep(spot('k1', '/inbox'), spot('k2', '/inbox', '?x=1'), 'REPLACE');
    expect(backTarget('k2')).toEqual({ from: '/', steps: 1 });
    recordStep(spot('k2', '/inbox'), spot('k0', '/'), 'POP');
    expect(backTarget('k0')).toBeNull();
  });

  it('a deep link has no origin, and a fresh open forgets a stale default record', () => {
    recordStep(spot('k0', '/'), spot('default', '/inbox'), 'PUSH');
    expect(backTarget('default')).not.toBeNull();
    recordStep(null, spot('default', '/profile/friends'), 'POP');
    expect(backTarget('default')).toBeNull();
  });

  it('survives a reload through sessionStorage', () => {
    recordStep(spot('k0', '/'), spot('k1', '/inbox'), 'PUSH');
    expect(JSON.parse(sessionStorage.getItem('quiz.nav.trail') ?? '{}')).toHaveProperty('k1');
  });
});
