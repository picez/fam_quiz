import '@fontsource-variable/unbounded';
import '@fontsource-variable/onest';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Home } from './pages/Home';
import { Host } from './pages/Host';
import { NewGame } from './pages/NewGame';
import { Play } from './pages/Play';
import { Stage } from './pages/Stage';

const root = document.getElementById('root');
if (root === null) throw new Error('root element is missing');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/new" element={<NewGame />} />
        <Route path="/play/:code" element={<Play />} />
        <Route path="/host/:code" element={<Host />} />
        <Route path="/stage/:code" element={<Stage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
