import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import resources from './i18nResources.js';

try {
  tizen.systeminfo.getPropertyValue("LOCALE", function (locale) {
    InitI18next(locale.language.replace(/(\_.*)/g, ''));
  }, function (_) {
    InitI18next(navigator.language.replace(/(\-.*)/g, ''));
  });
} catch (e) {
  InitI18next(navigator.language.replace(/(\-.*)/g, ''));
}


function InitI18next(lng) {
  i18n
    .use(initReactI18next)
    .init({
      lng,
      fallbackLng: 'en',
      resources,
      debug: true,
      interpolation: {
        escapeValue: false,
      }
    });
}
export default i18n;