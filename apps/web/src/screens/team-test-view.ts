import type { PlayerTeam, PlayerView, PublicQuestion, TeamsView } from '@quiz/shared';

/** Тестова підтримка: зріз учасника командної гри (капітан Оля, у команді «Сині» ще Петро й Ната; є «Червоні»). */
export const publicQuestion: PublicQuestion = {
  type: 'single',
  text: 'Столиця України?',
  imageUrl: null,
  video: null,
  timeLimit: 20,
  points: 1000,
  right: [], chain: null, sort: null, orderLabels: null, slider: null, clues: null, pin: null, wall: null, cloud: null, survey: null, audio: null, reveal: null,
  choices: [
    { id: 'a', text: 'Львів' },
    { id: 'b', text: 'Київ' },
  ],
};

export const baseMe: PlayerView['me'] = { id: 'team-b', nickname: 'Сині', score: 0, rank: null, answer: null, result: null, blitz: null, final: null, wipeout: null, survival: null, ladder: null, chain: null, sort: null, survey: null, bluff: null, debuff: null, shop: null, duel: null, buffs: null, overtime: null, tip: null, vote: null, wall: null };

export const teamsView = (over: Partial<TeamsView> = {}): TeamsView => ({
  form: 'pick',
  teams: [
    { id: 'team-a', name: 'Червоні', color: 0, captainId: 'u1', members: [{ id: 'u1', nickname: 'Іра', connected: true }] },
    {
      id: 'team-b',
      name: 'Сині',
      color: 1,
      captainId: 'u2',
      members: [
        { id: 'u2', nickname: 'Оля', connected: true },
        { id: 'u3', nickname: 'Петро', connected: true },
        { id: 'u4', nickname: 'Ната', connected: false },
      ],
    },
  ],
  unassigned: [],
  dice: null,
  ...over,
});

export const playerTeam = (over: Partial<PlayerTeam> = {}): PlayerTeam => ({
  memberId: 'u2',
  nickname: 'Оля',
  teamId: 'team-b',
  captainId: 'u2',
  captain: true,
  canAct: true,
  buzzerId: null,
  duelistId: null,
  canPickDuelist: false,
  canPick: false,
  canRoll: false,
  draft: null,
  ...over,
});

/** Зріз команди «Сині»; team перекриває поля учасника, over — решту зрізу. */
export const teamPlayerView = (over: Partial<PlayerView> = {}, team: Partial<PlayerTeam> = {}): PlayerView => ({
  role: 'player',
  phase: 'lobby',
  paused: false,
  blitz: null,
  board: null,
  spotlight: null,
  final: null,
  wipeout: null,
  survival: null,
  ladder: null,
  chain: null,
  sort: null,
  wall: null,
  survey: null,
  bluff: null,
  notice: null,
  buffs: [],
  buffNotice: null,
  debuffNotice: null,
  removed: [],
  splash: null,
  overtime: [],
  guide: null,
  newcomers: false,
  teams: teamsView(),
  duel: null,
  round: null,
  questionIndex: -1,
  total: 2,
  question: null,
  endsAt: null,
  remainingMs: null,
  playerCount: 2,
  answeredCount: 0,
  limitMs: null,
  held: false,
  me: baseMe,
  reveal: null,
  standings: null,
  table: null,
  myBreakdown: null,
  team: playerTeam(team),
  ...over,
});
