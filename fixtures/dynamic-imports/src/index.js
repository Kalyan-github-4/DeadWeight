import dayjs from 'dayjs';
import { loadLocale } from './i18n.js';

export async function runPlugin(name) {
  const plugin = await import(`./plugins/${name}.js`);
  return plugin.default();
}

export async function weekday(lang) {
  await loadLocale(lang);
  return dayjs().locale(lang).format('dddd');
}
