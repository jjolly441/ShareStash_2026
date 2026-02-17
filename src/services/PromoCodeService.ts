// src/services/PromoCodeService.ts
// Manages promo codes / coupons for ShareStash rentals
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
  increment,
} from 'firebase/firestore';
import { db } from '../config/firebase';

export interface PromoCode {
  id?: string;
  code: string;                    // e.g. "WELCOME20" — stored uppercase
  discountType: 'percent' | 'flat'; // percentage or flat dollar amount
  discountValue: number;            // e.g. 20 for 20% or 5 for $5
  maxUses: number;                  // 0 = unlimited
  currentUses: number;
  maxUsesPerUser: number;           // 0 = unlimited per user
  minRentalAmount: number;          // minimum rental total to apply (0 = no min)
  maxDiscountAmount: number;        // cap on discount for percent codes (0 = no cap)
  expiresAt: Timestamp | null;      // null = never expires
  isActive: boolean;
  createdAt: Timestamp;
  createdBy: string;                // admin userId
  description?: string;             // internal note, e.g. "Launch promo"
}

export interface PromoValidationResult {
  valid: boolean;
  error?: string;
  discountAmount?: number;
  promoCode?: PromoCode;
}

class PromoCodeServiceClass {
  private promosCollection = collection(db, 'promoCodes');

  /**
   * Create a new promo code
   */
  async createPromoCode(data: Omit<PromoCode, 'id' | 'currentUses' | 'createdAt'>): Promise<string> {
    try {
      // Check for duplicate code
      const existing = await this.getPromoByCode(data.code.toUpperCase().trim());
      if (existing) {
        throw new Error('A promo code with this code already exists');
      }

      const docRef = await addDoc(this.promosCollection, {
        ...data,
        code: data.code.toUpperCase().trim(),
        currentUses: 0,
        createdAt: Timestamp.now(),
      });
      return docRef.id;
    } catch (error: any) {
      console.error('Error creating promo code:', error);
      throw error;
    }
  }

  /**
   * Get a promo code by its code string
   */
  async getPromoByCode(code: string): Promise<PromoCode | null> {
    try {
      const q = query(
        this.promosCollection,
        where('code', '==', code.toUpperCase().trim())
      );
      const snapshot = await getDocs(q);

      if (snapshot.empty) return null;

      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() } as PromoCode;
    } catch (error) {
      console.error('Error fetching promo code:', error);
      return null;
    }
  }

  /**
   * Get all promo codes (admin)
   */
  async getAllPromoCodes(): Promise<PromoCode[]> {
    try {
      const snapshot = await getDocs(this.promosCollection);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as PromoCode));
    } catch (error) {
      console.error('Error fetching promo codes:', error);
      return [];
    }
  }

  /**
   * Validate a promo code for a specific user and rental amount
   */
  async validatePromoCode(
    code: string,
    userId: string,
    rentalAmount: number
  ): Promise<PromoValidationResult> {
    try {
      const promo = await this.getPromoByCode(code);

      if (!promo) {
        return { valid: false, error: 'Invalid promo code' };
      }

      if (!promo.isActive) {
        return { valid: false, error: 'This promo code is no longer active' };
      }

      // Check expiration
      if (promo.expiresAt) {
        const expiresDate = promo.expiresAt.toDate();
        if (new Date() > expiresDate) {
          return { valid: false, error: 'This promo code has expired' };
        }
      }

      // Check max uses
      if (promo.maxUses > 0 && promo.currentUses >= promo.maxUses) {
        return { valid: false, error: 'This promo code has reached its usage limit' };
      }

      // Check per-user limit
      if (promo.maxUsesPerUser > 0) {
        const userUsageCount = await this.getUserUsageCount(promo.code, userId);
        if (userUsageCount >= promo.maxUsesPerUser) {
          return { valid: false, error: 'You have already used this promo code' };
        }
      }

      // Check minimum rental amount
      if (promo.minRentalAmount > 0 && rentalAmount < promo.minRentalAmount) {
        return {
          valid: false,
          error: `Minimum rental amount of $${promo.minRentalAmount.toFixed(2)} required`,
        };
      }

      // Calculate discount
      let discountAmount: number;
      if (promo.discountType === 'percent') {
        discountAmount = rentalAmount * (promo.discountValue / 100);
        // Apply max discount cap
        if (promo.maxDiscountAmount > 0 && discountAmount > promo.maxDiscountAmount) {
          discountAmount = promo.maxDiscountAmount;
        }
      } else {
        discountAmount = Math.min(promo.discountValue, rentalAmount);
      }

      // Round to 2 decimal places
      discountAmount = Math.round(discountAmount * 100) / 100;

      return {
        valid: true,
        discountAmount,
        promoCode: promo,
      };
    } catch (error) {
      console.error('Error validating promo code:', error);
      return { valid: false, error: 'Failed to validate promo code' };
    }
  }

  /**
   * Record promo code usage after a successful booking
   */
  async recordUsage(promoCodeId: string, userId: string, rentalId: string): Promise<void> {
    try {
      // Increment usage count on the promo code
      const promoRef = doc(db, 'promoCodes', promoCodeId);
      await updateDoc(promoRef, {
        currentUses: increment(1),
      });

      // Record individual usage
      const usageCollection = collection(db, 'promoCodeUsage');
      await addDoc(usageCollection, {
        promoCodeId,
        userId,
        rentalId,
        usedAt: Timestamp.now(),
      });
    } catch (error) {
      console.error('Error recording promo usage:', error);
    }
  }

  /**
   * Get how many times a user has used a specific promo code
   */
  private async getUserUsageCount(code: string, userId: string): Promise<number> {
    try {
      // First get the promo code ID
      const promo = await this.getPromoByCode(code);
      if (!promo?.id) return 0;

      const usageCollection = collection(db, 'promoCodeUsage');
      const q = query(
        usageCollection,
        where('promoCodeId', '==', promo.id),
        where('userId', '==', userId)
      );
      const snapshot = await getDocs(q);
      return snapshot.size;
    } catch (error) {
      console.error('Error getting user usage count:', error);
      return 0;
    }
  }

  /**
   * Toggle promo code active status (admin)
   */
  async toggleActive(promoCodeId: string, isActive: boolean): Promise<void> {
    const promoRef = doc(db, 'promoCodes', promoCodeId);
    await updateDoc(promoRef, { isActive });
  }

  /**
   * Delete a promo code (admin)
   */
  async deletePromoCode(promoCodeId: string): Promise<void> {
    const promoRef = doc(db, 'promoCodes', promoCodeId);
    await deleteDoc(promoRef);
  }
}

export const PromoCodeService = new PromoCodeServiceClass();
export default PromoCodeService;