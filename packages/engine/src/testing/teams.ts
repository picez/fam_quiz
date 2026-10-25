import { defaultTeams, type Quiz, type Round } from '@quiz/shared';
import { addPlayer, createGame, start, type GameState } from '../game';
import { assignTeam } from '../teams';
import { makeRoundsQuiz } from './fixtures';
import { must } from './helpers';

/** Вікторина з settings.teams { count, names: типові } і раундами. */
export function teamQuiz(rounds: Round[], count = 2): Quiz {
  return makeRoundsQuiz(rounds, { teams: defaultTeams(count) });
}

/** Лобі командної гри з учасниками m1, m2, … у порядку аргументів (команди t1…tN, спосіб 'pick'). */
export function teamLobby(quiz: Quiz, ...nicknames: string[]): GameState {
  return nicknames.reduce((state, nickname, index) => must(addPlayer(state, { id: `m${index + 1}`, nickname })), createGame(quiz));
}

/**
 * Почата гра (етап intro першого раунду, без заставок) зі складом layout: layout[i] — нікнейми команди t(i+1);
 * учасники отримують m1, m2, … у порядку layout.flat(); капітан — перший у кожній команді.
 */
export function teamGame(quiz: Quiz, layout: string[][]): GameState {
  let state = teamLobby(quiz, ...layout.flat());
  let index = 0;
  layout.forEach((team, t) => {
    for (let k = 0; k < team.length; k++) state = must(assignTeam(state, `m${++index}`, `t${t + 1}`));
  });
  return must(start(state));
}
