/** Пункт меню, що світиться на сторінці (77): кожна сторінка з меню належить рівно одному. */
export type MenuSection = 'home' | 'quizzes' | 'feed' | 'history' | 'profile' | 'admin' | 'inbox' | 'login';

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

const SECTIONS: [section: MenuSection, bases: string[]][] = [
  // 80: «Як грати» для гравця — під «Головною» (раніше за /help, що в «Вікторинах»): гравець приходить з головної чи з гри.
  ['home', ['/help/play']],
  // «Провести гру» (/create), довідка ведучого й результати виклику — про власні вікторини.
  ['quizzes', ['/quizzes', '/library', '/create', '/help', '/challenge']],
  ['feed', ['/feed']],
  ['history', ['/history', '/me']],
  // Старі аліаси (/friends…) перенаправляють у профіль; вступ до групи за посиланням — теж розділ профілю.
  ['profile', ['/profile', '/friends', '/prizes', '/achievements', '/groups']],
  ['admin', ['/admin']],
  ['inbox', ['/inbox']],
  ['login', ['/login']],
];

/** Розділ меню для адреси; головна, «Як грати», «Повідомити про проблему» й невідоме — «Головна». */
export function menuSection(pathname: string): MenuSection {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return SECTIONS.find(([, bases]) => bases.some((base) => under(path, base)))?.[0] ?? 'home';
}
