// src/i18n/useTranslation.ts
// React hook that provides translation function and re-renders on language change
import { useState, useEffect, useCallback } from 'react';
import { i18n, onLanguageChange, getCurrentLanguage } from './index';

/**
 * Hook that provides the translation function and current locale.
 * Automatically re-renders when the language changes.
 *
 * Usage:
 *   const { t, locale } = useTranslation();
 *   <Text>{t('home.searchPlaceholder')}</Text>
 *   <Text>{t('booking.total')}: $15.00</Text>
 */
export function useTranslation() {
  const [locale, setLocale] = useState(getCurrentLanguage());

  useEffect(() => {
    const unsubscribe = onLanguageChange((newLocale) => {
      setLocale(newLocale);
    });
    return unsubscribe;
  }, []);

  const t = useCallback(
    (key: string, options?: Record<string, any>): string => {
      return i18n.t(key, options);
    },
    [locale] // Re-create when locale changes to ensure fresh translations
  );

  return { t, locale };
}

export default useTranslation;