import { describe, expect, it } from 'vitest';
import { adjustScore } from './adjust';
import { buyDebuff, setDebuff } from './debuffs';
import { end, next, pause, removePlayer, setConnected, start } from './game';
import { T0, debuffQuiz, rich, rng } from './testing/debuffs';
import { lobbyWith, must } from './testing/helpers';
import { hostView, playerView as viewOf, stageView } from './views';

const playerView = (...args: Parameters<typeof viewOf>) => viewOf(...args)!;

describe('the debuff shop in views', () => {
  it('lists allowed debuffs with prices and rivals, marks a busy rival, and says why buying is blocked', () => {
    const s = rich({ debuffs: ['fog', 'mud'], debuffPrices: { fog: 100 } });
    const shop = playerView(s, 'p1').me.shop!;
    expect(shop.items).toEqual([{ kind: 'fog', price: 100 }, { kind: 'mud', price: 200 }]);
    expect(shop.targets.map((t) => [t.nickname, t.busy])).toEqual([['Тарас', false], ['Віра', false]]);
    expect(shop.block).toBeNull();
    const bought = must(buyDebuff(s, 'p1', 'p2', 'fog', T0));
    expect(playerView(bought, 'p1').me.shop!.block).toBe('bought');
    expect(playerView(bought, 'p3').me.shop!.targets.find((t) => t.playerId === 'p2')?.busy).toBe(true);
    expect(playerView(must(pause(bought, T0)), 'p3').me.shop!.block).toBe('paused');
  });

  it('marks an offline rival as offline', () => {
    const away = must(setConnected(rich(), 'p2', false, T0));
    expect(playerView(away, 'p1').me.shop!.targets.map((t) => [t.nickname, t.offline])).toEqual([['Тарас', true], ['Віра', false]]);
  });

  it('no shop in the lobby, the guide, after the game, without debuffs, without rivals or with the shop off', () => {
    expect(playerView(lobbyWith(debuffQuiz(), 'Олена', 'Тарас'), 'p1').me.shop).toBeNull();
    expect(playerView(rich({ debuffs: [] }), 'p1').me.shop).toBeNull();
    expect(playerView(rich({ debuffShop: false }), 'p1').me.shop).toBeNull();
    const alone = must(start(lobbyWith(debuffQuiz(), 'Олена')));
    expect(playerView(alone, 'p1').me.shop).toBeNull();
    expect(playerView(must(end(rich(), T0)), 'p1').me.shop).toBeNull();
    const guide = lobbyWith({ ...debuffQuiz(), settings: { ...debuffQuiz().settings, newcomers: true } }, 'Олена', 'Тарас');
    expect(playerView(must(start(guide)), 'p1').me.shop).toBeNull();
  });

  it('the victim learns the buyer when the debuff fires, not before', () => {
    const bought = must(buyDebuff(rich(), 'p1', 'p2', 'fog', T0));
    expect(playerView(bought, 'p2').me.debuff).toBeNull();
    const opened = must(next(bought, T0 + 1000, rng));
    expect(playerView(opened, 'p2').me.debuff).toEqual({ kind: 'fog', since: T0 + 1000, by: 'Олена' });
    const host = must(next(must(setDebuff(rich(), 'p2', 'fog')), T0 + 1000, rng));
    expect(playerView(host, 'p2').me.debuff?.by).toBeNull();
    const noBuyer = must(removePlayer(opened, 'p1'));
    expect(playerView(noBuyer, 'p2').me.debuff?.by).toBeNull();
  });

  it('the host sees the kind and the buyer', () => {
    const bought = must(buyDebuff(rich(), 'p1', 'p2', 'fog', T0));
    expect(hostView(bought).players.find((p) => p.id === 'p2')?.debuff).toEqual({ kind: 'fog', fired: false, by: 'Олена' });
    expect(hostView(must(setDebuff(rich(), 'p2', 'fog'))).players.find((p) => p.id === 'p2')?.debuff?.by).toBeNull();
  });

  it('the purchase notice names the buyer and the target but not the kind, for every role', () => {
    const bought = must(buyDebuff(rich(), 'p1', 'p2', 'fog', T0 + 5));
    const notice = {
      seq: bought.adjustments.at(-1)!.seq,
      at: T0 + 5,
      buyer: { playerId: 'p1', nickname: 'Олена' },
      target: { playerId: 'p2', nickname: 'Тарас' },
    };
    for (const view of [stageView(bought), hostView(bought), playerView(bought, 'p2'), playerView(bought, 'p3')]) {
      expect(view.debuffNotice).toEqual(notice);
    }
    expect(JSON.stringify(stageView(bought).debuffNotice)).not.toContain('fog');
    expect(stageView(rich()).debuffNotice).toBeNull();
    // бали від ведучого після покупки не змінюють сповіщення
    expect(stageView(must(adjustScore(bought, 'p3', 10, T0 + 9))).debuffNotice).toEqual(notice);
    // вилучення покупця чи цілі гасить його
    expect(stageView(must(removePlayer(bought, 'p1'))).debuffNotice).toBeNull();
    expect(stageView(must(removePlayer(bought, 'p2'))).debuffNotice).toBeNull();
  });
});
