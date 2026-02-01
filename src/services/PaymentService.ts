// src/services/PaymentService.ts
// Payment Service with Stripe Connect support
// UPDATED: Uses HTTP calls for v2 Cloud Functions + Identity Verification

import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc,
  deleteDoc,
  getDoc,
  query,
  where,
  getDocs,
  orderBy
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { getAuth } from 'firebase/auth';

// ============================================================================
// CONFIGURATION
// ============================================================================

const FUNCTIONS_BASE_URL = 'https://us-central1-peerrentalapp.cloudfunctions.net';

// ============================================================================
// TYPES
// ============================================================================

export type PaymentStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded';
export type PaymentType = 'rental' | 'deposit' | 'damage_claim';

export interface PaymentIntent {
  id: string;
  rentalId: string;
  payerId: string;
  payerName: string;
  recipientId: string;
  recipientName: string;
  amount: number;
  currency: string;
  type: PaymentType;
  status: PaymentStatus;
  stripePaymentIntentId?: string;
  stripeChargeId?: string;
  paymentMethod?: string;
  createdAt: string;
  completedAt?: string;
  refundedAt?: string;
  errorMessage?: string;
}

export interface PaymentMethod {
  id: string;
  userId: string;
  stripePaymentMethodId: string;
  type: 'card';
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
  createdAt: string;
}

export interface Payout {
  id: string;
  userId: string;
  userName: string;
  rentalId: string;
  amount: number;
  platformFee: number;
  originalAmount: number;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  stripeTransferId?: string;
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
}

export interface ConnectAccount {
  id: string;
  userId: string;
  stripeAccountId: string;
  status: 'pending' | 'active' | 'restricted';
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectStatusResponse {
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

export interface IdentityVerificationResult {
  sessionId?: string;
  clientSecret?: string;
  url?: string;
  status: string;
  alreadyVerified?: boolean;
  message?: string;
}

export interface IdentityVerificationStatus {
  hasSession: boolean;
  sessionId?: string;
  status: string;
  verified: boolean;
  lastError?: { reason?: string };
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
// PAYMENT SERVICE CLASS
// ============================================================================

class PaymentService {
  private static instance: PaymentService;

  static getInstance(): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService();
    }
    return PaymentService.instance;
  }

  // ==========================================================================
  // STRIPE CONNECT METHODS
  // ==========================================================================

  /**
   * Create a Stripe Connect Express account for a seller
   */
  async createConnectAccount(
    userId: string,
    email: string,
    firstName?: string,
    lastName?: string
  ): Promise<{ success: boolean; accountId?: string; error?: string }> {
    try {
      const result = await callFunction<{ accountId: string }>('createConnectAccount', {
        email,
        firstName,
        lastName,
      });

      return {
        success: true,
        accountId: result.accountId,
      };
    } catch (error: any) {
      console.error('Error creating Connect account:', error);
      return { success: false, error: error.message || 'Failed to create Connect account' };
    }
  }

  /**
   * Create an account onboarding link for Stripe Connect
   */
  async createAccountLink(
    accountId?: string
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const result = await callFunction<{ url: string }>('createAccountLink', {
        accountId,
      });

      return {
        success: true,
        url: result.url,
      };
    } catch (error: any) {
      console.error('Error creating account link:', error);
      return { success: false, error: error.message || 'Failed to create account link' };
    }
  }

  /**
   * Get Connect account status
   */
  async getConnectAccountStatus(
    accountId?: string
  ): Promise<{ success: boolean; status?: ConnectStatusResponse; error?: string }> {
    try {
      const result = await callFunction<ConnectStatusResponse>('getConnectAccountStatus', {
        accountId,
      });

      return {
        success: true,
        status: result,
      };
    } catch (error: any) {
      console.error('Error getting Connect account status:', error);
      return { success: false, error: error.message || 'Failed to get account status' };
    }
  }

  /**
   * Create a login link to the Stripe Express Dashboard
   */
  async createDashboardLink(accountId?: string): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const result = await callFunction<{ url: string }>('createConnectLoginLink', {
        accountId,
      });

      return { success: true, url: result.url };
    } catch (error: any) {
      console.error('Error creating dashboard link:', error);
      return { success: false, error: error.message || 'Failed to create dashboard link' };
    }
  }

  // ==========================================================================
  // IDENTITY VERIFICATION METHODS
  // ==========================================================================

  /**
   * Create an identity verification session
   */
  async createIdentityVerificationSession(
    rentalId?: string
  ): Promise<{ success: boolean; result?: IdentityVerificationResult; error?: string }> {
    try {
      const result = await callFunction<IdentityVerificationResult>(
        'createIdentityVerificationSession',
        { rentalId }
      );

      return {
        success: true,
        result,
      };
    } catch (error: any) {
      console.error('Error creating identity verification session:', error);
      return { success: false, error: error.message || 'Failed to create verification session' };
    }
  }

  /**
   * Get identity verification status
   */
  async getIdentityVerificationStatus(
    sessionId?: string
  ): Promise<{ success: boolean; status?: IdentityVerificationStatus; error?: string }> {
    try {
      const result = await callFunction<IdentityVerificationStatus>(
        'getIdentityVerificationStatus',
        { sessionId }
      );

      return {
        success: true,
        status: result,
      };
    } catch (error: any) {
      console.error('Error getting identity verification status:', error);
      return { success: false, error: error.message || 'Failed to get verification status' };
    }
  }

  /**
   * Check if user's identity is verified
   */
  async isIdentityVerified(): Promise<boolean> {
    try {
      const result = await this.getIdentityVerificationStatus();
      return result.success && result.status?.verified === true;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // PAYMENT INTENT METHODS
  // ==========================================================================

  /**
   * Create a payment intent for a rental
   */
  async createPaymentIntent(
    rentalId: string,
    payerId: string,
    payerName: string,
    recipientId: string,
    recipientName: string,
    amount: number,
    type: PaymentType = 'rental',
    paymentMethodId?: string
  ): Promise<{ 
    success: boolean; 
    paymentIntent?: PaymentIntent; 
    clientSecret?: string; 
    requiresIdentityVerification?: boolean;
    error?: string 
  }> {
    try {
      const result = await callFunction<{
        clientSecret: string;
        paymentIntentId: string;
        status: string;
        amount: number;
        platformFee: number;
        sellerAmount: number;
        requiresIdentityVerification: boolean;
      }>('createPaymentIntent', {
        rentalId,
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'usd',
        sellerId: recipientId,
        paymentMethodId,
      });

      // Create payment record in Firestore
      const paymentIntent: Omit<PaymentIntent, 'id'> = {
        rentalId,
        payerId,
        payerName,
        recipientId,
        recipientName,
        amount,
        currency: 'usd',
        type,
        status: 'pending',
        stripePaymentIntentId: result.paymentIntentId,
        createdAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, 'payments'), paymentIntent);

      return {
        success: true,
        paymentIntent: {
          id: docRef.id,
          ...paymentIntent,
        },
        clientSecret: result.clientSecret,
        requiresIdentityVerification: result.requiresIdentityVerification,
      };
    } catch (error: any) {
      console.error('Error creating payment intent:', error);
      
      // Check if identity verification is required
      if (error.message?.includes('Identity verification required')) {
        return { 
          success: false, 
          requiresIdentityVerification: true,
          error: error.message 
        };
      }
      
      return { success: false, error: error.message || 'Failed to create payment intent' };
    }
  }

  /**
   * Confirm a payment was successful
   */
  async confirmPayment(
    paymentIntentId: string,
    stripeChargeId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const paymentRef = doc(db, 'payments', paymentIntentId);
      
      await updateDoc(paymentRef, {
        status: 'succeeded',
        stripeChargeId,
        completedAt: new Date().toISOString(),
      });

      return { success: true };
    } catch (error: any) {
      console.error('Error confirming payment:', error);
      return { success: false, error: error.message || 'Failed to confirm payment' };
    }
  }

  /**
   * Get payment by rental ID
   */
  async getPaymentByRental(rentalId: string): Promise<PaymentIntent | null> {
    try {
      const paymentsRef = collection(db, 'payments');
      const q = query(paymentsRef, where('rentalId', '==', rentalId));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        return {
          id: doc.id,
          ...doc.data(),
        } as PaymentIntent;
      }

      return null;
    } catch (error) {
      console.log('Error fetching payment:', error);
      return null;
    }
  }

  /**
   * Refund a payment
   */
  async refundPayment(
    paymentIntentId: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const paymentDoc = await getDoc(doc(db, 'payments', paymentIntentId));
      
      if (!paymentDoc.exists()) {
        return { success: false, error: 'Payment not found' };
      }

      const payment = paymentDoc.data() as PaymentIntent;

      const result = await callFunction<{ refundId: string; status: string; amount: number }>(
        'createRefund',
        {
          paymentIntentId: payment.stripePaymentIntentId,
          reason,
        }
      );

      await updateDoc(doc(db, 'payments', paymentIntentId), {
        status: 'refunded',
        refundedAt: new Date().toISOString(),
      });

      return { success: true };
    } catch (error: any) {
      console.error('Error refunding payment:', error);
      return { success: false, error: error.message || 'Failed to refund payment' };
    }
  }

  // ==========================================================================
  // PAYOUT METHODS
  // ==========================================================================

  /**
   * Create a payout to a seller
   */
  async createPayout(
    userId: string,
    userName: string,
    rentalId: string,
    amount: number
  ): Promise<{ success: boolean; payout?: Payout; error?: string }> {
    try {
      const platformFee = this.calculatePlatformFee(amount);
      const ownerAmount = amount - platformFee;

      const result = await callFunction<{
        transferId: string;
        amount: number;
        originalAmount: number;
        platformFee: number;
      }>('processTransfer', {
        sellerId: userId,
        amount: Math.round(amount * 100), // Convert to cents
        rentalId,
      });

      const payout: Omit<Payout, 'id'> = {
        userId,
        userName,
        rentalId,
        amount: ownerAmount,
        platformFee,
        originalAmount: amount,
        currency: 'usd',
        status: 'completed',
        stripeTransferId: result.transferId,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, 'payouts'), payout);

      return {
        success: true,
        payout: {
          id: docRef.id,
          ...payout,
        },
      };
    } catch (error: any) {
      console.error('Error creating payout:', error);
      
      // Record failed payout attempt
      const platformFee = this.calculatePlatformFee(amount);
      const failedPayout: Omit<Payout, 'id'> = {
        userId,
        userName,
        rentalId,
        amount: amount - platformFee,
        platformFee,
        originalAmount: amount,
        currency: 'usd',
        status: 'failed',
        errorMessage: error.message,
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, 'payouts'), failedPayout);

      return { success: false, error: error.message || 'Failed to create payout' };
    }
  }

  /**
   * Get all payouts for a user
   */
  async getUserPayouts(userId: string): Promise<Payout[]> {
    try {
      const payoutsRef = collection(db, 'payouts');
      const q = query(
        payoutsRef, 
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);

      const payouts: Payout[] = [];
      querySnapshot.forEach((docSnap) => {
        payouts.push({
          id: docSnap.id,
          ...docSnap.data(),
        } as Payout);
      });

      return payouts;
    } catch (error) {
      console.error('Error fetching payouts:', error);
      return [];
    }
  }

  /**
   * Get earnings summary for a user
   */
  async getUserEarnings(userId: string): Promise<{
    totalEarnings: number;
    pendingPayouts: number;
    completedPayouts: number;
    failedPayouts: number;
  }> {
    try {
      const payouts = await this.getUserPayouts(userId);

      let totalEarnings = 0;
      let pendingPayouts = 0;
      let completedPayouts = 0;
      let failedPayouts = 0;

      payouts.forEach((payout) => {
        if (payout.status === 'completed') {
          totalEarnings += payout.amount;
          completedPayouts += payout.amount;
        } else if (payout.status === 'pending' || payout.status === 'processing') {
          pendingPayouts += payout.amount;
        } else if (payout.status === 'failed') {
          failedPayouts += payout.amount;
        }
      });

      return {
        totalEarnings,
        pendingPayouts,
        completedPayouts,
        failedPayouts,
      };
    } catch (error) {
      console.error('Error calculating user earnings:', error);
      return {
        totalEarnings: 0,
        pendingPayouts: 0,
        completedPayouts: 0,
        failedPayouts: 0,
      };
    }
  }

  // ==========================================================================
  // PAYMENT METHOD METHODS
  // ==========================================================================

  /**
   * Create a SetupIntent for adding a new card
   */
  async createSetupIntent(): Promise<{ success: boolean; clientSecret?: string; error?: string }> {
    try {
      const result = await callFunction<{ clientSecret: string; setupIntentId: string }>(
        'createSetupIntent',
        {}
      );

      return {
        success: true,
        clientSecret: result.clientSecret,
      };
    } catch (error: any) {
      console.error('Error creating setup intent:', error);
      return { success: false, error: error.message || 'Failed to create setup intent' };
    }
  }

  /**
   * Add a payment method (attach to customer)
   */
  async addPaymentMethod(
    userId: string,
    paymentMethodId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await callFunction<{
        success: boolean;
        paymentMethod: {
          id: string;
          brand: string;
          last4: string;
          expMonth: number;
          expYear: number;
        };
      }>('attachPaymentMethod', {
        paymentMethodId,
      });

      // Update existing default cards to non-default
      const existingMethods = await this.getPaymentMethods(userId);
      for (const method of existingMethods) {
        if (method.isDefault) {
          await updateDoc(doc(db, 'paymentMethods', method.id), {
            isDefault: false,
          });
        }
      }

      // Create local payment method record
      const paymentMethod: Omit<PaymentMethod, 'id'> = {
        userId,
        stripePaymentMethodId: paymentMethodId,
        type: 'card',
        brand: result.paymentMethod.brand || 'unknown',
        last4: result.paymentMethod.last4 || '****',
        expiryMonth: result.paymentMethod.expMonth || 0,
        expiryYear: result.paymentMethod.expYear || 0,
        isDefault: true,
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, 'paymentMethods'), paymentMethod);

      return { success: true };
    } catch (error: any) {
      console.error('Error adding payment method:', error);
      return { success: false, error: error.message || 'Failed to add payment method' };
    }
  }

  /**
   * Remove a payment method
   */
  async removePaymentMethod(paymentMethodId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Find the local record first
      const methodsRef = collection(db, 'paymentMethods');
      const q = query(methodsRef, where('stripePaymentMethodId', '==', paymentMethodId));
      const querySnapshot = await getDocs(q);

      let localDocId: string | null = null;
      let stripeId = paymentMethodId;
      
      if (!querySnapshot.empty) {
        localDocId = querySnapshot.docs[0].id;
        stripeId = querySnapshot.docs[0].data().stripePaymentMethodId || paymentMethodId;
      }

      // Also try finding by document ID
      if (!localDocId) {
        const docRef = doc(db, 'paymentMethods', paymentMethodId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          localDocId = paymentMethodId;
          stripeId = docSnap.data().stripePaymentMethodId || paymentMethodId;
        }
      }

      // Call Cloud Function to detach from Stripe
      await callFunction<{ success: boolean }>('detachPaymentMethod', {
        paymentMethodId: stripeId,
      });

      // Delete local record
      if (localDocId) {
        await deleteDoc(doc(db, 'paymentMethods', localDocId));
      }
      
      return { success: true };
    } catch (error: any) {
      console.error('Error removing payment method:', error);
      return { success: false, error: error.message || 'Failed to remove payment method' };
    }
  }

  /**
   * Set a payment method as the default
   */
  async setDefaultPaymentMethod(
    userId: string, 
    paymentMethodId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Find the Stripe payment method ID if we have a local doc ID
      let stripePaymentMethodId = paymentMethodId;
      const docRef = doc(db, 'paymentMethods', paymentMethodId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        stripePaymentMethodId = data.stripePaymentMethodId || paymentMethodId;
      }

      // Call Cloud Function to set default in Stripe
      await callFunction<{ success: boolean }>('setDefaultPaymentMethod', {
        paymentMethodId: stripePaymentMethodId,
      });

      // Update all payment methods for this user
      const methods = await this.getPaymentMethods(userId);
      
      for (const method of methods) {
        await updateDoc(doc(db, 'paymentMethods', method.id), {
          isDefault: method.id === paymentMethodId || method.stripePaymentMethodId === stripePaymentMethodId,
        });
      }

      return { success: true };
    } catch (error: any) {
      console.error('Error setting default payment method:', error);
      return { success: false, error: error.message || 'Failed to set default payment method' };
    }
  }

  /**
   * Get all payment methods for a user
   */
  async getPaymentMethods(userId: string): Promise<PaymentMethod[]> {
    try {
      const methodsRef = collection(db, 'paymentMethods');
      const q = query(methodsRef, where('userId', '==', userId));
      const querySnapshot = await getDocs(q);

      const methods: PaymentMethod[] = [];
      querySnapshot.forEach((docSnap) => {
        methods.push({
          id: docSnap.id,
          ...docSnap.data(),
        } as PaymentMethod);
      });

      // Sort so default is first
      methods.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));

      return methods;
    } catch (error) {
      console.error('Error fetching payment methods:', error);
      return [];
    }
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Calculate platform fee (10% default)
   */
  calculatePlatformFee(amount: number, feePercentage: number = 0.1): number {
    return Math.round(amount * feePercentage * 100) / 100;
  }

  /**
   * Calculate owner payout after platform fee
   */
  calculateOwnerPayout(totalAmount: number, feePercentage: number = 0.1): number {
    const platformFee = this.calculatePlatformFee(totalAmount, feePercentage);
    return totalAmount - platformFee;
  }

  /**
   * Format currency for display
   */
  formatCurrency(amount: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  }

  /**
   * Check if a user has any payment methods
   */
  async hasPaymentMethods(userId: string): Promise<boolean> {
    const methods = await this.getPaymentMethods(userId);
    return methods.length > 0;
  }

  /**
   * Get the default payment method for a user
   */
  async getDefaultPaymentMethod(userId: string): Promise<PaymentMethod | null> {
    const methods = await this.getPaymentMethods(userId);
    return methods.find(m => m.isDefault) || methods[0] || null;
  }

  /**
   * Check if amount requires identity verification
   */
  requiresIdentityVerification(amountInCents: number): boolean {
    return amountInCents >= 50000; // $500
  }
}

export default PaymentService.getInstance();
