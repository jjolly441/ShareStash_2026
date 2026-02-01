/**
 * VerificationGate - Blocks actions that require identity verification
 * 
 * Use this component to wrap any UI that requires verification.
 * Shows a friendly prompt instead of the children when verification is needed.
 * 
 * Use cases:
 * - Listing items priced $500+
 * - Renting items priced $500+
 * - Any premium features requiring trust
 * 
 * Features:
 * - Configurable threshold
 * - Multiple display modes (modal, inline, redirect)
 * - Loading state handling
 * - Callback on verification complete
 */

import React, { useState, useEffect, ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '../config/firebase';
import { useNavigation } from '@react-navigation/native';

interface Props {
  children: ReactNode;
  /** Price in dollars that triggers verification requirement */
  priceThreshold?: number;
  /** Current item price in dollars */
  itemPrice?: number;
  /** Force verification regardless of price */
  requireVerification?: boolean;
  /** Display mode: 'modal' shows popup, 'inline' replaces content, 'redirect' navigates */
  mode?: 'modal' | 'inline' | 'redirect';
  /** Context for the verification prompt */
  context?: 'listing' | 'rental' | 'generic';
  /** Item name for contextual messaging */
  itemName?: string;
  /** Callback when user completes verification */
  onVerified?: () => void;
  /** Callback when user dismisses the prompt */
  onDismiss?: () => void;
  /** Navigation params to pass to verification screen */
  navigationParams?: Record<string, any>;
}

const VERIFICATION_THRESHOLD = 500; // $500 default

const VerificationGate: React.FC<Props> = ({
  children,
  priceThreshold = VERIFICATION_THRESHOLD,
  itemPrice,
  requireVerification = false,
  mode = 'modal',
  context = 'generic',
  itemName,
  onVerified,
  onDismiss,
  navigationParams = {},
}) => {
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const navigation = useNavigation<any>();
  const fadeAnim = useState(new Animated.Value(0))[0];

  // Check if verification is required based on price
  const needsVerification = requireVerification || 
    (itemPrice !== undefined && itemPrice >= priceThreshold);

  useEffect(() => {
    checkVerificationStatus();
  }, []);

  useEffect(() => {
    if (!isLoading && showModal) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [showModal, isLoading]);

  const checkVerificationStatus = async () => {
    const auth = getAuth();
    const userId = auth.currentUser?.uid;

    if (!userId) {
      setIsVerified(false);
      setIsLoading(false);
      return;
    }

    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      const userData = userDoc.data();
      setIsVerified(userData?.identityVerified || false);
    } catch (error) {
      console.error('Error checking verification:', error);
      setIsVerified(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGatedAction = () => {
    if (isVerified || !needsVerification) {
      // User is verified or doesn't need verification
      return true;
    }

    // Show verification prompt based on mode
    if (mode === 'redirect') {
      navigation.navigate('VerifyIdentity', {
        itemName,
        itemPrice,
        ...navigationParams,
      });
    } else {
      setShowModal(true);
    }
    
    return false;
  };

  const handleVerifyNow = () => {
    setShowModal(false);
    navigation.navigate('VerifyIdentity', {
      itemName,
      itemPrice,
      returnTo: navigationParams.returnTo,
      ...navigationParams,
    });
  };

  const handleDismiss = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setShowModal(false);
      onDismiss?.();
    });
  };

  // Get context-specific messaging
  const getContextMessage = () => {
    const priceText = itemPrice ? `$${itemPrice.toFixed(0)}` : 'premium';
    
    switch (context) {
      case 'listing':
        return {
          title: 'Verify to List Premium Items',
          subtitle: `Items priced at $${priceThreshold}+ require identity verification. This helps protect both you and renters.`,
          buttonText: 'Verify & Continue',
        };
      case 'rental':
        return {
          title: 'Quick Verification Needed',
          subtitle: itemName 
            ? `To rent "${itemName}" (${priceText}), we need to verify your identity. This protects you and the owner.`
            : `Rentals of $${priceThreshold}+ require identity verification to protect everyone involved.`,
          buttonText: 'Verify Now',
        };
      default:
        return {
          title: 'Identity Verification Required',
          subtitle: `This action requires identity verification for amounts of $${priceThreshold} or more.`,
          buttonText: 'Get Verified',
        };
    }
  };

  const contextMessage = getContextMessage();

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#6366f1" />
      </View>
    );
  }

  // If verified or verification not needed, render children normally
  if (isVerified || !needsVerification) {
    return <>{children}</>;
  }

  // Inline mode - replace children with verification prompt
  if (mode === 'inline') {
    return (
      <View style={styles.inlineContainer}>
        <View style={styles.inlineIconContainer}>
          <Ionicons name="shield-checkmark-outline" size={32} color="#6366f1" />
        </View>
        <Text style={styles.inlineTitle}>{contextMessage.title}</Text>
        <Text style={styles.inlineSubtitle}>{contextMessage.subtitle}</Text>
        <TouchableOpacity
          style={styles.inlineButton}
          onPress={handleVerifyNow}
          activeOpacity={0.8}
        >
          <Ionicons name="shield-checkmark-outline" size={18} color="#fff" />
          <Text style={styles.inlineButtonText}>{contextMessage.buttonText}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Modal or redirect mode - wrap children with gated touch handler
  return (
    <>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => {
          if (!handleGatedAction()) {
            // Action was gated, do nothing - modal will show
          }
        }}
      >
        <View pointerEvents="none">
          {children}
        </View>
      </TouchableOpacity>

      {/* Verification Modal */}
      <Modal
        visible={showModal}
        transparent
        animationType="none"
        onRequestClose={handleDismiss}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={handleDismiss}
        >
          <Animated.View 
            style={[
              styles.modalContainer,
              { opacity: fadeAnim, transform: [{ scale: fadeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.9, 1],
              }) }] }
            ]}
          >
            <Pressable style={styles.modalContent} onPress={() => {}}>
              {/* Close button */}
              <TouchableOpacity
                style={styles.closeButton}
                onPress={handleDismiss}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color="#94a3b8" />
              </TouchableOpacity>

              {/* Icon */}
              <View style={styles.modalIconContainer}>
                <Ionicons name="shield-checkmark-outline" size={40} color="#6366f1" />
              </View>

              {/* Content */}
              <Text style={styles.modalTitle}>{contextMessage.title}</Text>
              <Text style={styles.modalSubtitle}>{contextMessage.subtitle}</Text>

              {/* Benefits list */}
              <View style={styles.benefitsList}>
                <View style={styles.benefitItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
                  <Text style={styles.benefitText}>Takes only 2 minutes</Text>
                </View>
                <View style={styles.benefitItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
                  <Text style={styles.benefitText}>Your data is encrypted</Text>
                </View>
                <View style={styles.benefitItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
                  <Text style={styles.benefitText}>One-time verification</Text>
                </View>
              </View>

              {/* Action buttons */}
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleVerifyNow}
                activeOpacity={0.8}
              >
                <Ionicons name="shield-checkmark-outline" size={20} color="#fff" />
                <Text style={styles.primaryButtonText}>{contextMessage.buttonText}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleDismiss}
                activeOpacity={0.7}
              >
                <Text style={styles.secondaryButtonText}>Maybe Later</Text>
              </TouchableOpacity>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
};

/**
 * Hook for checking verification status
 * Use this when you need programmatic verification checks
 */
export const useVerificationStatus = () => {
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      const auth = getAuth();
      const userId = auth.currentUser?.uid;

      if (!userId) {
        setIsVerified(false);
        setIsLoading(false);
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        setIsVerified(userDoc.data()?.identityVerified || false);
      } catch {
        setIsVerified(false);
      } finally {
        setIsLoading(false);
      }
    };

    check();
  }, []);

  const refresh = async () => {
    setIsLoading(true);
    const auth = getAuth();
    const userId = auth.currentUser?.uid;

    if (!userId) {
      setIsVerified(false);
      setIsLoading(false);
      return;
    }

    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      setIsVerified(userDoc.data()?.identityVerified || false);
    } catch {
      setIsVerified(false);
    } finally {
      setIsLoading(false);
    }
  };

  return { isVerified, isLoading, refresh };
};

/**
 * Simple function to check if verification is required for a price
 */
export const requiresVerification = (priceInDollars: number, threshold = VERIFICATION_THRESHOLD): boolean => {
  return priceInDollars >= threshold;
};

const styles = StyleSheet.create({
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  // Inline mode styles
  inlineContainer: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
  },
  inlineIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  inlineTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
    textAlign: 'center',
  },
  inlineSubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  inlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  inlineButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 360,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 25,
    elevation: 15,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 4,
  },
  modalIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  benefitsList: {
    width: '100%',
    marginBottom: 24,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  benefitText: {
    fontSize: 14,
    color: '#475569',
    marginLeft: 10,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    width: '100%',
    marginBottom: 12,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 10,
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  secondaryButtonText: {
    fontSize: 15,
    color: '#64748b',
    fontWeight: '500',
  },
});

export default VerificationGate;
