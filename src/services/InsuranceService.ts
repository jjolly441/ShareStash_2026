// src/services/InsuranceService.ts
// Rental Protection / Insurance Service
// Offers tiered protection plans renters can opt into during booking
// Plans are stored on the rental document and factored into checkout pricing

import {
  doc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';

// ============================================================================
// TYPES
// ============================================================================

export type InsuranceTier = 'none' | 'basic' | 'standard' | 'premium';

export interface InsurancePlan {
  tier: InsuranceTier;
  name: string;
  description: string;
  ratePercent: number;       // % of rental price (e.g. 5 = 5%)
  coverageMax: number;       // max payout in dollars
  coverageDetails: string[];
  icon: string;              // Ionicons name
  color: string;
  recommended?: boolean;
}

export interface RentalInsurance {
  tier: InsuranceTier;
  planName: string;
  premiumAmount: number;     // dollar amount charged
  coverageMax: number;
  rentalId: string;
  renterId: string;
  status: 'active' | 'claimed' | 'expired' | 'voided';
  claimId?: string;
  claimAmount?: number;
  claimReason?: string;
  claimedAt?: string;
  createdAt: string;
}

export interface InsuranceClaim {
  id?: string;
  insuranceId: string;
  rentalId: string;
  renterId: string;
  renterName: string;
  ownerId: string;
  ownerName: string;
  itemName: string;
  claimAmount: number;
  coverageMax: number;
  reason: string;
  description: string;
  photos: string[];
  status: 'pending' | 'approved' | 'denied' | 'paid';
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNotes?: string;
  createdAt: string;
}

// ============================================================================
// PLAN DEFINITIONS
// ============================================================================

const INSURANCE_PLANS: InsurancePlan[] = [
  {
    tier: 'none',
    name: 'No Protection',
    description: 'Rent without additional coverage',
    ratePercent: 0,
    coverageMax: 0,
    coverageDetails: [
      'No damage coverage',
      'You are responsible for all damages',
      'Security deposit may apply',
    ],
    icon: 'close-circle-outline',
    color: '#6C757D',
  },
  {
    tier: 'basic',
    name: 'Basic Protection',
    description: 'Essential coverage for peace of mind',
    ratePercent: 5,
    coverageMax: 200,
    coverageDetails: [
      'Up to $200 damage coverage',
      'Accidental damage included',
      'Simple claims process',
    ],
    icon: 'shield-outline',
    color: '#2E86AB',
  },
  {
    tier: 'standard',
    name: 'Standard Protection',
    description: 'Comprehensive coverage for most rentals',
    ratePercent: 8,
    coverageMax: 500,
    coverageDetails: [
      'Up to $500 damage coverage',
      'Accidental + theft coverage',
      'Priority claims processing',
      'Replacement cost coverage',
    ],
    icon: 'shield-checkmark',
    color: '#46A758',
    recommended: true,
  },
  {
    tier: 'premium',
    name: 'Premium Protection',
    description: 'Maximum coverage with zero worry',
    ratePercent: 12,
    coverageMax: 2000,
    coverageDetails: [
      'Up to $2,000 damage coverage',
      'Accidental + theft + loss coverage',
      'Priority claims with fast payout',
      'Full replacement cost',
      'No deductible',
    ],
    icon: 'diamond',
    color: '#E67E22',
  },
];

// ============================================================================
// SERVICE CLASS
// ============================================================================

class InsuranceServiceClass {
  private static instance: InsuranceServiceClass;

  static getInstance(): InsuranceServiceClass {
    if (!InsuranceServiceClass.instance) {
      InsuranceServiceClass.instance = new InsuranceServiceClass();
    }
    return InsuranceServiceClass.instance;
  }

  // ==========================================================================
  // PLAN QUERIES
  // ==========================================================================

  /**
   * Get all available insurance plans
   */
  getPlans(): InsurancePlan[] {
    return INSURANCE_PLANS;
  }

  /**
   * Get a specific plan by tier
   */
  getPlan(tier: InsuranceTier): InsurancePlan {
    return INSURANCE_PLANS.find((p) => p.tier === tier) || INSURANCE_PLANS[0];
  }

  /**
   * Calculate insurance premium for a given rental price and tier
   */
  calculatePremium(rentalPrice: number, tier: InsuranceTier): number {
    const plan = this.getPlan(tier);
    if (plan.ratePercent === 0) return 0;
    return Math.round(rentalPrice * (plan.ratePercent / 100) * 100) / 100;
  }

  /**
   * Get the recommended plan for a given rental price
   */
  getRecommendedTier(rentalPrice: number): InsuranceTier {
    if (rentalPrice >= 200) return 'standard';
    if (rentalPrice >= 50) return 'basic';
    return 'none';
  }

  // ==========================================================================
  // RENTAL INTEGRATION
  // ==========================================================================

  /**
   * Add insurance to a rental (called during booking or checkout)
   */
  async addInsuranceToRental(
    rentalId: string,
    renterId: string,
    tier: InsuranceTier,
    premiumAmount: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (tier === 'none') {
        // Remove insurance from rental
        await updateDoc(doc(db, 'rentals', rentalId), {
          insuranceTier: 'none',
          insurancePremium: 0,
          insuranceCoverageMax: 0,
          insurancePlanName: '',
        });
        return { success: true };
      }

      const plan = this.getPlan(tier);

      await updateDoc(doc(db, 'rentals', rentalId), {
        insuranceTier: tier,
        insurancePremium: premiumAmount,
        insuranceCoverageMax: plan.coverageMax,
        insurancePlanName: plan.name,
      });

      // Create insurance record
      const insurance: Omit<RentalInsurance, 'id'> = {
        tier,
        planName: plan.name,
        premiumAmount,
        coverageMax: plan.coverageMax,
        rentalId,
        renterId,
        status: 'active',
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, 'rentalInsurance'), insurance);

      return { success: true };
    } catch (error: any) {
      console.error('Error adding insurance to rental:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get insurance details for a rental
   */
  async getRentalInsurance(rentalId: string): Promise<RentalInsurance | null> {
    try {
      const rentalDoc = await getDoc(doc(db, 'rentals', rentalId));
      if (!rentalDoc.exists()) return null;

      const data = rentalDoc.data();
      if (!data.insuranceTier || data.insuranceTier === 'none') return null;

      return {
        tier: data.insuranceTier,
        planName: data.insurancePlanName || '',
        premiumAmount: data.insurancePremium || 0,
        coverageMax: data.insuranceCoverageMax || 0,
        rentalId,
        renterId: data.renterId,
        status: 'active',
        createdAt: data.createdAt || '',
      };
    } catch (error) {
      console.error('Error getting rental insurance:', error);
      return null;
    }
  }

  /**
   * File an insurance claim (used in dispute/damage flow)
   */
  async fileClaim(
    rentalId: string,
    renterId: string,
    renterName: string,
    ownerId: string,
    ownerName: string,
    itemName: string,
    claimAmount: number,
    reason: string,
    description: string,
    photos: string[] = []
  ): Promise<{ success: boolean; claimId?: string; error?: string }> {
    try {
      const rentalDoc = await getDoc(doc(db, 'rentals', rentalId));
      if (!rentalDoc.exists()) return { success: false, error: 'Rental not found' };

      const rentalData = rentalDoc.data();
      if (!rentalData.insuranceTier || rentalData.insuranceTier === 'none') {
        return { success: false, error: 'This rental has no insurance coverage' };
      }

      const coverageMax = rentalData.insuranceCoverageMax || 0;
      const cappedAmount = Math.min(claimAmount, coverageMax);

      const claim: Omit<InsuranceClaim, 'id'> = {
        insuranceId: rentalId, // Using rentalId as reference
        rentalId,
        renterId,
        renterName,
        ownerId,
        ownerName,
        itemName,
        claimAmount: cappedAmount,
        coverageMax,
        reason,
        description,
        photos,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      const claimRef = await addDoc(collection(db, 'insuranceClaims'), claim);

      // Update rental with claim reference
      await updateDoc(doc(db, 'rentals', rentalId), {
        insuranceClaimId: claimRef.id,
        insuranceClaimStatus: 'pending',
      });

      return { success: true, claimId: claimRef.id };
    } catch (error: any) {
      console.error('Error filing insurance claim:', error);
      return { success: false, error: error.message };
    }
  }

  // ==========================================================================
  // DISPLAY HELPERS
  // ==========================================================================

  /**
   * Get tier badge color
   */
  getTierColor(tier: InsuranceTier): string {
    const plan = this.getPlan(tier);
    return plan.color;
  }

  /**
   * Get tier icon name
   */
  getTierIcon(tier: InsuranceTier): string {
    const plan = this.getPlan(tier);
    return plan.icon;
  }

  /**
   * Format coverage amount for display
   */
  formatCoverage(tier: InsuranceTier): string {
    const plan = this.getPlan(tier);
    if (plan.coverageMax === 0) return 'No coverage';
    return `Up to $${plan.coverageMax.toLocaleString()}`;
  }
}

export default InsuranceServiceClass.getInstance();