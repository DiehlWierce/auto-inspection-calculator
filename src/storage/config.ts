import type { AppConfig } from '../types';
import { request } from './db';
import { normalizeConfig } from './normalize';

export async function loadConfig(): Promise<AppConfig> {
  const stored = await request<AppConfig | undefined>('config', 'readonly', (store) => store.get('current'));
  return normalizeConfig(stored);
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await request('config', 'readwrite', (store) => store.put(config));
}
