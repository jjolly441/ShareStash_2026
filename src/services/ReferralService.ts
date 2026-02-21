// src/services/ReferralService.ts
// Referral program: each user gets a unique code, new users can enter it at signup,
// both referrer and referee get credit (ties into promo code system)
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  increment,
  addDoc,
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import PromoCodeService from './PromoCodeService';

// ============================================================================
// TYPES
// ============================================================================

export interface ReferralProfile {
  userId: string;
  referralCode: string;        // Unique 8-char code (e.g., "SHARE7X9K")
  totalReferrals: number;      // How many people signed up with this code
  totalCreditsEarned: number;  // Total $ earned from referrals
  createdAt: Timestamp;
}

export interface ReferralRecord {
  id?: string;
  referrerUserId: string;      // Person who shared the code
  refereeUserId: string;       // Person who used the code at signup
  referralCode: string;
  referrerRewardAmount: number; // $ credited to referrer
  refereeRewardAmount: number;  // $ credited to referee (signup bonus)
  referrerPromoCode?: string;   // Auto-generated promo code for referrer
  refereePromoCode?: string;    // Auto-generated promo code for referee
  status: 'pending' | 'completed'; // completed = referee made first rental
  createdAt: Timestamp;
  completedAt?: Timestamp;
}

// ============================================================================
// CONFIG — adjust rewards here
// ============================================================================

const REFERRAL_CONFIG = {
  REFERRER_REWARD: 5.00,   // Referrer gets $5 off next rental
  REFEREE_REWARD: 5.00,    // New user gets $5 off first rental
  CODE_PREFIX: 'SHARE',    // Prefix for generated codes
  CODE_LENGTH: 8,          // Total length of referral code
  MAX_REFERRALS: 0,        // 0 = unlimited referrals per user
};

// ============================================================================
// SERVICE
// ============================================================================

class ReferralServiceClass {

  // --------------------------------------------------------------------------
  // Code Generation
  // --------------------------------------------------------------------------

  /**
   * Generate a unique referral code for a user.
   * Format: SHARE + 3-4 random alphanumeric chars (e.g., "SHARE7X9K")
   */
  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No 0/O/1/I to avoid confusion
    const randomLength = REFERRAL_CONFIG.CODE_LENGTH - REFERRAL_CONFIG.CODE_PREFIX.length;
    let random = '';
    for (let i = 0; i < randomLength; i++) {
      random += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${REFERRAL_CONFIG.CODE_PREFIX}${random}`;
  }

  // --------------------------------------------------------------------------
  // Referral Profile (per user)
  // --------------------------------------------------------------------------

  /**
   * Get or create a referral profile for a user.
   * Every user gets a unique referral code.
   */
  async getOrCreateReferralProfile(userId: string): Promise<ReferralProfile> {
    try {
      const docRef = doc(db, 'referralProfiles', userId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        return docSnap.data() as ReferralProfile;
      }

      // Generate a unique code (check for collisions)
      let code = this.generateCode();
      let attempts = 0;
      while (attempts < 10) {
        const existing = await this.getProfileByCode(code);
        if (!existing) break;
        code = this.generateCode();
        attempts++;
      }

      const profile: ReferralProfile = {
        userId,
        referralCode: code,
        totalReferrals: 0,
        totalCreditsEarned: 0,
        createdAt: Timestamp.now(),
      };

      await setDoc(docRef, profile);
      return profile;
    } catch (error) {
      console.error('Error getting/creating referral profile:', error);
      throw error;
    }
  }

  /**
   * Look up a referral profile by its code (case-insensitive)
   */
  async getProfileByCode(code: string): Promise<ReferralProfile | null> {
    try {
      const q = query(
        collection(db, 'referralProfiles'),
        where('referralCode', '==', code.toUpperCase())
      );
      const snapshot = await getDocs(q);
      if (snapshot.empty) return null;
      return snapshot.docs[0].data() as ReferralProfile;
    } catch (error) {
      console.error('Error looking up referral code:', error);
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // Referral Validation & Processing
  // --------------------------------------------------------------------------

  /**
   * Validate a referral code at signup.
   * Returns the referrer's profile if valid, null if invalid.
   */
  async validateReferralCode(
    code: string,
    newUserId: string
  ): Promise<{ valid: boolean; error?: string; referrerProfile?: ReferralProfile }> {
    if (!code || code.trim().length === 0) {
      return { valid: false, error: 'Please enter a referral code' };
    }

    const upperCode = code.toUpperCase().trim();
    const profile = await this.getProfileByCode(upperCode);

    if (!profile) {
      return { valid: false, error: 'Invalid referral code' };
    }

    // Can't refer yourself
    if (profile.userId === newUserId) {
      return { valid: false, error: 'You cannot use your own referral code' };
    }

    // Check if new user already used a referral code
    const existingRef = await this.getReferralForReferee(newUserId);
    if (existingRef) {
      return { valid: false, error: 'You have already used a referral code' };
    }

    // Check max referrals (if configured)
    if (REFERRAL_CONFIG.MAX_REFERRALS > 0 && profile.totalReferrals >= REFERRAL_CONFIG.MAX_REFERRALS) {
      return { valid: false, error: 'This referral code has reached its limit' };
    }

    return { valid: true, referrerProfile: profile };
  }

  /**
   * Process a referral after a new user signs up with a valid code.
   * Creates promo codes for both parties.
   */
  async processReferral(
    referrerUserId: string,
    refereeUserId: string,
    referralCode: string
  ): Promise<{ success: boolean; referrerPromoCode?: string; refereePromoCode?: string; error?: string }> {
    try {
      // 1. Create promo code for the REFEREE (new user's welcome bonus)
      const refereeCode = `WELCOME${refereeUserId.substring(0, 4).toUpperCase()}`;
      await PromoCodeService.createPromoCode({
        code: refereeCode,
        discountType: 'flat',
        discountValue: REFERRAL_CONFIG.REFEREE_REWARD,
        maxUses: 1,
        maxUsesPerUser: 1,
        minRentalAmount: 0,
        maxDiscountAmount: REFERRAL_CONFIG.REFEREE_REWARD,
        isActive: true,
        createdBy: 'system',
        description: `Welcome bonus: $${REFERRAL_CONFIG.REFEREE_REWARD} off your first rental`,
      });

      // 2. Create promo code for the REFERRER (reward for sharing)
      const referrerCode = `THANKS${referrerUserId.substring(0, 4).toUpperCase()}${Date.now().toString(36).slice(-3).toUpperCase()}`;
      await PromoCodeService.createPromoCode({
        code: referrerCode,
        discountType: 'flat',
        discountValue: REFERRAL_CONFIG.REFERRER_REWARD,
        maxUses: 1,
        maxUsesPerUser: 1,
        minRentalAmount: 0,
        maxDiscountAmount: REFERRAL_CONFIG.REFERRER_REWARD,
        isActive: true,
        createdBy: 'system',
        description: `Referral reward: $${REFERRAL_CONFIG.REFERRER_REWARD} off your next rental`,
      });

      // 3. Record the referral
      const record: Omit<ReferralRecord, 'id'> = {
        referrerUserId,
        refereeUserId,
        referralCode,
        referrerRewardAmount: REFERRAL_CONFIG.REFERRER_REWARD,
        refereeRewardAmount: REFERRAL_CONFIG.REFEREE_REWARD,
        referrerPromoCode: referrerCode,
        refereePromoCode: refereeCode,
        status: 'completed',
        createdAt: Timestamp.now(),
        completedAt: Timestamp.now(),
      };

      await addDoc(collection(db, 'referralRecords'), record);

      // 4. Update referrer's profile stats
      const profileRef = doc(db, 'referralProfiles', referrerUserId);
      await updateDoc(profileRef, {
        totalReferrals: increment(1),
        totalCreditsEarned: increment(REFERRAL_CONFIG.REFERRER_REWARD),
      });

      return {
        success: true,
        referrerPromoCode: referrerCode,
        refereePromoCode: refereeCode,
      };
    } catch (error) {
      console.error('Error processing referral:', error);
      return { success: false, error: 'Failed to process referral' };
    }
  }

  // --------------------------------------------------------------------------
  // Queries
  // --------------------------------------------------------------------------

  /**
   * Check if a user was referred by someone
   */
  async getReferralForReferee(refereeUserId: string): Promise<ReferralRecord | null> {
    try {
      const q = query(
        collection(db, 'referralRecords'),
        where('refereeUserId', '==', refereeUserId)
      );
      const snapshot = await getDocs(q);
      if (snapshot.empty) return null;
      return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as ReferralRecord;
    } catch (error) {
      console.error('Error checking referral:', error);
      return null;
    }
  }

  /**
   * Get all referrals made by a user (people they referred)
   */
  async getReferralsByReferrer(referrerUserId: string): Promise<ReferralRecord[]> {
    try {
      const q = query(
        collection(db, 'referralRecords'),
        where('referrerUserId', '==', referrerUserId)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ReferralRecord));
    } catch (error) {
      console.error('Error getting referrals:', error);
      return [];
    }
  }

  /**
   * Get a user's available reward promo codes (from referring others or being referred).
   * Checks both sides: codes they earned as a referrer, and their welcome bonus as a referee.
   * Returns codes along with their usage status.
   */
  async getUserRewardCodes(userId: string): Promise<{
    code: string;
    amount: number;
    description: string;
    used: boolean;
  }[]> {
    const rewards: { code: string; amount: number; description: string; used: boolean }[] = [];

    try {
      // 1. Check if user was referred (they'd have a WELCOME code)
      const asReferee = await this.getReferralForReferee(userId);
      if (asReferee?.refereePromoCode) {
        const promo = await PromoCodeService.getPromoByCode(asReferee.refereePromoCode);
        if (promo) {
          rewards.push({
            code: promo.code,
            amount: promo.discountValue,
            description: 'Welcome bonus',
            used: promo.currentUses > 0,
          });
        }
      }

      // 2. Check codes earned from referring others (THANKS codes)
      const asReferrer = await this.getReferralsByReferrer(userId);
      for (const record of asReferrer) {
        if (record.referrerPromoCode) {
          const promo = await PromoCodeService.getPromoByCode(record.referrerPromoCode);
          if (promo) {
            rewards.push({
              code: promo.code,
              amount: promo.discountValue,
              description: 'Referral reward',
              used: promo.currentUses > 0,
            });
          }
        }
      }
    } catch (error) {
      console.warn('Error loading reward codes:', error);
    }

    return rewards;
  }

  /**
   * Get referral stats for admin dashboard
   */
  async getGlobalStats(): Promise<{
    totalReferrals: number;
    totalCreditsIssued: number;
    topReferrers: { userId: string; code: string; count: number }[];
  }> {
    try {
      const recordsSnap = await getDocs(collection(db, 'referralRecords'));
      const totalReferrals = recordsSnap.size;
      let totalCreditsIssued = 0;
      recordsSnap.docs.forEach(d => {
        const data = d.data();
        totalCreditsIssued += (data.referrerRewardAmount || 0) + (data.refereeRewardAmount || 0);
      });

      // Get top referrers
      const profilesSnap = await getDocs(collection(db, 'referralProfiles'));
      const topReferrers = profilesSnap.docs
        .map(d => {
          const data = d.data();
          return {
            userId: data.userId,
            code: data.referralCode,
            count: data.totalReferrals || 0,
          };
        })
        .filter(r => r.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return { totalReferrals, totalCreditsIssued, topReferrers };
    } catch (error) {
      console.error('Error getting referral stats:', error);
      return { totalReferrals: 0, totalCreditsIssued: 0, topReferrers: [] };
    }
  }

  /**
   * Get reward config (for display purposes)
   */
  getRewardConfig() {
    return {
      referrerReward: REFERRAL_CONFIG.REFERRER_REWARD,
      refereeReward: REFERRAL_CONFIG.REFEREE_REWARD,
    };
  }
}

export const ReferralService = new ReferralServiceClass();
export default ReferralService;