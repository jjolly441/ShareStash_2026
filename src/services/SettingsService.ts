// src/services/SettingsService.ts — Platform settings (service fee, etc.) from Firestore
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from '../config/firebase';

// ============================================================================
// TYPES
// ============================================================================

export interface FeeTier {
  id: string;
  name: string;
  minAmount: number;       // minimum rental amount for this tier (inclusive)
  maxAmount: number;       // maximum rental amount (exclusive, use Infinity for top tier)
  feePercent: number;      // fee percentage for this tier
  description: string;
}

export interface PlatformSettings {
  serviceFeePercent: number;        // default flat fee (fallback)
  tieredFeesEnabled: boolean;       // whether to use tiered fees
  feeTiers: FeeTier[];              // tier definitions
  loyaltyDiscountEnabled: boolean;  // discount for high-volume users
  loyaltyThreshold: number;         // # of completed rentals to qualify
  loyaltyDiscountPercent: number;   // % discount off the fee (e.g. 2 = 2% off)
  updatedAt?: Timestamp;
  updatedBy?: string;
}

const SETTINGS_DOC = 'settings';
const PLATFORM_KEY = 'platform';

// Default fee tiers
const DEFAULT_FEE_TIERS: FeeTier[] = [
  { id: 'tier_1', name: 'Small Rentals', minAmount: 0, maxAmount: 50, feePercent: 15, description: 'Rentals under $50' },
  { id: 'tier_2', name: 'Standard Rentals', minAmount: 50, maxAmount: 200, feePercent: 10, description: '$50 - $200 rentals' },
  { id: 'tier_3', name: 'Large Rentals', minAmount: 200, maxAmount: 500, feePercent: 8, description: '$200 - $500 rentals' },
  { id: 'tier_4', name: 'Premium Rentals', minAmount: 500, maxAmount: 999999, feePercent: 5, description: 'Rentals over $500' },
];

// Default settings (used when Firestore doc doesn't exist yet)
const DEFAULT_SETTINGS: PlatformSettings = {
  serviceFeePercent: 10,
  tieredFeesEnabled: false,
  feeTiers: DEFAULT_FEE_TIERS,
  loyaltyDiscountEnabled: false,
  loyaltyThreshold: 10,
  loyaltyDiscountPercent: 2,
};

// In-memory cache to avoid re-fetching on every screen
let cachedSettings: PlatformSettings | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// SERVICE CLASS
// ============================================================================

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

    // If auth isn't ready yet, return cached or defaults silently
    if (!auth.currentUser) {
      return cachedSettings || DEFAULT_SETTINGS;
    }

    try {
      const docRef = doc(db, SETTINGS_DOC, PLATFORM_KEY);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        // Merge with defaults so new fields are always present
        const settings: PlatformSettings = {
          ...DEFAULT_SETTINGS,
          ...data,
          feeTiers: data.feeTiers || DEFAULT_FEE_TIERS,
        };
        cachedSettings = settings;
        cacheTimestamp = now;
        return settings;
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
      return cachedSettings || DEFAULT_SETTINGS;
    }
  }

  /**
   * Get the service fee as a decimal for a specific rental amount.
   * If tiered fees are enabled, returns the tier-specific rate.
   * Optionally applies loyalty discount based on completed rental count.
   */
  async getServiceFeeDecimal(rentalAmount?: number, completedRentals?: number): Promise<number> {
    const settings = await this.getSettings();

    let feePercent = settings.serviceFeePercent;

    // Apply tiered fee if enabled and rental amount provided
    if (settings.tieredFeesEnabled && rentalAmount != null) {
      const tier = this.getFeeTierForAmount(settings.feeTiers, rentalAmount);
      if (tier) {
        feePercent = tier.feePercent;
      }
    }

    // Apply loyalty discount if enabled
    if (settings.loyaltyDiscountEnabled && completedRentals != null) {
      if (completedRentals >= settings.loyaltyThreshold) {
        feePercent = Math.max(0, feePercent - settings.loyaltyDiscountPercent);
      }
    }

    return feePercent / 100;
  }

  /**
   * Get the fee tier that applies to a given rental amount
   */
  getFeeTierForAmount(tiers: FeeTier[], amount: number): FeeTier | null {
    const sorted = [...tiers].sort((a, b) => a.minAmount - b.minAmount);
    for (const tier of sorted) {
      if (amount >= tier.minAmount && amount < tier.maxAmount) {
        return tier;
      }
    }
    // Fallback to last tier if amount exceeds all
    return sorted[sorted.length - 1] || null;
  }

  /**
   * Get a breakdown for display showing which tier applies
   */
  async getFeeBreakdown(rentalAmount: number, completedRentals?: number): Promise<{
    baseFeePercent: number;
    tierName: string;
    loyaltyDiscount: number;
    finalFeePercent: number;
    feeAmount: number;
    isTiered: boolean;
    isLoyaltyApplied: boolean;
  }> {
    const settings = await this.getSettings();

    let baseFeePercent = settings.serviceFeePercent;
    let tierName = 'Standard';
    let isTiered = false;

    if (settings.tieredFeesEnabled) {
      const tier = this.getFeeTierForAmount(settings.feeTiers, rentalAmount);
      if (tier) {
        baseFeePercent = tier.feePercent;
        tierName = tier.name;
        isTiered = true;
      }
    }

    let loyaltyDiscount = 0;
    let isLoyaltyApplied = false;
    if (settings.loyaltyDiscountEnabled && completedRentals != null) {
      if (completedRentals >= settings.loyaltyThreshold) {
        loyaltyDiscount = settings.loyaltyDiscountPercent;
        isLoyaltyApplied = true;
      }
    }

    const finalFeePercent = Math.max(0, baseFeePercent - loyaltyDiscount);
    const feeAmount = rentalAmount * (finalFeePercent / 100);

    return {
      baseFeePercent,
      tierName,
      loyaltyDiscount,
      finalFeePercent,
      feeAmount,
      isTiered,
      isLoyaltyApplied,
    };
  }

  /**
   * Get default fee tiers (for admin reset)
   */
  getDefaultFeeTiers(): FeeTier[] {
    return [...DEFAULT_FEE_TIERS];
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