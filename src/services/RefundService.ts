// src/services/RefundService.ts
// UPDATED: Uses HTTP calls for v2 Cloud Functions (onRequest)
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
import { db, auth } from '../config/firebase';

// ============================================================================
// CONFIGURATION
// ============================================================================

const FUNCTIONS_BASE_URL = 'https://us-central1-peerrentalapp.cloudfunctions.net';

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
// TYPES
// ============================================================================

export interface Refund {
  id?: string;
  rentalId: string;
  disputeId?: string;
  userId: string;
  userName: string;
  amount: number;
  reason: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  paymentIntentId: string;
  refundId?: string;
  processedBy?: string;
  createdAt: Timestamp;
  processedAt?: Timestamp;
  errorMessage?: string;
}

// ============================================================================
// REFUND SERVICE CLASS
// ============================================================================

class RefundServiceClass {
  private refundsCollection = collection(db, 'refunds');

  /**
   * Request a refund for a rental
   */
  async requestRefund(
    rentalId: string,
    userId: string,
    userName: string,
    amount: number,
    reason: string,
    paymentIntentId: string,
    disputeId?: string
  ): Promise<{ success: boolean; refundId?: string; error?: string }> {
    try {
      // Create refund record
      const refundRef = await addDoc(this.refundsCollection, {
        rentalId,
        disputeId: disputeId || null,
        userId,
        userName,
        amount,
        reason,
        status: 'pending',
        paymentIntentId,
        createdAt: Timestamp.now(),
      });

      return { success: true, refundId: refundRef.id };
    } catch (error) {
      console.error('Error requesting refund:', error);
      return { success: false, error: 'Failed to request refund' };
    }
  }

  /**
   * Process a refund (call Cloud Function)
   */
  async processRefund(
    refundId: string,
    processedBy: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get the refund document to get paymentIntentId
      const refundRef = doc(db, 'refunds', refundId);
      const refundSnap = await getDoc(refundRef);
      
      if (!refundSnap.exists()) {
        return { success: false, error: 'Refund not found' };
      }
      
      const refundData = refundSnap.data();

      // Update status to processing
      await updateDoc(refundRef, {
        status: 'processing',
        processedBy,
      });

      // Call Cloud Function to process refund with Stripe
      const result = await callFunction<{
        refundId: string;
        status: string;
        amount: number;
      }>('createRefund', {
        paymentIntentId: refundData.paymentIntentId,
        rentalId: refundData.rentalId,
        amount: Math.round(refundData.amount * 100), // Convert to cents
        reason: 'requested_by_customer',
      });

      // Update refund status to completed
      await updateDoc(refundRef, {
        status: 'completed',
        stripeRefundId: result.refundId,
        processedAt: Timestamp.now(),
      });

      return { success: true };
    } catch (error: any) {
      console.error('Error processing refund:', error);
      
      // Update status to failed
      const refundRef = doc(db, 'refunds', refundId);
      await updateDoc(refundRef, {
        status: 'failed',
        errorMessage: error.message,
      });

      return { success: false, error: error.message || 'Failed to process refund' };
    }
  }

  /**
   * Cancel rental with refund (before start date)
   */
  async cancelRentalWithRefund(
    rentalId: string,
    userId: string,
    userName: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get rental details
      const rentalRef = doc(db, 'rentals', rentalId);
      const rentalSnap = await getDoc(rentalRef);

      if (!rentalSnap.exists()) {
        return { success: false, error: 'Rental not found' };
      }

      const rental = rentalSnap.data();

      // Check if rental can be cancelled
      if (rental.status !== 'approved' && rental.status !== 'active') {
        return { success: false, error: 'Rental cannot be cancelled' };
      }

      // Check if payment was made
      if (!rental.paymentIntentId) {
        return { success: false, error: 'No payment to refund' };
      }

      // Check if rental has already started
      const startDate = rental.startDate.toDate ? rental.startDate.toDate() : new Date(rental.startDate);
      const now = new Date();
      const hoursUntilStart = (startDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (hoursUntilStart < 24) {
        return { 
          success: false, 
          error: 'Cannot cancel within 24 hours of rental start' 
        };
      }

      // Full refund amount
      const refundAmount = rental.totalPrice;

      // Request refund
      const result = await this.requestRefund(
        rentalId,
        userId,
        userName,
        refundAmount,
        reason,
        rental.paymentIntentId
      );

      if (!result.success) {
        return result;
      }

      // Update rental status
      await updateDoc(rentalRef, {
        status: 'cancelled',
        refundStatus: 'pending',
        refundAmount,
        refundReason: reason,
        updatedAt: Timestamp.now(),
      });

      return { success: true };
    } catch (error: any) {
      console.error('Error cancelling rental with refund:', error);
      return { success: false, error: error.message || 'Failed to cancel rental' };
    }
  }

  /**
   * Process dispute refund (admin only)
   */
  async processDisputeRefund(
    disputeId: string,
    rentalId: string,
    refundAmount: number,
    processedBy: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get rental and dispute details
      const rentalRef = doc(db, 'rentals', rentalId);
      const rentalSnap = await getDoc(rentalRef);
      const disputeRef = doc(db, 'disputes', disputeId);
      const disputeSnap = await getDoc(disputeRef);

      if (!rentalSnap.exists() || !disputeSnap.exists()) {
        return { success: false, error: 'Rental or dispute not found' };
      }

      const rental = rentalSnap.data();
      const dispute = disputeSnap.data();

      if (!rental.paymentIntentId) {
        return { success: false, error: 'No payment to refund' };
      }

      // Validate refund amount
      if (refundAmount > rental.totalPrice) {
        return { success: false, error: 'Refund amount exceeds rental price' };
      }

      // Request refund
      const result = await this.requestRefund(
        rentalId,
        dispute.reporterId,
        dispute.reporterName,
        refundAmount,
        `Dispute resolution: ${dispute.description}`,
        rental.paymentIntentId,
        disputeId
      );

      if (!result.success || !result.refundId) {
        return result;
      }

      // Process the refund immediately
      const processResult = await this.processRefund(result.refundId, processedBy);

      if (!processResult.success) {
        return processResult;
      }

      // Update rental
      await updateDoc(rentalRef, {
        refundStatus: 'completed',
        refundAmount,
        updatedAt: Timestamp.now(),
      });

      // Update dispute
      await updateDoc(disputeRef, {
        refundAmount,
        refundStatus: 'completed',
        refundApprovedBy: processedBy,
        refundApprovedAt: Timestamp.now(),
      });

      return { success: true };
    } catch (error: any) {
      console.error('Error processing dispute refund:', error);
      return { success: false, error: error.message || 'Failed to process dispute refund' };
    }
  }

  /**
   * Get refund by ID
   */
  async getRefundById(refundId: string): Promise<Refund | null> {
    try {
      const refundRef = doc(db, 'refunds', refundId);
      const refundSnap = await getDoc(refundRef);

      if (!refundSnap.exists()) {
        return null;
      }

      return { id: refundSnap.id, ...refundSnap.data() } as Refund;
    } catch (error) {
      console.error('Error getting refund:', error);
      return null;
    }
  }

  /**
   * Get user's refunds
   */
  async getUserRefunds(userId: string): Promise<Refund[]> {
    try {
      const q = query(
        this.refundsCollection,
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Refund));
    } catch (error) {
      console.error('Error getting user refunds:', error);
      return [];
    }
  }

  /**
   * Get all pending refunds (admin)
   */
  async getPendingRefunds(): Promise<Refund[]> {
    try {
      const q = query(
        this.refundsCollection,
        where('status', '==', 'pending'),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Refund));
    } catch (error) {
      console.error('Error getting pending refunds:', error);
      return [];
    }
  }

  /**
   * Calculate refund amount based on cancellation time
   */
  calculateRefundAmount(
    totalPrice: number,
    startDate: Date,
    cancelDate: Date = new Date()
  ): { amount: number; percentage: number } {
    const hoursUntilStart = (startDate.getTime() - cancelDate.getTime()) / (1000 * 60 * 60);

    // Full refund if more than 24 hours before start
    if (hoursUntilStart >= 24) {
      return { amount: totalPrice, percentage: 100 };
    }

    // No refund if less than 24 hours
    return { amount: 0, percentage: 0 };
  }
}

export const RefundService = new RefundServiceClass();