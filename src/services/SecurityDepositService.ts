// src/services/SecurityDepositService.ts
// Security Deposit / Damage Protection Service
// Manages refundable deposits held in escrow via Stripe, released after successful return or claimed for damages

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { getAuth } from 'firebase/auth';
import { FUNCTIONS_BASE_URL } from '../config/constants';

// ============================================================================
// TYPES
// ============================================================================

export type DepositStatus =
  | 'pending'          // Created but not yet authorized
  | 'held'             // Authorized/held on renter's card
  | 'released'         // Fully released back to renter (successful return)
  | 'partial_claim'    // Partial amount claimed for damages, rest released
  | 'full_claim'       // Full deposit claimed for damages
  | 'failed'           // Authorization failed
  | 'expired';         // Hold expired without capture or release

export interface SecurityDeposit {
  id?: string;
  rentalId: string;
  itemId: string;
  itemName: string;
  ownerId: string;
  ownerName: string;
  renterId: string;
  renterName: string;
  amount: number;                      // Deposit amount in dollars
  amountClaimed: number;               // Amount claimed for damages (0 if fully released)
  amountReleased: number;              // Amount released back to renter
  status: DepositStatus;
  stripePaymentIntentId?: string;      // Stripe PI for the deposit hold
  claimReason?: string;                // Reason for damage claim
  claimPhotos?: string[];              // Photo evidence for damage claim
  disputeId?: string;                  // Link to dispute if one was filed
  createdAt: Timestamp;
  updatedAt: Timestamp;
  heldAt?: Timestamp;                  // When the hold was placed
  releasedAt?: Timestamp;              // When funds were released
  claimedAt?: Timestamp;               // When a claim was made
}

export interface DepositClaimData {
  depositId: string;
  claimAmount: number;
  reason: string;
  photos?: string[];
}

// ============================================================================
// HTTP HELPER
// ============================================================================

async function getAuthToken(): Promise<string> {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated');
  }
  return user.getIdToken();
}

async function callFunction<T>(functionName: string, data: any = {}): Promise<T> {
  const token = await getAuthToken();

  const response = await fetch(`${FUNCTIONS_BASE_URL}/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `Function ${functionName} failed`);
  }

  return result;
}

// ============================================================================
// SECURITY DEPOSIT SERVICE
// ============================================================================

class SecurityDepositService {
  private static instance: SecurityDepositService;
  private depositsCollection = collection(db, 'securityDeposits');

  static getInstance(): SecurityDepositService {
    if (!SecurityDepositService.instance) {
      SecurityDepositService.instance = new SecurityDepositService();
    }
    return SecurityDepositService.instance;
  }

  // ==========================================================================
  // CREATE & HOLD
  // ==========================================================================

  /**
   * Create a deposit hold via Stripe (authorize but don't capture).
   * Called during checkout when item has a security deposit.
   */
  async createDepositHold(data: {
    rentalId: string;
    itemId: string;
    itemName: string;
    ownerId: string;
    ownerName: string;
    renterId: string;
    renterName: string;
    amount: number;
    paymentMethodId: string;
  }): Promise<{ success: boolean; depositId?: string; error?: string }> {
    try {
      // Call cloud function to create Stripe PaymentIntent with capture_method: 'manual'
      const result = await callFunction<{
        paymentIntentId: string;
        status: string;
        depositId: string;
      }>('createDepositHold', {
        rentalId: data.rentalId,
        itemId: data.itemId,
        itemName: data.itemName,
        ownerId: data.ownerId,
        amount: Math.round(data.amount * 100), // Convert to cents
        paymentMethodId: data.paymentMethodId,
      });

      return {
        success: true,
        depositId: result.depositId,
      };
    } catch (error: any) {
      console.error('Error creating deposit hold:', error);
      return {
        success: false,
        error: error.message || 'Failed to hold security deposit',
      };
    }
  }

  // ==========================================================================
  // RELEASE
  // ==========================================================================

  /**
   * Release deposit back to renter (cancel the uncaptured PaymentIntent).
   * Called when return is successfully completed with no damage reported.
   */
  async releaseDeposit(
    depositId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await callFunction<{ success: boolean }>('releaseDeposit', {
        depositId,
      });

      return { success: true };
    } catch (error: any) {
      console.error('Error releasing deposit:', error);
      return {
        success: false,
        error: error.message || 'Failed to release deposit',
      };
    }
  }

  // ==========================================================================
  // CLAIM (DAMAGE)
  // ==========================================================================

  /**
   * Claim part or all of the deposit for damages.
   * Called by the owner when reporting damage.
   */
  async claimDeposit(
    claimData: DepositClaimData
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await callFunction<{ success: boolean }>('claimDeposit', {
        depositId: claimData.depositId,
        claimAmount: Math.round(claimData.claimAmount * 100), // Convert to cents
        reason: claimData.reason,
        photos: claimData.photos || [],
      });

      return { success: true };
    } catch (error: any) {
      console.error('Error claiming deposit:', error);
      return {
        success: false,
        error: error.message || 'Failed to claim deposit',
      };
    }
  }

  // ==========================================================================
  // QUERY METHODS
  // ==========================================================================

  /**
   * Get deposit by ID
   */
  async getDepositById(depositId: string): Promise<SecurityDeposit | null> {
    try {
      const docRef = doc(db, 'securityDeposits', depositId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) return null;

      return {
        id: docSnap.id,
        ...docSnap.data(),
      } as SecurityDeposit;
    } catch (error) {
      console.error('Error fetching deposit:', error);
      return null;
    }
  }

  /**
   * Get deposit for a specific rental
   */
  async getDepositByRentalId(rentalId: string): Promise<SecurityDeposit | null> {
    try {
      const q = query(
        this.depositsCollection,
        where('rentalId', '==', rentalId)
      );
      const snapshot = await getDocs(q);

      if (snapshot.empty) return null;

      const docSnap = snapshot.docs[0];
      return {
        id: docSnap.id,
        ...docSnap.data(),
      } as SecurityDeposit;
    } catch (error) {
      console.error('Error fetching deposit by rental:', error);
      return null;
    }
  }

  /**
   * Get all deposits for a user (as renter)
   */
  async getRenterDeposits(userId: string): Promise<SecurityDeposit[]> {
    try {
      const q = query(
        this.depositsCollection,
        where('renterId', '==', userId),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);

      return snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as SecurityDeposit[];
    } catch (error) {
      console.error('Error fetching renter deposits:', error);
      return [];
    }
  }

  /**
   * Get all deposits for a user (as owner)
   */
  async getOwnerDeposits(userId: string): Promise<SecurityDeposit[]> {
    try {
      const q = query(
        this.depositsCollection,
        where('ownerId', '==', userId),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);

      return snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as SecurityDeposit[];
    } catch (error) {
      console.error('Error fetching owner deposits:', error);
      return [];
    }
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Get human-readable deposit status label
   */
  getStatusLabel(status: DepositStatus): string {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'held':
        return 'Held';
      case 'released':
        return 'Released';
      case 'partial_claim':
        return 'Partially Claimed';
      case 'full_claim':
        return 'Claimed';
      case 'failed':
        return 'Failed';
      case 'expired':
        return 'Expired';
      default:
        return 'Unknown';
    }
  }

  /**
   * Get status color for UI display
   */
  getStatusColor(status: DepositStatus): string {
    switch (status) {
      case 'pending':
        return '#F59E0B'; // amber
      case 'held':
        return '#2E86AB'; // blue
      case 'released':
        return '#46A758'; // green
      case 'partial_claim':
        return '#F76707'; // orange
      case 'full_claim':
        return '#DC3545'; // red
      case 'failed':
        return '#DC3545'; // red
      case 'expired':
        return '#6C757D'; // gray
      default:
        return '#6C757D';
    }
  }

  /**
   * Format deposit amount for display
   */
  formatAmount(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }

  /**
   * Check if deposit can be claimed (must be in 'held' status)
   */
  canClaim(deposit: SecurityDeposit): boolean {
    return deposit.status === 'held';
  }

  /**
   * Check if deposit can be released (must be in 'held' status)
   */
  canRelease(deposit: SecurityDeposit): boolean {
    return deposit.status === 'held';
  }
}

export default SecurityDepositService.getInstance();