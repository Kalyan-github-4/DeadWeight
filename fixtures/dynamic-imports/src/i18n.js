export async function loadLocale(lang) {
  await import(`dayjs/locale/${lang}.js`);
  return import('../locales/' + lang + '.js');
}
