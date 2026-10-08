import { createContext, useContext } from 'react';
import { detectUiLang, t as translate, type UiKey, type UiLang } from '@perde/shared';

export const UiLangContext = createContext<UiLang>('tr');

export function useUiLang(): UiLang {
  return useContext(UiLangContext);
}

export function useT(): (key: UiKey) => string {
  const lang = useUiLang();
  return (key) => translate(key, lang);
}

export function initialUiLang(): UiLang {
  try {
    const stored = localStorage.getItem('perde.lang');
    if (stored === 'tr' || stored === 'en') return stored;
  } catch {
    /* ignore */
  }
  return detectUiLang(typeof navigator !== 'undefined' ? navigator.language : undefined);
}

export function storeUiLang(lang: UiLang) {
  try {
    localStorage.setItem('perde.lang', lang);
  } catch {
    /* ignore */
  }
}
