// src/services/RentalService.ts - UPDATED WITH PAYOUT INTEGRATION & NOTIFICATIONS
// FIX Issues #9/#10: Added confirmation number generation
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  getDoc, 
  query, 
  where, 
  getDocs,
  Timestamp 
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { PayoutService } from './PayoutService';
import NotificationService from './NotificationService';
import SecurityDepositService from './SecurityDepositService';

// ============================================================================
// CONFIRMATION NUMBER GENERATOR - Issue #9
// ============================================================================

/**
 * Generate a unique confirmation number in format: SS-YYYYMMDD-XXXX
 * SS = Share Stash prefix
 * YYYYMMDD = date
 * XXXX = random alphanumeric (uppercase, no ambiguous chars)
 */
function generateConfirmationNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;
  
  // Use unambiguous characters (no 0/O, 1/I/L)
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let randomPart = '';
  for (let i = 0; i < 4; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return `SS-${dateStr}-${randomPart}`;
}

// ============================================================================
// TYPES
// ============================================================================

export interface Rental {
  id?: string;
  itemId: string;
  itemName: string;
  itemImage?: string;
  ownerId: string;
  ownerName: string;
  renterId: string;
  renterName: string;
  startDate: Date;
  endDate: Date;
  totalPrice: number;
  rentalPeriodType?: 'hourly' | 'daily' | 'weekly' | 'monthly';
  rentalQuantity?: number; // number of hours/days/weeks/months
  status: 'pending' | 'approved' | 'declined' | 'active' | 'pending_completion' | 'completed_pending_payout' | 'completed' | 'cancelled';
  message?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  paymentIntentId?: string;
  paymentStatus?: 'unpaid' | 'paid';
  payoutId?: string;
  payoutStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  payoutProcessedAt?: Timestamp;
  // Issue #9/#10: Confirmation number
  confirmationNumber?: string;
  // Handoff photos (pick-up & return flow)
  pickupPhotoOwner?: string;
  pickupPhotoRenter?: string;
  returnPhotoOwner?: string;
  returnPhotoRenter?: string;
  pickupCompletedAt?: Timestamp;
  returnCompletedAt?: Timestamp;
  // Fraud protection (Layer 2 — mutual confirmation)
  ownerConfirmedReturn?: boolean;
  renterConfirmedReturn?: boolean;
  // Fraud protection (Layer 3 — 48h dispute window)
  completedAt?: Timestamp;
  payoutEligibleAt?: Timestamp;     // completedAt + 48 hours
  payoutFrozen?: boolean;           // true if dispute filed within window
  // Fraud protection (Layer 4 — auto-complete)
  autoCompleteAt?: Timestamp;       // endDate + 3 days
  autoCompleteReminders?: number;   // count of reminders sent (0, 1, 2)
  // Security deposit
  securityDeposit?: number;           // Deposit amount in dollars
  depositId?: string;                  // Reference to securityDeposits collection
  depositStatus?: 'pending' | 'held' | 'released' | 'partial_claim' | 'full_claim' | 'failed' | 'expired';
}

class RentalServiceClass {
  private rentalsCollection = collection(db, 'rentals');

  /**
   * Create a rental request
   * FIX Issue #9: Generate unique confirmation number
   */
  async createRental(rentalData: Omit<Rental, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      // Generate a unique confirmation number
      let confirmationNumber = generateConfirmationNumber();
      
      // Ensure uniqueness by checking Firestore (very unlikely collision but safe)
      let isUnique = false;
      let attempts = 0;
      while (!isUnique && attempts < 5) {
        const q = query(
          this.rentalsCollection,
          where('confirmationNumber', '==', confirmationNumber)
        );
        const existing = await getDocs(q);
        if (existing.empty) {
          isUnique = true;
        } else {
          confirmationNumber = generateConfirmationNumber();
          attempts++;
        }
      }

      const docRef = await addDoc(this.rentalsCollection, {
        ...rentalData,
        status: 'pending',
        paymentStatus: 'unpaid',
        payoutStatus: 'pending',
        confirmationNumber, // Issue #9: Store confirmation number
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // 🔔 Send notification to owner about new rental request
      await NotificationService.sendNotificationToUser(
        rentalData.ownerId,
        '📬 New Rental Request',
        `${rentalData.renterName} wants to rent your "${rentalData.itemName}"`,
        {
          type: 'rental_request',
          rentalId: docRef.id,
          screen: 'Rentals',
        }
      );

      return docRef.id;
    } catch (error) {
      console.error('Error creating rental:', error);
      throw error;
    }
  }

  /**
   * Approve a rental request
   */
  async approveRental(rentalId: string): Promise<void> {
    try {
      const rentalRef = doc(db, 'rentals', rentalId);
      const rentalSnap = await getDoc(rentalRef);
      
      if (!rentalSnap.exists()) {
        throw new Error('Rental not found');
      }

      const rental = rentalSnap.data() as Rental;

      await updateDoc(rentalRef, {
        status: 'approved',
        updatedAt: Timestamp.now(),
      });

      // 🔔 Send notification to renter about approval
      await NotificationService.sendNotificationToUser(
        rental.renterId,
        '✅ Rental Approved!',
        `Your rental request for "${rental.itemName}" has been approved. Please complete payment.`,
        {
          type: 'rental_approved',
          rentalId: rentalId,
          screen: 'Checkout',
        }
      );
    } catch (error) {
      console.error('Error approving rental:', error);
      throw error;
    }
  }

  /**
   * Decline a rental request
   */
  async declineRental(rentalId: string): Promise<void> {
    try {
      const rentalRef = doc(db, 'rentals', rentalId);
      const rentalSnap = await getDoc(rentalRef);
      
      if (!rentalSnap.exists()) {
        throw new Error('Rental not found');
      }

      const rental = rentalSnap.data() as Rental;

      await updateDoc(rentalRef, {
        status: 'declined',
        updatedAt: Timestamp.now(),
      });

      // 🔔 Send notification to renter about decline
      await NotificationService.sendNotificationToUser(
        rental.renterId,
        '❌ Rental Declined',
        `Your rental request for "${rental.itemName}" was declined.`,
        {
          type: 'rental_declined',
          rentalId: rentalId,
          screen: 'Rentals',
        }
      );
    } catch (error) {
      console.error('Error declining rental:', error);
      throw error;
    }
  }

  /**
   * Start a rental (after payment)
   */
  async startRental(rentalId: string, paymentIntentId: string): Promise<void> {
    try {
      const rentalRef = doc(db, 'rentals', rentalId);
      const rentalSnap = await getDoc(rentalRef);
      
      if (!rentalSnap.exists()) {
        throw new Error('Rental not found');
      }

      const rental = rentalSnap.data() as Rental;

      await updateDoc(rentalRef, {
        status: 'active',
        paymentStatus: 'paid',
        paymentIntentId: paymentIntentId,
        updatedAt: Timestamp.now(),
      });

      // 🔔 Send notification to renter about active rental
      await NotificationService.sendNotificationToUser(
        rental.renterId,
        '🚀 Rental Active!',
        `Your rental of "${rental.itemName}" is now active. Enjoy!`,
        {
          type: 'rental_active',
          rentalId: rentalId,
          screen: 'Rentals',
        }
      );

      // 🔔 Send notification to owner about payment received
      await NotificationService.sendNotificationToUser(
        rental.ownerId,
        '💳 Payment Received',
        `${rental.renterName} has paid for "${rental.itemName}". Rental is now active.`,
        {
          type: 'payment_received',
          rentalId: rentalId,
          screen: 'Rentals',
        }
      );
    } catch (error) {
      console.error('Error starting rental:', error);
      throw error;
    }
  }

  /**
   * LAYER 1 + 2: Owner initiates completion (Mark Complete)
   * - Layer 1: Blocks if current time is before endDate
   * - Layer 2: Sets ownerConfirmedReturn, transitions to pending_completion
   */
  async initiateCompletion(rentalId: string): Promise<void> {
    try {
      const rentalRef = doc(db, 'rentals', rentalId);
      const rentalSnap = await getDoc(rentalRef);

      if (!rentalSnap.exists()) {
        throw new Error('Rental not found');
      }

      const rental = rentalSnap.data() as Rental;

      // LAYER 1 — Time-based lockout
      const endDate = (rental.endDate as any)?.toDate
        ? (rental.endDate as any).toDate()
        : new Date(rental.endDate as any);
      const now = new Date();

      if (now < endDate) {
        throw new Error('Rental cannot be completed before the end date. Please wait until the rental period ends.');
      }

      // LAYER 2 — Mark owner confirmation
      await updateDoc(rentalRef, {
        ownerConfirmedReturn: true,
        status: 'pending_completion',
        updatedAt: Timestamp.now(),
      });

      // Calculate auto-complete date (Layer 4): endDate + 3 days
      const autoCompleteDate = new Date(endDate.getTime() + 3 * 24 * 60 * 60 * 1000);

      await updateDoc(rentalRef, {
        autoCompleteAt: Timestamp.fromDate(autoCompleteDate),
        autoCompleteReminders: 0,
      });

      // 🔔 Notify renter to confirm return
      await NotificationService.sendNotificationToUser(
        rental.renterId,
        '📦 Return Confirmation Needed',
        `${rental.ownerName} has marked "${rental.itemName}" as returned. Please confirm to complete the rental.`,
        {
          type: 'return_confirmation_needed',
          rentalId: rentalId,
          screen: 'Rentals',
        }
      );
    } catch (error) {
      console.error('Error initiating completion:', error);
      throw error;
    }
  }

  /**
   * LAYER 2: Renter confirms return
   * When both confirmations are in, transitions to completed_pending_payout (Layer 3)
   */
  async confirmReturn(rentalId: string): Promise<void> {
    try {
      const rentalRef = doc(db, 'rentals', rentalId);
      const rentalSnap = await getDoc(rentalRef);

      if (!rentalSnap.exists()) {
        throw new Error('Rental not found');
      }

      const rental = rentalSnap.data() as Rental;

      if (rental.status !== 'pending_completion') {
        throw new Error('This rental is not awaiting return confirmation.');
      }

      // Set renter confirmation
      await updateDoc(rentalRef, {
        renterConfirmedReturn: true,
        updatedAt: Timestamp.now(),
      });

      // Both confirmed — move to Layer 3 (48h dispute window)
      if (rental.ownerConfirmedReturn) {
        const now = new Date();
        const payoutEligibleDate = new Date(now.getTime() + 48 * 60 * 60 * 1000);

        await updateDoc(rentalRef, {
          status: 'completed_pending_payout',
          completedAt: Timestamp.now(),
          payoutEligibleAt: Timestamp.fromDate(payoutEligibleDate),
          payoutFrozen: false,
        });

        // Auto-release security deposit (no damage reported)
        if (rental.securityDeposit && rental.securityDeposit > 0) {
          try {
            const deposit = await SecurityDepositService.getDepositByRentalId(rentalId);
            if (deposit?.id && SecurityDepositService.canRelease(deposit)) {
              await SecurityDepositService.releaseDeposit(deposit.id);
              console.log('Security deposit released for rental:', rentalId);
            }
          } catch (depositError) {
            console.warn('Failed to auto-release deposit (non-blocking):', depositError);
          }
        }

        // 🔔 Notify both parties
        await NotificationService.sendNotificationToUser(
          rental.renterId,
          '✅ Return Confirmed',
          `Rental of "${rental.itemName}" is confirmed complete. Payout will process in 48 hours.`,
          { type: 'rental_confirmed', rentalId, screen: 'Rentals' }
        );

        await NotificationService.sendNotificationToUser(
          rental.ownerId,
          '✅ Return Confirmed',
          `${rental.renterName} confirmed the return of "${rental.itemName}". Payout will process in 48 hours.`,
          { type: 'rental_confirmed', rentalId, screen: 'Rentals' }
        );
      }
    } catch (error) {
      console.error('Error confirming return:', error);
      throw error;
    }
  }

  /**
   * LAYER 3: Process payout after 48h window (called by app check or scheduled function)
   * Only processes if not frozen by a dispute
   */
  async processPayoutIfEligible(rentalId: string): Promise<boolean> {
    try {
      const rentalRef = doc(db, 'rentals', rentalId);
      const rentalSnap = await getDoc(rentalRef);

      if (!rentalSnap.exists()) {
        throw new Error('Rental not found');
      }

      const rental = rentalSnap.data() as Rental;

      // Must be in completed_pending_payout status
      if (rental.status !== 'completed_pending_payout') {
        return false;
      }

      // Check if payout is frozen due to dispute
      if (rental.payoutFrozen) {
        console.log('Payout frozen due to dispute for rental:', rentalId);
        return false;
      }

      // Check if 48 hours have passed
      const payoutEligibleAt = (rental.payoutEligibleAt as any)?.toDate
        ? (rental.payoutEligibleAt as any).toDate()
        : new Date(rental.payoutEligibleAt as any);
      const now = new Date();

      if (now < payoutEligibleAt) {
        console.log('Payout not yet eligible for rental:', rentalId);
        return false;
      }

      // Process the actual payout using the original completeRental payout logic
      await this.finalizeRentalPayout(rentalId, rental);
      return true;
    } catch (error) {
      console.error('Error checking payout eligibility:', error);
      throw error;
    }
  }

  /**
   * LAYER 4: Auto-complete — called when renter hasn't confirmed after 3 days past endDate
   * The scheduled Cloud Function handles the timing; this does the state transition
   */
  async autoComplete(rentalId: string): Promise<void> {
    try {
      const rentalRef = doc(db, 'rentals', rentalId);
      const rentalSnap = await getDoc(rentalRef);

      if (!rentalSnap.exists()) return;

      const rental = rentalSnap.data() as Rental;
      if (rental.status !== 'pending_completion') return;

      const now = new Date();
      const payoutEligibleDate = new Date(now.getTime() + 48 * 60 * 60 * 1000);

      await updateDoc(rentalRef, {
        renterConfirmedReturn: true,  // auto-set
        status: 'completed_pending_payout',
        completedAt: Timestamp.now(),
        payoutEligibleAt: Timestamp.fromDate(payoutEligibleDate),
        payoutFrozen: false,
        updatedAt: Timestamp.now(),
      });

      // 🔔 Notify both parties about auto-completion
      await NotificationService.sendNotificationToUser(
        rental.renterId,
        '⏰ Rental Auto-Completed',
        `Your rental of "${rental.itemName}" was automatically completed because the return was not disputed within 3 days.`,
        { type: 'rental_auto_completed', rentalId, screen: 'Rentals' }
      );

      await NotificationService.sendNotificationToUser(
        rental.ownerId,
        '⏰ Rental Auto-Completed',
        `The rental of "${rental.itemName}" was automatically completed. Payout will process in 48 hours.`,
        { type: 'rental_auto_completed', rentalId, screen: 'Rentals' }
      );
    } catch (error) {
      console.error('Error auto-completing rental:', error);
      throw error;
    }
  }

  /**
   * Internal: Finalize payout — extracted from old completeRental
   * Marks rental as completed and processes Stripe transfer
   */
  private async finalizeRentalPayout(rentalId: string, rental: Rental): Promise<void> {
    const rentalRef = doc(db, 'rentals', rentalId);

    // Update to final completed status
    await updateDoc(rentalRef, {
      status: 'completed',
      updatedAt: Timestamp.now(),
    });

    // 🔔 Notify both parties
    await NotificationService.sendNotificationToUser(
      rental.renterId,
      '✨ Rental Completed',
      `Your rental of "${rental.itemName}" is complete. Thanks for using ShareStash!`,
      { type: 'rental_completed', rentalId, screen: 'Rentals' }
    );

    await NotificationService.sendNotificationToUser(
      rental.ownerId,
      '✨ Rental Completed',
      `The rental of your "${rental.itemName}" has been completed. Payout is being processed.`,
      { type: 'rental_completed', rentalId, screen: 'Rentals' }
    );

    // Get owner's Stripe account ID
    const ownerRef = doc(db, 'users', rental.ownerId);
    const ownerSnap = await getDoc(ownerRef);

    if (!ownerSnap.exists()) {
      throw new Error('Owner not found');
    }

    const ownerData = ownerSnap.data();
    const ownerStripeAccountId = ownerData.stripeConnectAccountId;

    // Process payout if owner has connected Stripe
    if (ownerStripeAccountId) {
      try {
        await updateDoc(rentalRef, { payoutStatus: 'processing' });

        const payoutId = await PayoutService.processRentalPayout(
          rentalId,
          rental.ownerId,
          rental.totalPrice,
          ownerStripeAccountId
        );

        await updateDoc(rentalRef, {
          payoutId: payoutId,
          payoutStatus: 'completed',
          payoutProcessedAt: Timestamp.now(),
        });

        console.log('Payout processed successfully:', payoutId);

        const payoutAmount = rental.totalPrice * 0.9;
        await NotificationService.sendNotificationToUser(
          rental.ownerId,
          '💸 Payout Sent!',
          `$${payoutAmount.toFixed(2)} has been sent to your bank account for "${rental.itemName}".`,
          { type: 'payout_received', rentalId, screen: 'Earnings' }
        );
      } catch (payoutError) {
        console.error('Payout processing failed:', payoutError);
        await updateDoc(rentalRef, { payoutStatus: 'failed' });
      }
    } else {
      console.log('Owner has not connected Stripe account - payout pending');
      await updateDoc(rentalRef, { payoutStatus: 'pending' });
    }
  }

  /**
   * Legacy completeRental — kept as a direct complete for admin use
   * Normal flow should use initiateCompletion → confirmReturn → processPayoutIfEligible
   */
  async completeRental(rentalId: string): Promise<void> {
    try {
      const rentalRef = doc(db, 'rentals', rentalId);
      const rentalSnap = await getDoc(rentalRef);
      
      if (!rentalSnap.exists()) {
        throw new Error('Rental not found');
      }

      const rental = rentalSnap.data() as Rental;
      await this.finalizeRentalPayout(rentalId, rental);
    } catch (error) {
      console.error('Error completing rental:', error);
      throw error;
    }
  }

  /**
   * Cancel a rental
   */
  async cancelRental(rentalId: string): Promise<void> {
    try {
      const rentalRef = doc(db, 'rentals', rentalId);
      await updateDoc(rentalRef, {
        status: 'cancelled',
        updatedAt: Timestamp.now(),
      });
    } catch (error) {
      console.error('Error cancelling rental:', error);
      throw error;
    }
  }

  /**
   * Get rental by ID
   */
  async getRentalById(rentalId: string): Promise<Rental | null> {
    try {
      const docRef = doc(db, 'rentals', rentalId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as Rental;
      }
      return null;
    } catch (error) {
      console.error('Error fetching rental:', error);
      throw error;
    }
  }

  /**
   * Get rentals where user is owner
   */
  async getOwnerRentals(userId: string): Promise<Rental[]> {
    try {
      const q = query(
        this.rentalsCollection,
        where('ownerId', '==', userId)
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Rental));
    } catch (error) {
      console.error('Error fetching owner rentals:', error);
      throw error;
    }
  }

  /**
   * Get rentals where user is renter
   */
  async getRenterRentals(userId: string): Promise<Rental[]> {
    try {
      const q = query(
        this.rentalsCollection,
        where('renterId', '==', userId)
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Rental));
    } catch (error) {
      console.error('Error fetching renter rentals:', error);
      throw error;
    }
  }

  /**
   * Retry failed payout
   */

  /**
   * Update a handoff photo field on a rental document
   */
  async updateHandoffPhoto(
    rentalId: string,
    field: 'pickupPhotoOwner' | 'pickupPhotoRenter' | 'returnPhotoOwner' | 'returnPhotoRenter',
    photoUrl: string,
  ): Promise<void> {
    try {
      const rentalRef = doc(db, 'rentals', rentalId);

      const updateData: Record<string, any> = {
        [field]: photoUrl,
        updatedAt: Timestamp.now(),
      };

      // If both pickup photos are now present, mark pickup as complete
      if (field === 'pickupPhotoOwner' || field === 'pickupPhotoRenter') {
        const rentalSnap = await getDoc(rentalRef);
        if (rentalSnap.exists()) {
          const rental = rentalSnap.data() as Rental;
          const otherField = field === 'pickupPhotoOwner' ? 'pickupPhotoRenter' : 'pickupPhotoOwner';
          if (rental[otherField]) {
            updateData.pickupCompletedAt = Timestamp.now();
          }
        }
      }

      // If both return photos are now present, mark return as complete
      if (field === 'returnPhotoOwner' || field === 'returnPhotoRenter') {
        const rentalSnap = await getDoc(rentalRef);
        if (rentalSnap.exists()) {
          const rental = rentalSnap.data() as Rental;
          const otherField = field === 'returnPhotoOwner' ? 'returnPhotoRenter' : 'returnPhotoOwner';
          if (rental[otherField]) {
            updateData.returnCompletedAt = Timestamp.now();
          }
        }
      }

      await updateDoc(rentalRef, updateData);
    } catch (error) {
      console.error('Error updating handoff photo:', error);
      throw error;
    }
  }

  /**
   * Retry failed payout (original method)
   */
  async retryPayout(rentalId: string): Promise<void> {
    try {
      const rentalRef = doc(db, 'rentals', rentalId);
      const rentalSnap = await getDoc(rentalRef);
      
      if (!rentalSnap.exists()) {
        throw new Error('Rental not found');
      }

      const rental = rentalSnap.data() as Rental;

      // Check if rental is completed and payout failed
      if (rental.status !== 'completed' || rental.payoutStatus !== 'failed') {
        throw new Error('Cannot retry payout for this rental');
      }

      // Get owner's Stripe account ID
      const ownerRef = doc(db, 'users', rental.ownerId);
      const ownerSnap = await getDoc(ownerRef);
      
      if (!ownerSnap.exists()) {
        throw new Error('Owner not found');
      }

      const ownerData = ownerSnap.data();
      const ownerStripeAccountId = ownerData.stripeConnectAccountId;

      if (!ownerStripeAccountId) {
        throw new Error('Owner has not connected Stripe account');
      }

      // Update status to processing
      await updateDoc(rentalRef, {
        payoutStatus: 'processing',
      });

      // Retry payout
      const payoutId = await PayoutService.processRentalPayout(
        rentalId,
        rental.ownerId,
        rental.totalPrice,
        ownerStripeAccountId
      );

      // Update with success
      await updateDoc(rentalRef, {
        payoutId: payoutId,
        payoutStatus: 'completed',
        payoutProcessedAt: Timestamp.now(),
      });
    } catch (error) {
      // Revert to failed status
      const rentalRef = doc(db, 'rentals', rentalId);
      await updateDoc(rentalRef, {
        payoutStatus: 'failed',
      });
      
      console.error('Error retrying payout:', error);
      throw error;
    }
  }
}

export const RentalService = new RentalServiceClass();