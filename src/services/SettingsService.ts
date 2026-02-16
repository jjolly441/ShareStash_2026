// src/services/SettingsService.ts — Platform settings (service fee, etc.) from Firestore
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

export interface PlatformSettings {
  serviceFeePercent: number;     // e.g., 10 for 10%
  updatedAt?: Timestamp;
  updatedBy?: string;            // admin userId who last changed it
}

const SETTINGS_DOC = 'settings';
const PLATFORM_KEY = 'platform';

// Default settings (used when Firestore doc doesn't exist yet)
const DEFAULT_SETTINGS: PlatformSettings = {
  serviceFeePercent: 10,
};

// In-memory cache to avoid re-fetching on every screen
let cachedSettings: PlatformSettings | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

class SettingsService {
  private static instance: SettingsService;

  static getInstance(): SettingsService {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService();
    }
    return SettingsService.instance;
  }

  /**
   * Get platform settings (cached for 5 min)
   */
  async getSettings(forceRefresh = false): Promise<PlatformSettings> {
    const now = Date.now();

    if (!forceRefresh && cachedSettings && now - cacheTimestamp < CACHE_TTL) {
      return cachedSettings;
    }

    try {
      const docRef = doc(db, SETTINGS_DOC, PLATFORM_KEY);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data() as PlatformSettings;
        cachedSettings = data;
        cacheTimestamp = now;
        return data;
      }

      // Document doesn't exist — create it with defaults
      await setDoc(docRef, {
        ...DEFAULT_SETTINGS,
        updatedAt: Timestamp.now(),
      });

      cachedSettings = DEFAULT_SETTINGS;
      cacheTimestamp = now;
      return DEFAULT_SETTINGS;
    } catch (error) {
      console.error('Error fetching platform settings:', error);
      // Return cached or defaults on error
      return cachedSettings || DEFAULT_SETTINGS;
    }
  }

  /**
   * Get the current service fee as a decimal (e.g., 0.10 for 10%)
   */
  async getServiceFeeDecimal(): Promise<number> {
    const settings = await this.getSettings();
    return settings.serviceFeePercent / 100;
  }

  /**
   * Update platform settings (admin only)
   */
  async updateSettings(
    updates: Partial<PlatformSettings>,
    adminUserId: string
  ): Promise<void> {
    try {
      const docRef = doc(db, SETTINGS_DOC, PLATFORM_KEY);
      await setDoc(
        docRef,
        {
          ...updates,
          updatedAt: Timestamp.now(),
          updatedBy: adminUserId,
        },
        { merge: true }
      );

      // Invalidate cache
      cachedSettings = null;
      cacheTimestamp = 0;
    } catch (error) {
      console.error('Error updating platform settings:', error);
      throw error;
    }
  }

  /**
   * Clear the cache (e.g., after admin updates)
   */
  clearCache(): void {
    cachedSettings = null;
    cacheTimestamp = 0;
  }
}

export default SettingsService.getInstance();