import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import type { UiLang } from '@perde/shared';
import { UiLangContext, initialUiLang, storeUiLang } from './lib/ui';
import { Landing } from './pages/Landing';
import { Stage } from './pages/Stage';
import { Join } from './pages/Join';
import './styles.css';

function App() {
  const [lang, setLang] = useState<UiLang>(initialUiLang);
  const toggle = () => {
    const next = lang === 'tr' ? 'en' : 'tr';
    storeUiLang(next);
    setLang(next);
    document.documentElement.lang = next;
  };
  return (
    <UiLangContext.Provider value={lang}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing onToggleLang={toggle} />} />
          <Route path="/stage" element={<Stage />} />
          <Route path="/join" element={<Join onToggleLang={toggle} />} />
          <Route path="*" element={<Landing onToggleLang={toggle} />} />
        </Routes>
      </BrowserRouter>
    </UiLangContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
