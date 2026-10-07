import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StoreProvider } from './state/store';
import { installAudioUnlock, sfx } from './ui/audio';

import './app.css';
import './ui/title.css';
import './ui/city.css';
import './ui/target.css';
import './ui/crew.css';
import './ui/room.css';
import './ui/board.css';
import './ui/run.css';
import './ui/report.css';

installAudioUnlock();

// A soft tick under every button that does not have a sound of its own.
document.addEventListener(
  'click',
  (e) => {
    const el = (e.target as HTMLElement | null)?.closest('button, [role="button"]');
    if (el && !el.closest('.dial, .call, .choice, .tempt__go, .go--count, .sound')) sfx.tap();
  },
  { capture: true },
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
