// src/services/TrustScoreService.ts
// Renter/Owner Trust Score Service
// Computes a composite trust score (0-100) from:
//   - Review ratings (40% weight)
//   - Verification status (20% weight)
//   - Rental history (25% weight)
//   - Dispute history (15% weight)

import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';

// ============================================================================
// TYPES
// ============================================================================

export interface TrustScoreBreakdown {
  overall: number;            // 0-100 composite score
  tier: TrustTier;
  label: string;              // "Excellent", "Great", "Good", etc.
  color: string;              // UI color for the tier

  // Component scores (each 0-100)
  reviewScore: number;
  verificationScore: number;
  rentalHistoryScore: number;
  disputeScore: number;

  // Raw data used in computation
  stats: {
    averageRating: number;
    totalReviews: number;
    phoneVerified: boolean;
    identityVerified: boolean;
    completedRentals: number;
    totalRentals: number;
    cancelledRentals: number;
    disputesReported: number;     // disputes filed against this user
    disputesResolved: number;
    memberSinceDays: number;
    responseRate: number;          // placeholder for future use
  };
}

export type TrustTier = 'new' | 'basic' | 'good' | 'great' | 'excellent' | 'superstar';

// ============================================================================
// WEIGHTS
// ============================================================================

const WEIGHTS = {
  reviews: 0.40,
  verification: 0.20,
  rentalHistory: 0.25,
  disputes: 0.15,
};

// ============================================================================
// TRUST SCORE SERVICE
// ============================================================================

class TrustScoreService {
  private static instance: TrustScoreService;

  static getInstance(): TrustScoreService {
    if (!TrustScoreService.instance) {
      TrustScoreService.instance = new TrustScoreService();
    }
    return TrustScoreService.instance;
  }

  // ==========================================================================
  // MAIN: COMPUTE TRUST SCORE
  // ==========================================================================

  async computeTrustScore(userId: string): Promise<TrustScoreBreakdown> {
    // Gather all data in parallel
    const [userData, rentalStats, disputeStats] = await Promise.all([
      this.getUserData(userId),
      this.getRentalStats(userId),
      this.getDisputeStats(userId),
    ]);

    // Compute component scores
    const reviewScore = this.computeReviewScore(
      userData.averageRating,
      userData.totalReviews
    );

    const verificationScore = this.computeVerificationScore(
      userData.phoneVerified,
      userData.identityVerified
    );

    const rentalHistoryScore = this.computeRentalHistoryScore(
      rentalStats.completed,
      rentalStats.total,
      rentalStats.cancelled,
      userData.memberSinceDays
    );

    const disputeScore = this.computeDisputeScore(
      disputeStats.reportedAgainst,
      disputeStats.resolved,
      rentalStats.completed
    );

    // Weighted composite
    const overall = Math.round(
      reviewScore * WEIGHTS.reviews +
      verificationScore * WEIGHTS.verification +
      rentalHistoryScore * WEIGHTS.rentalHistory +
      disputeScore * WEIGHTS.disputes
    );

    const tier = this.getTier(overall, rentalStats.completed);
    const label = this.getTierLabel(tier);
    const color = this.getTierColor(tier);

    return {
      overall,
      tier,
      label,
      color,
      reviewScore: Math.round(reviewScore),
      verificationScore: Math.round(verificationScore),
      rentalHistoryScore: Math.round(rentalHistoryScore),
      disputeScore: Math.round(disputeScore),
      stats: {
        averageRating: userData.averageRating,
        totalReviews: userData.totalReviews,
        phoneVerified: userData.phoneVerified,
        identityVerified: userData.identityVerified,
        completedRentals: rentalStats.completed,
        totalRentals: rentalStats.total,
        cancelledRentals: rentalStats.cancelled,
        disputesReported: disputeStats.reportedAgainst,
        disputesResolved: disputeStats.resolved,
        memberSinceDays: userData.memberSinceDays,
        responseRate: 100, // placeholder
      },
    };
  }

  // ==========================================================================
  // COMPONENT SCORE CALCULATORS
  // ==========================================================================

  /**
   * Review Score (0-100)
   * - Base: average rating scaled to 0-100 (5.0 = 100, 1.0 = 0)
   * - Confidence modifier: more reviews = more confidence in the score
   *   Few reviews pull score toward 50 (neutral); many reviews let score stand
   */
  private computeReviewScore(averageRating: number, totalReviews: number): number {
    if (totalReviews === 0) return 50; // Neutral default for no reviews

    const ratingScore = ((averageRating - 1) / 4) * 100; // 1-5 → 0-100
    const confidence = Math.min(totalReviews / 10, 1); // Full confidence at 10+ reviews

    // Blend: more reviews → closer to actual rating, fewer → closer to 50
    return 50 + (ratingScore - 50) * confidence;
  }

  /**
   * Verification Score (0-100)
   * - No verification: 0
   * - Phone verified: 50
   * - Identity verified: 100
   * - Both: 100
   */
  private computeVerificationScore(
    phoneVerified: boolean,
    identityVerified: boolean
  ): number {
    if (identityVerified) return 100;
    if (phoneVerified) return 50;
    return 0;
  }

  /**
   * Rental History Score (0-100)
   * - Completion rate: completed / total (excluding cancelled)
   * - Volume bonus: more completed rentals = higher floor
   * - Tenure bonus: longer membership adds points
   * - Cancellation penalty
   */
  private computeRentalHistoryScore(
    completed: number,
    total: number,
    cancelled: number,
    memberSinceDays: number
  ): number {
    if (total === 0) return 50; // Neutral for new users

    // Completion rate (0-100)
    const activeRentals = total - cancelled;
    const completionRate = activeRentals > 0 ? (completed / activeRentals) * 100 : 50;

    // Volume bonus: 0-15 points, maxes out at 20 completed rentals
    const volumeBonus = Math.min(completed / 20, 1) * 15;

    // Tenure bonus: 0-10 points, maxes out at 365 days
    const tenureBonus = Math.min(memberSinceDays / 365, 1) * 10;

    // Cancellation penalty: -5 per cancellation, max -25
    const cancellationPenalty = Math.min(cancelled * 5, 25);

    return Math.max(0, Math.min(100,
      completionRate * 0.75 + volumeBonus + tenureBonus - cancellationPenalty
    ));
  }

  /**
   * Dispute Score (0-100)
   * - Starts at 100 (clean record)
   * - Loses points per dispute filed against this user
   * - Regains some points for resolved disputes
   * - Relative to rental volume (1 dispute in 100 rentals is better than 1 in 2)
   */
  private computeDisputeScore(
    reportedAgainst: number,
    resolved: number,
    completedRentals: number
  ): number {
    if (reportedAgainst === 0) return 100; // Clean record

    // Dispute rate: disputes per rental
    const rentalBase = Math.max(completedRentals, 1);
    const disputeRate = reportedAgainst / rentalBase;

    // Base deduction: more disputes relative to rentals = worse score
    // 10% dispute rate → score of ~60, 50% → score of ~20
    const baseScore = Math.max(0, 100 - (disputeRate * 400));

    // Recovery: resolved disputes are less damaging
    const resolutionRate = resolved / reportedAgainst;
    const recovery = resolutionRate * 15; // Up to 15 points back

    return Math.max(0, Math.min(100, baseScore + recovery));
  }

  // ==========================================================================
  // DATA FETCHERS
  // ==========================================================================

  private async getUserData(userId: string): Promise<{
    averageRating: number;
    totalReviews: number;
    phoneVerified: boolean;
    identityVerified: boolean;
    memberSinceDays: number;
  }> {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (!userDoc.exists()) {
        return {
          averageRating: 0,
          totalReviews: 0,
          phoneVerified: false,
          identityVerified: false,
          memberSinceDays: 0,
        };
      }

      const data = userDoc.data();
      const createdAt = data.createdAt
        ? new Date(data.createdAt)
        : new Date();
      const memberSinceDays = Math.floor(
        (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      return {
        averageRating: data.averageRating || 0,
        totalReviews: data.totalReviews || 0,
        phoneVerified: data.phoneVerified === true,
        identityVerified: data.identityVerified === true,
        memberSinceDays,
      };
    } catch (error) {
      console.error('Error fetching user data for trust score:', error);
      return {
        averageRating: 0,
        totalReviews: 0,
        phoneVerified: false,
        identityVerified: false,
        memberSinceDays: 0,
      };
    }
  }

  private async getRentalStats(userId: string): Promise<{
    completed: number;
    total: number;
    cancelled: number;
  }> {
    try {
      // Rentals as renter
      const renterQuery = query(
        collection(db, 'rentals'),
        where('renterId', '==', userId)
      );
      const renterSnap = await getDocs(renterQuery);

      // Rentals as owner
      const ownerQuery = query(
        collection(db, 'rentals'),
        where('ownerId', '==', userId)
      );
      const ownerSnap = await getDocs(ownerQuery);

      let completed = 0;
      let total = 0;
      let cancelled = 0;

      const processRental = (docData: any) => {
        total++;
        const status = docData.status;
        if (status === 'completed' || status === 'completed_pending_payout') {
          completed++;
        } else if (status === 'cancelled') {
          cancelled++;
        }
      };

      renterSnap.docs.forEach((d) => processRental(d.data()));
      ownerSnap.docs.forEach((d) => processRental(d.data()));

      return { completed, total, cancelled };
    } catch (error) {
      console.error('Error fetching rental stats for trust score:', error);
      return { completed: 0, total: 0, cancelled: 0 };
    }
  }

  private async getDisputeStats(userId: string): Promise<{
    reportedAgainst: number;
    resolved: number;
  }> {
    try {
      const q = query(
        collection(db, 'disputes'),
        where('accusedId', '==', userId)
      );
      const snapshot = await getDocs(q);

      let reportedAgainst = 0;
      let resolved = 0;

      snapshot.docs.forEach((d) => {
        const data = d.data();
        reportedAgainst++;
        if (data.status === 'resolved' || data.status === 'closed') {
          resolved++;
        }
      });

      return { reportedAgainst, resolved };
    } catch (error) {
      console.error('Error fetching dispute stats for trust score:', error);
      return { reportedAgainst: 0, resolved: 0 };
    }
  }

  // ==========================================================================
  // TIER HELPERS
  // ==========================================================================

  private getTier(score: number, completedRentals: number): TrustTier {
    // New users with no rental history get "new" regardless of score
    if (completedRentals === 0) return 'new';

    if (score >= 90) return 'superstar';
    if (score >= 80) return 'excellent';
    if (score >= 65) return 'great';
    if (score >= 50) return 'good';
    if (score >= 30) return 'basic';
    return 'basic';
  }

  getTierLabel(tier: TrustTier): string {
    switch (tier) {
      case 'new': return 'New Member';
      case 'basic': return 'Member';
      case 'good': return 'Good';
      case 'great': return 'Great';
      case 'excellent': return 'Excellent';
      case 'superstar': return 'Superstar';
    }
  }

  getTierColor(tier: TrustTier): string {
    switch (tier) {
      case 'new': return '#6C757D';      // gray
      case 'basic': return '#6C757D';    // gray
      case 'good': return '#2E86AB';     // blue
      case 'great': return '#46A758';    // green
      case 'excellent': return '#F5C542'; // gold
      case 'superstar': return '#E67E22'; // orange
    }
  }

  getTierIcon(tier: TrustTier): string {
    switch (tier) {
      case 'new': return 'person-outline';
      case 'basic': return 'person';
      case 'good': return 'thumbs-up';
      case 'great': return 'star-half';
      case 'excellent': return 'star';
      case 'superstar': return 'diamond';
    }
  }

  /**
   * Get a short description of what this trust score means
   */
  getScoreDescription(breakdown: TrustScoreBreakdown): string {
    const { tier, stats } = breakdown;

    switch (tier) {
      case 'new':
        return 'New to ShareStash. Complete rentals and get verified to build your trust score.';
      case 'basic':
        return 'Building reputation. Keep completing rentals and maintaining good reviews.';
      case 'good':
        return 'Reliable community member with a solid track record.';
      case 'great':
        return 'Highly trusted member with great reviews and history.';
      case 'excellent':
        return 'Outstanding reputation. One of our most trusted members.';
      case 'superstar':
        return 'Top-tier trust score. Exceptional track record across all categories.';
    }
  }

  /**
   * Get improvement tips based on the lowest scoring component
   */
  getImprovementTips(breakdown: TrustScoreBreakdown): string[] {
    const tips: string[] = [];

    if (breakdown.verificationScore < 100) {
      if (!breakdown.stats.identityVerified) {
        tips.push('Verify your identity to significantly boost your trust score');
      }
      if (!breakdown.stats.phoneVerified) {
        tips.push('Add and verify your phone number');
      }
    }

    if (breakdown.reviewScore < 70) {
      if (breakdown.stats.totalReviews < 5) {
        tips.push('Complete more rentals to collect reviews');
      } else {
        tips.push('Provide great service to improve your review ratings');
      }
    }

    if (breakdown.rentalHistoryScore < 70) {
      if (breakdown.stats.cancelledRentals > 0) {
        tips.push('Avoid cancellations to maintain a strong history');
      }
      tips.push('Complete more rentals to build your track record');
    }

    if (breakdown.disputeScore < 90 && breakdown.stats.disputesReported > 0) {
      tips.push('Resolve disputes promptly and maintain clear communication');
    }

    return tips.slice(0, 3); // Max 3 tips
  }
}

export default TrustScoreService.getInstance();