// src/i18n/index.ts
// Internationalization setup for ShareStash
// Uses i18n-js for translations, AsyncStorage for persistence
// Device language detection works across Expo Go, dev builds, and production
import { I18n } from 'i18n-js';
import { Platform, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import translation files
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import pt from './locales/pt.json';
import zh from './locales/zh.json';

// Safe device language detection (works in Expo Go without expo-localization)
function getDeviceLanguage(): string {
  try {
    // Try expo-localization first (available in dev builds / production)
    const ExpoLocalization = require('expo-localization');
    const locales = ExpoLocalization.getLocales?.();
    if (locales?.[0]?.languageCode) return locales[0].languageCode;
  } catch {
    // expo-localization not available (Expo Go) — fall back to platform APIs
  }

  try {
    if (Platform.OS === 'ios') {
      const settings = NativeModules.SettingsManager?.settings;
      const lang = settings?.AppleLocale || settings?.AppleLanguages?.[0];
      if (lang) return lang.split(/[-_]/)[0];
    } else if (Platform.OS === 'android') {
      const lang = NativeModules.I18nManager?.localeIdentifier;
      if (lang) return lang.split(/[-_]/)[0];
    } else if (Platform.OS === 'web') {
      const nav = typeof navigator !== 'undefined' ? navigator.language : null;
      if (nav) return nav.split('-')[0];
    }
  } catch {
    // Silent fallback
  }

  return 'en';
}


// ============================================================================
// SUPPORTED LANGUAGES
// ============================================================================

export interface Language {
  code: string;
  name: string;         // English name
  nativeName: string;   // Name in its own language
  flag: string;         // Emoji flag
}

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: 'en', name: 'English',    nativeName: 'English',    flag: '🇺🇸' },
  { code: 'es', name: 'Spanish',    nativeName: 'Español',    flag: '🇪🇸' },
  { code: 'fr', name: 'French',     nativeName: 'Français',   flag: '🇫🇷' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português',  flag: '🇧🇷' },
  { code: 'zh', name: 'Chinese',    nativeName: '中文',        flag: '🇨🇳' },
];

const LANGUAGE_STORAGE_KEY = 'sharestash_language';

// ============================================================================
// INITIALIZE i18n
// ============================================================================

const i18n = new I18n({
  en,
  es,
  fr,
  pt,
  zh,
});

// Get device language code (e.g. "en", "es", "fr")
const deviceLanguage = getDeviceLanguage();

// Set defaults
i18n.defaultLocale = 'en';
i18n.locale = deviceLanguage;
i18n.enableFallback = true; // Fall back to English for missing translations

// ============================================================================
// LANGUAGE MANAGEMENT
// ============================================================================

// Track listeners for language changes (so components can re-render)
type LanguageChangeListener = (locale: string) => void;
const listeners: Set<LanguageChangeListener> = new Set();

/**
 * Load persisted language preference. Call once at app startup.
 */
export async function initializeLanguage(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved && SUPPORTED_LANGUAGES.some(l => l.code === saved)) {
      i18n.locale = saved;
    }
  } catch (error) {
    console.warn('Failed to load saved language:', error);
  }
}

/**
 * Change the app language and persist the choice.
 */
export async function changeLanguage(languageCode: string): Promise<void> {
  if (!SUPPORTED_LANGUAGES.some(l => l.code === languageCode)) {
    console.warn(`Unsupported language: ${languageCode}`);
    return;
  }

  i18n.locale = languageCode;
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, languageCode);

  // Notify all listeners
  listeners.forEach(listener => listener(languageCode));
}

/**
 * Get the current language code
 */
export function getCurrentLanguage(): string {
  return i18n.locale;
}

/**
 * Get the current Language object
 */
export function getCurrentLanguageInfo(): Language {
  return SUPPORTED_LANGUAGES.find(l => l.code === i18n.locale) || SUPPORTED_LANGUAGES[0];
}

/**
 * Subscribe to language changes (for forcing re-renders)
 */
export function onLanguageChange(listener: LanguageChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Translation shorthand — use in components:
 *   t('home.searchPlaceholder')
 *   t('booking.discountSaving', { amount: '$5.00', label: 'weekly discount' })
 */
export function t(key: string, options?: Record<string, any>): string {
  return i18n.t(key, options);
}

export { i18n };
export default i18n;