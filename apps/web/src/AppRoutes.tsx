import { Navigate, Route, Routes } from 'react-router-dom';
import { WithMenu } from './menu/WithMenu';
import { Achievements } from './pages/Achievements';
import { EditQuiz } from './pages/EditQuiz';
import { GameHistory } from './pages/GameHistory';
import { History } from './pages/History';
import { Home } from './pages/Home';
import { HostHelp } from './pages/HostHelp';
import { Host } from './pages/Host';
import { Login } from './pages/Login';
import { MyGames } from './pages/MyGames';
import { Play } from './pages/Play';
import { Profile } from './pages/Profile';
import { PublicProfile } from './pages/PublicProfile';
import { Quizzes } from './pages/Quizzes';
import { Stage } from './pages/Stage';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<WithMenu />}>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/quizzes" element={<Quizzes />} />
        <Route path="/quizzes/new" element={<EditQuiz />} />
        <Route path="/quizzes/:id" element={<EditQuiz />} />
        <Route path="/history" element={<History />} />
        <Route path="/history/:id" element={<GameHistory />} />
        <Route path="/me" element={<MyGames />} />
        <Route path="/achievements" element={<Achievements />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/profile/:id" element={<PublicProfile />} />
        <Route path="/profile/:id/achievements" element={<Achievements />} />
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
