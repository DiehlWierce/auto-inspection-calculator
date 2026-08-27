import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

/**
 * Идентификатор сборки: версия пакета + отметка времени.
 * Он попадает в URL регистрации service worker, поэтому каждая новая сборка
 * заставляет браузер обновить service worker и очистить старый кэш.
 */
const buildId = `${pkg.version}-${new Date()
  .toISOString()
  .replace(/[-:T.]/g, '')
  .slice(0, 12)}`;

// base задаётся переменной окружения, чтобы приложение можно было выложить
// не только на GitHub Pages в подпапку, но и в корень собственного домена.
const base = process.env.APP_BASE ?? '/auto-inspection-calculator/';

export default defineConfig({
  base,
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(buildId),
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
