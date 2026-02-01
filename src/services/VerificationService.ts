// src/services/VerificationService.ts
// KYC/User Verification Service - Phone and Identity Verification
// UPDATED: Uses HTTP calls for v2 Cloud Functions (onRequest)
import {
  PhoneAuthProvider,
  linkWithCredential,
  updatePhoneNumber,
} from 'firebase/auth';
import {
  doc,
  updateDoc,
  getDoc,
  Timestamp,
  increment,
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';

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
// TYPES & INTERFACES
// ============================================================================

export interface VerificationStatus {
  phoneVerified: boolean;
  identityVerified: boolean;
  verificationStatus: 'unverified' | 'phone_verified' | 'fully_verified' | 'rejected';
  phoneNumber?: string;
  identityVerificationDate?: string;
  idDocumentType?: 'drivers_license' | 'passport' | 'national_id';
  verificationAttempts: number;
}

export interface PhoneVerificationResult {
  success: boolean;
  verificationId?: string;
  error?: string;
}

export interface OTPVerificationResult {
  success: boolean;
  error?: string;
}

export interface IdentityVerificationSession {
  success: boolean;
  sessionId?: string;
  sessionUrl?: string;
  clientSecret?: string;
  error?: string;
  alreadyVerified?: boolean;
}

export interface IdentityVerificationStatus {
  hasSession: boolean;
  sessionId?: string;
  status: 'none' | 'requires_input' | 'processing' | 'verified' | 'canceled';
  verified: boolean;
  lastError?: { reason?: string };
}

// ============================================================================
// VERIFICATION SERVICE CLASS
// ============================================================================

class VerificationServiceClass {
  private verificationId: string | null = null;

  // ==========================================================================
  // PHONE VERIFICATION (Firebase Phone Auth)
  // ==========================================================================

  /**
   * Send OTP to phone number for verification
   * Uses Firebase Phone Auth with reCAPTCHA verification
   * 
   * @param phoneNumber - Phone number in E.164 format (e.g., +1234567890)
   * @param recaptchaVerifier - reCAPTCHA verifier instance from the component
   * @returns Promise with verification ID or error
   */
  async sendPhoneVerificationCode(
    phoneNumber: string,
    recaptchaVerifier: any
  ): Promise<PhoneVerificationResult> {
    try {
      // Validate phone number format
      if (!this.isValidPhoneNumber(phoneNumber)) {
        return {
          success: false,
          error: 'Please enter a valid phone number with country code (e.g., +1234567890)',
        };
      }

      // Create phone auth provider
      const phoneProvider = new PhoneAuthProvider(auth);

      // Send verification code
      const verificationId = await phoneProvider.verifyPhoneNumber(
        phoneNumber,
        recaptchaVerifier
      );

      // Store verification ID for later use
      this.verificationId = verificationId;

      return {
        success: true,
        verificationId,
      };
    } catch (error: any) {
      console.error('Phone verification error:', error);

      let errorMessage = 'Failed to send verification code';

      // Map Firebase error codes to user-friendly messages
      if (error.code === 'auth/invalid-phone-number') {
        errorMessage = 'Invalid phone number format. Please include country code.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many attempts. Please try again later.';
      } else if (error.code === 'auth/quota-exceeded') {
        errorMessage = 'SMS quota exceeded. Please try again tomorrow.';
      } else if (error.code === 'auth/captcha-check-failed') {
        errorMessage = 'reCAPTCHA verification failed. Please try again.';
      } else if (error.code === 'auth/missing-phone-number') {
        errorMessage = 'Please enter a phone number.';
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Verify the OTP code entered by user
   * Links phone number to existing account
   * 
   * @param userId - Current user's ID
   * @param verificationCode - 6-digit OTP code
   * @param verificationId - Optional verification ID (uses stored one if not provided)
   * @returns Promise with success status or error
   */
  async verifyPhoneCode(
    userId: string,
    verificationCode: string,
    verificationId?: string
  ): Promise<OTPVerificationResult> {
    try {
      const verId = verificationId || this.verificationId;

      if (!verId) {
        return {
          success: false,
          error: 'Verification session expired. Please request a new code.',
        };
      }

      // Validate OTP format
      if (!verificationCode || verificationCode.length !== 6) {
        return {
          success: false,
          error: 'Please enter the 6-digit verification code.',
        };
      }

      // Create credential from verification ID and code
      const credential = PhoneAuthProvider.credential(verId, verificationCode);

      // Get current user
      const currentUser = auth.currentUser;

      if (!currentUser) {
        return {
          success: false,
          error: 'User not authenticated. Please log in again.',
        };
      }

      // Link phone credential to existing account
      try {
        await linkWithCredential(currentUser, credential);
      } catch (linkError: any) {
        // If already linked, try updating instead
        if (linkError.code === 'auth/provider-already-linked') {
          await updatePhoneNumber(currentUser, credential);
        } else if (linkError.code === 'auth/credential-already-in-use') {
          return {
            success: false,
            error: 'This phone number is already linked to another account.',
          };
        } else {
          throw linkError;
        }
      }

      // Update Firestore user document with verification status
      const phoneNumber = currentUser.phoneNumber || '';
      await this.updateUserVerificationStatus(userId, {
        phoneNumber,
        phoneVerified: true,
        verificationStatus: 'phone_verified',
      });

      // Clear stored verification ID
      this.verificationId = null;

      return { success: true };
    } catch (error: any) {
      console.error('OTP verification error:', error);

      let errorMessage = 'Verification failed';

      if (error.code === 'auth/invalid-verification-code') {
        errorMessage = 'Invalid verification code. Please check and try again.';
      } else if (error.code === 'auth/code-expired') {
        errorMessage = 'Verification code has expired. Please request a new one.';
      } else if (error.code === 'auth/session-expired') {
        errorMessage = 'Verification session expired. Please request a new code.';
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Resend OTP code to the same phone number
   */
  async resendVerificationCode(
    phoneNumber: string,
    recaptchaVerifier: any
  ): Promise<PhoneVerificationResult> {
    return this.sendPhoneVerificationCode(phoneNumber, recaptchaVerifier);
  }

  // ==========================================================================
  // IDENTITY VERIFICATION (Stripe Identity - Web-based)
  // ==========================================================================

  /**
   * Create a Stripe Identity verification session
   * Uses web-based verification (no native SDK needed)
   * 
   * @param userId - Current user's ID
   * @param rentalId - Optional rental ID if verification is for a specific rental
   * @returns Promise with session URL or error
   */
  async createIdentityVerificationSession(
    userId: string,
    rentalId?: string
  ): Promise<IdentityVerificationSession> {
    try {
      // Increment verification attempts
      await this.incrementVerificationAttempts(userId);

      // Call Cloud Function to create Stripe Identity session
      const result = await callFunction<{
        sessionId: string;
        clientSecret: string;
        url: string;
        status: string;
        alreadyVerified?: boolean;
        message?: string;
      }>('createIdentityVerificationSession', { rentalId });

      if (result.alreadyVerified) {
        return {
          success: true,
          alreadyVerified: true,
        };
      }

      return {
        success: true,
        sessionId: result.sessionId,
        sessionUrl: result.url,
        clientSecret: result.clientSecret,
      };
    } catch (error: any) {
      console.error('Identity verification session error:', error);

      return {
        success: false,
        error: error.message || 'Failed to start identity verification. Please try again.',
      };
    }
  }

  /**
   * Check the status of an identity verification session
   * Called after user returns from Stripe Identity flow
   * 
   * @param userId - Current user's ID
   * @param sessionId - Optional Stripe Identity session ID
   * @returns Promise with verification status
   */
  async checkIdentityVerificationStatus(
    userId: string,
    sessionId?: string
  ): Promise<IdentityVerificationStatus> {
    try {
      // Call Cloud Function to check session status
      const result = await callFunction<IdentityVerificationStatus>(
        'getIdentityVerificationStatus',
        { sessionId }
      );

      return result;
    } catch (error: any) {
      console.error('Identity status check error:', error);

      return {
        hasSession: false,
        status: 'none',
        verified: false,
        lastError: { reason: 'Failed to check verification status' },
      };
    }
  }

  /**
   * Check if user's identity is verified
   */
  async isIdentityVerified(userId: string): Promise<boolean> {
    try {
      const status = await this.checkIdentityVerificationStatus(userId);
      return status.verified;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // USER VERIFICATION STATUS MANAGEMENT
  // ==========================================================================

  /**
   * Get user's current verification status from Firestore
   */
  async getUserVerificationStatus(userId: string): Promise<VerificationStatus> {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        throw new Error('User not found');
      }

      const userData = userSnap.data();

      return {
        phoneVerified: userData.phoneVerified || false,
        identityVerified: userData.identityVerified || false,
        verificationStatus: userData.verificationStatus || 'unverified',
        phoneNumber: userData.phoneNumber,
        identityVerificationDate: userData.identityVerificationDate,
        idDocumentType: userData.idDocumentType,
        verificationAttempts: userData.verificationAttempts || 0,
      };
    } catch (error) {
      console.error('Error fetching verification status:', error);
      throw error;
    }
  }

  /**
   * Update user's verification status in Firestore
   */
  async updateUserVerificationStatus(
    userId: string,
    updates: Partial<VerificationStatus>
  ): Promise<void> {
    try {
      const userRef = doc(db, 'users', userId);
      
      await updateDoc(userRef, {
        ...updates,
        updatedAt: Timestamp.now(),
      });
    } catch (error) {
      console.error('Error updating verification status:', error);
      throw error;
    }
  }

  /**
   * Increment verification attempts counter
   */
  private async incrementVerificationAttempts(userId: string): Promise<void> {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        verificationAttempts: increment(1),
      });
    } catch (error) {
      console.error('Error incrementing verification attempts:', error);
      // Don't throw - this is not critical
    }
  }

  // ==========================================================================
  // VERIFICATION GATES (Business Logic)
  // ==========================================================================

  /**
   * Check if user can rent items (requires phone verification)
   */
  canRentItems(verificationStatus: VerificationStatus): boolean {
    return verificationStatus.phoneVerified;
  }

  /**
   * Check if user can list items (requires identity verification)
   */
  canListItems(verificationStatus: VerificationStatus): boolean {
    return verificationStatus.identityVerified;
  }

  /**
   * Check if user can rent high-value items ($500+)
   */
  canRentHighValueItems(verificationStatus: VerificationStatus): boolean {
    return verificationStatus.identityVerified;
  }

  /**
   * Get required verification level for an action
   */
  getRequiredVerificationLevel(
    action: 'rent' | 'list' | 'rent_high_value'
  ): 'phone' | 'identity' {
    switch (action) {
      case 'rent':
        return 'phone';
      case 'list':
        return 'identity';
      case 'rent_high_value':
        return 'identity';
      default:
        return 'phone';
    }
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Validate phone number format (E.164)
   */
  private isValidPhoneNumber(phoneNumber: string): boolean {
    const e164Regex = /^\+[1-9]\d{9,14}$/;
    return e164Regex.test(phoneNumber);
  }

  /**
   * Format phone number for display
   */
  formatPhoneNumber(phoneNumber: string): string {
    if (!phoneNumber) return '';

    const cleaned = phoneNumber.replace(/[^\d+]/g, '');

    // US phone number formatting
    if (cleaned.startsWith('+1') && cleaned.length === 12) {
      const match = cleaned.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
      if (match) {
        return `+1 (${match[1]}) ${match[2]}-${match[3]}`;
      }
    }

    return phoneNumber;
  }

  /**
   * Get human-readable verification status
   */
  getVerificationStatusText(status: VerificationStatus): string {
    if (status.verificationStatus === 'fully_verified') {
      return 'Fully Verified';
    } else if (status.verificationStatus === 'phone_verified') {
      return 'Phone Verified';
    } else if (status.verificationStatus === 'rejected') {
      return 'Verification Failed';
    }
    return 'Not Verified';
  }

  /**
   * Get verification badge color
   */
  getVerificationBadgeColor(status: VerificationStatus): string {
    if (status.verificationStatus === 'fully_verified') {
      return '#4CAF50'; // Green
    } else if (status.verificationStatus === 'phone_verified') {
      return '#2196F3'; // Blue
    } else if (status.verificationStatus === 'rejected') {
      return '#F44336'; // Red
    }
    return '#9E9E9E'; // Gray
  }
}

// Export singleton instance
export const VerificationService = new VerificationServiceClass();
