// src/services/PayoutService.ts
// Service for handling payouts and Stripe Connect operations
// UPDATED: Uses HTTP calls for v2 Cloud Functions (onRequest)

import { 
  collection, 
  doc, 
  query, 
  where, 
  getDocs, 
  orderBy,
  Timestamp,
  getDoc
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';

// ============================================================================
// CONFIGURATION
// ============================================================================

const FUNCTIONS_BASE_URL = 'https://us-central1-peerrentalapp.cloudfunctions.net';

// ============================================================================
// TYPES
// ============================================================================

export interface Payout {
  id?: string;
  userId: string;
  rentalId: string;
  amount: number;
  platformFee: number;
  originalAmount: number;
  currency: string;
  stripeTransferId?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Timestamp;
  completedAt?: Timestamp;
  error?: string;
}

export interface OwnerEarnings {
  totalEarnings: number;
  pendingPayouts: number;
  completedPayouts: number;
  platformFees: number;
  availableBalance: number;
  payoutHistory: Payout[];
}

export interface ConnectAccountStatus {
  hasAccount: boolean;
  accountId: string | null;
  status: string;
  message: string;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirements?: string[];
  pendingVerification?: string[];
}

// ============================================================================
// HTTP HELPER
// ============================================================================

async function callFunction<T>(functionName: string, data: any = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated');
  }
  
  const token = await user.getIdToken();
  
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
// PAYOUT SERVICE CLASS
// ============================================================================

class PayoutServiceClass {
  private payoutsCollection = collection(db, 'payouts');

  // ==========================================================================
  // PAYOUT OPERATIONS
  // ==========================================================================

  /**
   * Process payout for a completed rental
   * Transfers funds to the owner's Connect account minus platform fee
   */
  async processRentalPayout(
    rentalId: string,
    ownerId: string,
    rentalAmount: number,
    _ownerStripeAccountId?: string // No longer needed - function gets it from user doc
  ): Promise<string> {
    try {
      // Amount should be in CENTS
      const amountInCents = Math.round(rentalAmount * 100);
      
      const result = await callFunction<{
        transferId: string;
        amount: number;
        originalAmount: number;
        platformFee: number;
      }>('processTransfer', {
        sellerId: ownerId,
        amount: amountInCents,
        rentalId: rentalId,
      });

      console.log('✅ Payout processed:', result.transferId);
      
      // Find the payout document that was created
      const q = query(
        this.payoutsCollection,
        where('rentalId', '==', rentalId),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        return snapshot.docs[0].id;
      }
      
      return result.transferId;
    } catch (error: any) {
      console.error('❌ Payout processing error:', error);
      throw error;
    }
  }

  /**
   * Get owner's earnings summary
   */
  async getOwnerEarnings(ownerId: string): Promise<OwnerEarnings> {
    try {
      const q = query(
        this.payoutsCollection,
        where('userId', '==', ownerId),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(q);
      const payouts: Payout[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Payout));

      // Calculate totals
      const completedPayouts = payouts.filter(p => p.status === 'completed');
      const pendingPayoutsList = payouts.filter(
        p => p.status === 'pending' || p.status === 'processing'
      );

      const totalEarnings = completedPayouts.reduce((sum, p) => sum + p.amount, 0);
      const pendingAmount = pendingPayoutsList.reduce((sum, p) => sum + p.amount, 0);
      const completedAmount = completedPayouts.reduce((sum, p) => sum + p.amount, 0);
      const platformFees = completedPayouts.reduce((sum, p) => sum + p.platformFee, 0);

      return {
        totalEarnings,
        pendingPayouts: pendingAmount,
        completedPayouts: completedAmount,
        platformFees,
        availableBalance: completedAmount,
        payoutHistory: payouts,
      };
    } catch (error) {
      console.error('Error fetching owner earnings:', error);
      throw error;
    }
  }

  /**
   * Get payout by ID
   */
  async getPayoutById(payoutId: string): Promise<Payout | null> {
    try {
      const docRef = doc(db, 'payouts', payoutId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as Payout;
      }
      return null;
    } catch (error) {
      console.error('Error fetching payout:', error);
      throw error;
    }
  }

  /**
   * Get payouts for a specific rental
   */
  async getPayoutsForRental(rentalId: string): Promise<Payout[]> {
    try {
      const q = query(
        this.payoutsCollection,
        where('rentalId', '==', rentalId)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Payout));
    } catch (error) {
      console.error('Error fetching rental payouts:', error);
      throw error;
    }
  }

  // ==========================================================================
  // STRIPE CONNECT OPERATIONS
  // ==========================================================================

  /**
   * Create Stripe Connect account for owner
   */
  async createConnectAccount(
    userId: string, 
    email: string, 
    firstName: string = '', 
    lastName: string = ''
  ): Promise<string> {
    try {
      const result = await callFunction<{ accountId: string }>('createConnectAccount', {
        email,
        firstName,
        lastName,
      });
      
      console.log('✅ Connect account created:', result.accountId);
      return result.accountId;
    } catch (error) {
      console.error('Error creating connect account:', error);
      throw error;
    }
  }

  /**
   * Create account onboarding link
   */
  async createAccountLink(
    accountId?: string,
    refreshUrl?: string,
    returnUrl?: string
  ): Promise<string> {
    try {
      const result = await callFunction<{ url: string }>('createAccountLink', {
        accountId,
        // URLs are now set server-side to use Firebase Hosting
      });
      
      return result.url;
    } catch (error) {
      console.error('Error creating account link:', error);
      throw error;
    }
  }

  /**
   * Create login link for Stripe Express Dashboard
   */
  async createDashboardLink(): Promise<string> {
    try {
      const result = await callFunction<{ url: string }>('createConnectLoginLink', {});
      return result.url;
    } catch (error: any) {
      console.error('Error creating dashboard link:', error);
      
      if (error.message?.includes('not set up') || error.message?.includes('onboarding')) {
        throw new Error('Please complete account setup first');
      }
      
      throw error;
    }
  }

  /**
   * Check Stripe Connect account status
   */
  async checkAccountStatus(accountId?: string): Promise<ConnectAccountStatus> {
    try {
      const result = await callFunction<ConnectAccountStatus>('getConnectAccountStatus', {
        accountId,
      });
      return result;
    } catch (error) {
      console.error('Error checking account status:', error);
      throw error;
    }
  }

  /**
   * Check if user has a fully set up Connect account
   */
  async isAccountReady(): Promise<boolean> {
    try {
      const status = await this.checkAccountStatus();
      return status.hasAccount && 
             status.detailsSubmitted && 
             status.chargesEnabled && 
             status.payoutsEnabled;
    } catch (error) {
      console.error('Error checking if account is ready:', error);
      return false;
    }
  }

  /**
   * Get account requirements (what's still needed for setup)
   */
  async getAccountRequirements(): Promise<string[]> {
    try {
      const status = await this.checkAccountStatus();
      return status.requirements || [];
    } catch (error) {
      console.error('Error getting account requirements:', error);
      return [];
    }
  }
}

// Export singleton instance
export const PayoutService = new PayoutServiceClass();