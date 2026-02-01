// src/services/RentalService.ts - UPDATED WITH PAYOUT INTEGRATION & NOTIFICATIONS
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
  status: 'pending' | 'approved' | 'declined' | 'active' | 'completed' | 'cancelled';
  message?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  paymentIntentId?: string;
  paymentStatus?: 'unpaid' | 'paid';
  payoutId?: string;
  payoutStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  payoutProcessedAt?: Timestamp;
}

class RentalServiceClass {
  private rentalsCollection = collection(db, 'rentals');

  /**
   * Create a rental request
   */
  async createRental(rentalData: Omit<Rental, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const docRef = await addDoc(this.rentalsCollection, {
        ...rentalData,
        status: 'pending',
        paymentStatus: 'unpaid',
        payoutStatus: 'pending',
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
   * Complete a rental and process payout
   */
  async completeRental(rentalId: string): Promise<void> {
    try {
      // Get rental details
      const rentalRef = doc(db, 'rentals', rentalId);
      const rentalSnap = await getDoc(rentalRef);
      
      if (!rentalSnap.exists()) {
        throw new Error('Rental not found');
      }

      const rental = rentalSnap.data() as Rental;

      // Update rental status to completed
      await updateDoc(rentalRef, {
        status: 'completed',
        updatedAt: Timestamp.now(),
      });

      // 🔔 Send notification to renter about completion
      await NotificationService.sendNotificationToUser(
        rental.renterId,
        '✨ Rental Completed',
        `Your rental of "${rental.itemName}" is complete. Thanks for using our service!`,
        {
          type: 'rental_completed',
          rentalId: rentalId,
          screen: 'Rentals',
        }
      );

      // 🔔 Send notification to owner about completion
      await NotificationService.sendNotificationToUser(
        rental.ownerId,
        '✨ Rental Completed',
        `The rental of your "${rental.itemName}" has been completed.`,
        {
          type: 'rental_completed',
          rentalId: rentalId,
          screen: 'Rentals',
        }
      );

      // Get owner's Stripe account ID
      const ownerRef = doc(db, 'users', rental.ownerId);
      const ownerSnap = await getDoc(ownerRef);
      
      if (!ownerSnap.exists()) {
        throw new Error('Owner not found');
      }

      const ownerData = ownerSnap.data();
      const ownerStripeAccountId = ownerData.stripeConnectAccountId;

      // Only process payout if owner has connected Stripe account
      if (ownerStripeAccountId) {
        try {
          // Update payout status to processing
          await updateDoc(rentalRef, {
            payoutStatus: 'processing',
          });

          // Process payout
          const payoutId = await PayoutService.processRentalPayout(
            rentalId,
            rental.ownerId,
            rental.totalPrice,
            ownerStripeAccountId
          );

          // Update rental with payout success
          await updateDoc(rentalRef, {
            payoutId: payoutId,
            payoutStatus: 'completed',
            payoutProcessedAt: Timestamp.now(),
          });

          console.log('Payout processed successfully:', payoutId);

          // 🔔 Send notification to owner about payout
          const payoutAmount = rental.totalPrice * 0.9; // 90% after 10% fee
          await NotificationService.sendNotificationToUser(
            rental.ownerId,
            '💸 Payout Sent!',
            `$${payoutAmount.toFixed(2)} has been sent to your bank account for "${rental.itemName}".`,
            {
              type: 'payout_received',
              rentalId: rentalId,
              screen: 'Earnings',
            }
          );
        } catch (payoutError) {
          console.error('Payout processing failed:', payoutError);
          
          // Update rental with payout failure
          await updateDoc(rentalRef, {
            payoutStatus: 'failed',
          });
          
          // Don't throw error - rental is still completed, payout can be retried
        }
      } else {
        console.log('Owner has not connected Stripe account - payout pending');
        await updateDoc(rentalRef, {
          payoutStatus: 'pending',
        });
      }
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