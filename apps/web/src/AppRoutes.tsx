import { Navigate, Route, Routes } from 'react-router-dom';
import { Admin } from './admin/Admin';
import { WithMenu } from './menu/WithMenu';
import { Achievements } from './pages/Achievements';
import { EditQuiz } from './pages/EditQuiz';
import { Calendar } from './pages/Calendar';
import { CreateGame } from './pages/CreateGame';
import { Feed } from './pages/Feed';
import { Friends } from './pages/Friends';
import { GameHistory } from './pages/GameHistory';
import { GroupItemPage } from './pages/GroupItemPage';
import { GroupJoin } from './pages/GroupJoin';
import { GroupPage } from './pages/GroupPage';
import { Groups } from './pages/Groups';
import { History } from './pages/History';
import { Home } from './pages/Home';
import { HostHelp } from './pages/HostHelp';
import { Host } from './pages/Host';
import { Login } from './pages/Login';
import { MyGames } from './pages/MyGames';
import { Play } from './pages/Play';
import { Prizes } from './pages/Prizes';
import { PrizeStudioPage } from './pages/PrizeStudioPage';
import { Profile } from './pages/Profile';
import { PublicProfile } from './pages/PublicProfile';
import { ProfileLikes } from './pages/profile/ProfileLikes';
import { ProfileLooks } from './pages/profile/ProfileLooks';
import { ProfileQuizzes } from './pages/profile/ProfileQuizzes';
import { ProfileSettings } from './pages/profile/ProfileSettings';
import { ProfileStats } from './pages/profile/ProfileStats';
import { Quizzes } from './pages/Quizzes';
import { Stage } from './pages/Stage';

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
