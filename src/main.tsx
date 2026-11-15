import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import NineStrokesPage from './sites/nine-strokes/NineStrokesPage';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NineStrokesPage />
  </StrictMode>,
);
