import '@fontsource-variable/unbounded';
import '@fontsource-variable/onest';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { EditQuiz } from './pages/EditQuiz';
import { Home } from './pages/Home';
import { Host } from './pages/Host';
import { Login } from './pages/Login';
import { Play } from './pages/Play';
import { Quizzes } from './pages/Quizzes';
import { Stage } from './pages/Stage';

const root = document.getElementById('root');
if (root === null) throw new Error('root element is missing');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/quizzes" element={<Quizzes />} />
        <Route path="/quizzes/new" element={<EditQuiz />} />
        <Route path="/quizzes/:id" element={<EditQuiz />} />
        <Route path="/new" element={<Navigate to="/quizzes" replace />} />
        <Route path="/play/:code" element={<Play />} />
        <Route path="/host/:code" element={<Host />} />
        <Route path="/stage/:code" element={<Stage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
