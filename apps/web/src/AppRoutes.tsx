import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { WithMenu } from './menu/WithMenu';
import { Achievements } from './pages/Achievements';
import { CreateGame } from './pages/CreateGame';
import { Feed } from './pages/Feed';
import { Friends } from './pages/Friends';
import { History } from './pages/History';
import { Home } from './pages/Home';
import { Host } from './pages/Host';
import { Login } from './pages/Login';
import { MyGames } from './pages/MyGames';
import { Play } from './pages/Play';
import { Prizes } from './pages/Prizes';
import { Profile } from './pages/Profile';
import { PublicProfile } from './pages/PublicProfile';
import { ProfileLikes } from './pages/profile/ProfileLikes';
import { ProfileQuizzes } from './pages/profile/ProfileQuizzes';
import { ProfileSettings } from './pages/profile/ProfileSettings';
import { Quizzes } from './pages/Quizzes';
import { Stage } from './pages/Stage';

// Сторінки, без яких обходиться гравець, вантажаться окремими чанками (32): телефон, що входить у гру,
// не тягне редактор, довідку ведучого чи адмінку. Поки чанк іде, WithMenu показує «Підключаємося…».
const Admin = lazy(() => import('./admin/Admin').then((m) => ({ default: m.Admin })));
const EditQuiz = lazy(() => import('./pages/EditQuiz').then((m) => ({ default: m.EditQuiz })));
const Calendar = lazy(() => import('./pages/Calendar').then((m) => ({ default: m.Calendar })));
const GameHistory = lazy(() => import('./pages/GameHistory').then((m) => ({ default: m.GameHistory })));
const GroupItemPage = lazy(() => import('./pages/GroupItemPage').then((m) => ({ default: m.GroupItemPage })));
const GroupJoin = lazy(() => import('./pages/GroupJoin').then((m) => ({ default: m.GroupJoin })));
const GroupPage = lazy(() => import('./pages/GroupPage').then((m) => ({ default: m.GroupPage })));
const Groups = lazy(() => import('./pages/Groups').then((m) => ({ default: m.Groups })));
const HostHelp = lazy(() => import('./pages/HostHelp').then((m) => ({ default: m.HostHelp })));
const PrizeStudioPage = lazy(() => import('./pages/PrizeStudioPage').then((m) => ({ default: m.PrizeStudioPage })));
const ProfileLooks = lazy(() => import('./pages/profile/ProfileLooks').then((m) => ({ default: m.ProfileLooks })));
const ProfileStats = lazy(() => import('./pages/profile/ProfileStats').then((m) => ({ default: m.ProfileStats })));

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<WithMenu />}>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/create" element={<CreateGame />} />
        <Route path="/quizzes" element={<Quizzes />} />
        <Route path="/quizzes/new" element={<EditQuiz />} />
        <Route path="/quizzes/:id" element={<EditQuiz />} />
        <Route path="/feed" element={<Feed />} />
        <Route path="/feed/calendar" element={<Calendar />} />
        <Route path="/history" element={<History />} />
        <Route path="/history/:id" element={<GameHistory />} />
        <Route path="/me" element={<MyGames />} />
        <Route path="/profile" element={<Profile />} />
        {/* Підсторінки плиток профілю: статичні сегменти react-router ставить вище за /profile/:id. */}
        <Route path="/profile/quizzes" element={<ProfileQuizzes />} />
        <Route path="/profile/prizes" element={<Prizes />} />
        {/* Повноекранний редактор призу: шар поверх меню (position: fixed). */}
        <Route path="/profile/prizes/new" element={<PrizeStudioPage />} />
        <Route path="/profile/prizes/:id" element={<PrizeStudioPage />} />
        <Route path="/profile/achievements" element={<Achievements />} />
        <Route path="/profile/friends" element={<Friends />} />
        <Route path="/profile/stats" element={<ProfileStats />} />
        <Route path="/profile/likes" element={<ProfileLikes />} />
        <Route path="/profile/looks" element={<ProfileLooks />} />
        <Route path="/profile/settings" element={<ProfileSettings />} />
        {/* Групи (12k): список, група, форма запису; вступ за коротким посиланням. */}
        <Route path="/profile/groups" element={<Groups />} />
        <Route path="/profile/groups/:id" element={<GroupPage />} />
        <Route path="/profile/groups/:id/new" element={<GroupItemPage />} />
        <Route path="/profile/groups/:id/items/:itemId" element={<GroupItemPage />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/groups/join/:code" element={<GroupJoin />} />
        {/* Старі адреси — аліаси тих самих сторінок, не редірект. */}
        <Route path="/prizes" element={<Prizes />} />
        <Route path="/achievements" element={<Achievements />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/profile/:id" element={<PublicProfile />} />
        <Route path="/profile/:id/achievements" element={<Achievements />} />
        <Route path="/admin/*" element={<Admin />} />
        <Route path="/help" element={<HostHelp />} />
        <Route path="/new" element={<Navigate to="/quizzes" replace />} />
      </Route>
      <Route path="/play/:code" element={<Play />} />
      <Route path="/host/:code" element={<Host />} />
      <Route path="/stage/:code" element={<Stage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
