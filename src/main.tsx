import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Не найден корневой элемент #root');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Приложение публикуется в подпапке, поэтому service worker регистрируется
// от BASE_URL, а не от корня домена. Версия в query-параметре гарантирует,
// что после нового деплоя браузер скачает свежий service worker.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL;
    navigator.serviceWorker.register(`${base}sw.js?v=${__APP_VERSION__}`, { scope: base }).catch((error: unknown) => {
      console.warn('Офлайн-режим недоступен: не удалось зарегистрировать service worker.', error);
    });
  });
}
