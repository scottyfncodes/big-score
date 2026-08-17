import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StoreProvider } from './state/store';

import './app.css';
import './ui/title.css';
import './ui/city.css';
import './ui/target.css';
import './ui/crew.css';
import './ui/room.css';
import './ui/board.css';
import './ui/run.css';
import './ui/report.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
