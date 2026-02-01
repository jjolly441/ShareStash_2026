/**
 * useVerification - Custom hook for identity verification logic
 * 
 * Handles:
 * - Verification status checking
 * - Abandoned verification detection and reminders
 * - Retry attempt tracking
 * - Navigation to verification screen
 * 
 * Usage:
 * const { isVerified, needsReminder, showReminderPrompt, navigateToVerify } = useVerification();
 */

import { useState, useEffect, useCallback } from 'react';
import { Alert, Linking } from 'react-native';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { db } from '../config/firebase';
import { useNavigation } from '@react-navigation/native';

const MAX_VERIFICATION_ATTEMPTS = 3;
const REMINDER_COOLDOWN_HOURS = 24; // Don't show reminder more than once per day

interface VerificationState {
  isVerified: boolean;
  isLoading: boolean;
  attemptCount: number;
  maxAttemptsReached: boolean;
  needsReminder: boolean;
  abandonedAt: Date | null;
  status: 'none' | 'processing' | 'verified' | 'requires_input' | 'canceled' | 'error';
}

interface UseVerificationReturn extends VerificationState {
  /** Refresh verification status from server */
  refresh: () => Promise<void>;
  /** Navigate to verification screen */
  navigateToVerify: (params?: NavigateParams) => void;
  /** Show reminder prompt if verification was abandoned */
  showReminderPrompt: () => void;
  /** Dismiss reminder (with cooldown) */
  dismissReminder: () => Promise<void>;
  /** Check if price requires verification */
  requiresVerificationForPrice: (priceInDollars: number) => boolean;
  /** Contact support (for max attempts reached) */
  contactSupport: () => void;
}

interface NavigateParams {
  returnTo?: string;
  rentalId?: string;
  itemName?: string;
  itemPrice?: number;
}

const VERIFICATION_THRESHOLD = 500; // $500

export const useVerification = (): UseVerificationReturn => {
  const [state, setState] = useState<VerificationState>({
    isVerified: false,
    isLoading: true,
    attemptCount: 0,
    maxAttemptsReached: false,
    needsReminder: false,
    abandonedAt: null,
    status: 'none',
  });

  const navigation = useNavigation<any>();

  // Check verification status
  const checkStatus = useCallback(async () => {
    const auth = getAuth();
    const userId = auth.currentUser?.uid;

    if (!userId) {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }

    try {
      // Get user data from Firestore (this is the primary source of truth)
      const userDoc = await getDoc(doc(db, 'users', userId));
      const userData = userDoc.data();

      // Get verification data directly from Firestore
      // We don't need to call the Cloud Function here - Firestore has the latest status
      const isVerified = userData?.identityVerified || false;
      const attemptCount = userData?.identityVerificationAttempts || 0;
      const maxAttemptsReached = attemptCount >= MAX_VERIFICATION_ATTEMPTS && !isVerified;
      const currentStatus = userData?.identityVerificationStatus || 'none';

      // Check if reminder should be shown
      let needsReminder = false;
      let abandonedAt: Date | null = null;

      if (!isVerified && userData?.identityVerificationAbandoned) {
        abandonedAt = userData.identityVerificationAbandonedAt?.toDate() || null;
        
        // Check if we should show reminder (not shown in last 24 hours)
        const lastReminderShown = userData.verificationReminderLastShown?.toDate();
        const hoursSinceReminder = lastReminderShown 
          ? (Date.now() - lastReminderShown.getTime()) / (1000 * 60 * 60)
          : 999;

        needsReminder = hoursSinceReminder > REMINDER_COOLDOWN_HOURS;
      }

      // Determine current status
      let status: VerificationState['status'] = 'none';
      if (isVerified) {
        status = 'verified';
      } else if (currentStatus) {
        status = currentStatus as VerificationState['status'];
      }

      setState({
        isVerified,
        isLoading: false,
        attemptCount,
        maxAttemptsReached,
        needsReminder,
        abandonedAt,
        status,
      });
    } catch (error) {
      console.error('Error checking verification status:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  // Listen for auth state changes
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        checkStatus();
      } else {
        setState({
          isVerified: false,
          isLoading: false,
          attemptCount: 0,
          maxAttemptsReached: false,
          needsReminder: false,
          abandonedAt: null,
          status: 'none',
        });
      }
    });

    return unsubscribe;
  }, [checkStatus]);

  // Navigate to verification screen
  const navigateToVerify = useCallback((params: NavigateParams = {}) => {
    navigation.navigate('VerifyIdentity', params);
  }, [navigation]);

  // Show reminder prompt for abandoned verification
  const showReminderPrompt = useCallback(() => {
    if (!state.needsReminder) return;

    Alert.alert(
      'Complete Your Verification',
      'You started verifying your identity but didn\'t finish. Complete verification to unlock premium rentals and build trust with owners.',
      [
        {
          text: 'Maybe Later',
          style: 'cancel',
          onPress: () => dismissReminder(),
        },
        {
          text: 'Continue',
          onPress: () => navigateToVerify(),
        },
      ]
    );
  }, [state.needsReminder, navigateToVerify]);

  // Dismiss reminder with cooldown
  const dismissReminder = useCallback(async () => {
    const auth = getAuth();
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      await setDoc(doc(db, 'users', userId), {
        verificationReminderLastShown: serverTimestamp(),
      }, { merge: true });

      setState(prev => ({ ...prev, needsReminder: false }));
    } catch (error) {
      console.error('Error dismissing reminder:', error);
    }
  }, []);

  // Check if a price requires verification
  const requiresVerificationForPrice = useCallback((priceInDollars: number): boolean => {
    return priceInDollars >= VERIFICATION_THRESHOLD;
  }, []);

  // Contact support
  const contactSupport = useCallback(() => {
    Alert.alert(
      'Contact Support',
      'Would you like to email our support team for help with verification?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Email',
          onPress: () => {
            const subject = encodeURIComponent('Identity Verification Help');
            const body = encodeURIComponent(
              'Hi Share Stash Support,\n\n' +
              'I need help with identity verification. I\'ve reached the maximum number of attempts.\n\n' +
              'Please assist me with completing my verification.\n\n' +
              'Thank you!'
            );
            Linking.openURL(`mailto:support@sharestash.app?subject=${subject}&body=${body}`);
          },
        },
      ]
    );
  }, []);

  return {
    ...state,
    refresh: checkStatus,
    navigateToVerify,
    showReminderPrompt,
    dismissReminder,
    requiresVerificationForPrice,
    contactSupport,
  };
};

/**
 * Hook specifically for app launch verification reminders
 * Use this in your App.tsx or main navigation component
 */
export const useVerificationReminder = () => {
  const { needsReminder, showReminderPrompt, isLoading } = useVerification();
  const [hasShownReminder, setHasShownReminder] = useState(false);

  useEffect(() => {
    // Show reminder once when app loads (if needed)
    if (!isLoading && needsReminder && !hasShownReminder) {
      // Small delay to let the app settle
      const timer = setTimeout(() => {
        showReminderPrompt();
        setHasShownReminder(true);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [isLoading, needsReminder, hasShownReminder, showReminderPrompt]);

  return { needsReminder, hasShownReminder };
};

/**
 * Simple verification check function (non-hook)
 * Use when you just need a one-time check
 */
export const checkVerificationStatus = async (): Promise<{
  isVerified: boolean;
  attemptCount: number;
  maxAttemptsReached: boolean;
}> => {
  const auth = getAuth();
  const userId = auth.currentUser?.uid;

  if (!userId) {
    return { isVerified: false, attemptCount: 0, maxAttemptsReached: false };
  }

  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    const userData = userDoc.data();

    const isVerified = userData?.identityVerified || false;
    const attemptCount = userData?.identityVerificationAttempts || 0;
    const maxAttemptsReached = attemptCount >= MAX_VERIFICATION_ATTEMPTS && !isVerified;

    return { isVerified, attemptCount, maxAttemptsReached };
  } catch (error) {
    console.error('Error checking verification:', error);
    return { isVerified: false, attemptCount: 0, maxAttemptsReached: false };
  }
};

export default useVerification;