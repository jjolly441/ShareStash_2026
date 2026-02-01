/**
 * VerifyIdentityScreen - Enhanced Identity Verification for Share Stash
 * 
 * Features:
 * - Friendly, trust-building messaging
 * - Retry limit tracking (3 attempts max)
 * - Abandoned verification detection
 * - Smooth state transitions
 * - Clear progress indicators
 * 
 * Uses Stripe's hosted verification flow (browser-based)
 * Required for rentals $500+
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  RefreshControl,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '../config/firebase';
import PaymentService from '../services/PaymentService';

const { width } = Dimensions.get('window');
const MAX_VERIFICATION_ATTEMPTS = 3;

interface Props {
  navigation: any;
  route?: {
    params?: {
      rentalId?: string;
      returnTo?: string;
      itemName?: string;
      itemPrice?: number;
    };
  };
}

type VerificationState = 
  | 'loading' 
  | 'none' 
  | 'requires_input' 
  | 'processing' 
  | 'verified' 
  | 'canceled' 
  | 'max_attempts_reached'
  | 'error';

interface VerificationData {
  attemptCount: number;
  lastAttemptAt?: Date;
  verificationStartedAt?: Date;
  abandoned?: boolean;
}

const VerifyIdentityScreen: React.FC<Props> = ({ navigation, route }) => {
  const [verificationState, setVerificationState] = useState<VerificationState>('loading');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastErrorReason, setLastErrorReason] = useState<string | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(30));

  const rentalId = route?.params?.rentalId;
  const returnTo = route?.params?.returnTo;
  const itemName = route?.params?.itemName;
  const itemPrice = route?.params?.itemPrice;

  // Animate content on mount
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Get verification attempt data from Firestore
  const getVerificationData = useCallback(async (): Promise<VerificationData> => {
    const auth = getAuth();
    const userId = auth.currentUser?.uid;
    if (!userId) return { attemptCount: 0 };

    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      const data = userDoc.data();
      return {
        attemptCount: data?.identityVerificationAttempts || 0,
        lastAttemptAt: data?.identityVerificationLastAttempt?.toDate(),
        verificationStartedAt: data?.identityVerificationStartedAt?.toDate(),
        abandoned: data?.identityVerificationAbandoned,
      };
    } catch {
      return { attemptCount: 0 };
    }
  }, []);

  // Update verification attempt count
  const updateAttemptCount = useCallback(async (increment: boolean = true) => {
    const auth = getAuth();
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      const currentData = await getVerificationData();
      const newCount = increment ? currentData.attemptCount + 1 : currentData.attemptCount;
      
      await setDoc(doc(db, 'users', userId), {
        identityVerificationAttempts: newCount,
        identityVerificationLastAttempt: serverTimestamp(),
        identityVerificationStartedAt: serverTimestamp(),
        identityVerificationAbandoned: false,
      }, { merge: true });

      setAttemptCount(newCount);
    } catch (err) {
      console.error('Error updating attempt count:', err);
    }
  }, [getVerificationData]);

  // Mark verification as abandoned (started but not completed)
  const markAsAbandoned = useCallback(async () => {
    const auth = getAuth();
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      await setDoc(doc(db, 'users', userId), {
        identityVerificationAbandoned: true,
        identityVerificationAbandonedAt: serverTimestamp(),
      }, { merge: true });
    } catch (err) {
      console.error('Error marking as abandoned:', err);
    }
  }, []);

  // Check verification status
  const checkStatus = useCallback(async () => {
    try {
      setError(null);
      
      // Get attempt count
      const verificationData = await getVerificationData();
      setAttemptCount(verificationData.attemptCount);

      // Check if max attempts reached
      if (verificationData.attemptCount >= MAX_VERIFICATION_ATTEMPTS) {
        const result = await PaymentService.getIdentityVerificationStatus();
        if (result.success && result.status?.verified) {
          setVerificationState('verified');
        } else {
          setVerificationState('max_attempts_reached');
        }
        return;
      }

      const result = await PaymentService.getIdentityVerificationStatus();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to check status');
      }

      const status = result.status!;
      
      if (status.verified) {
        setVerificationState('verified');
      } else if (!status.hasSession) {
        setVerificationState('none');
      } else {
        setVerificationState(status.status as VerificationState);
        if (status.lastError?.reason) {
          setLastErrorReason(status.lastError.reason);
        }
      }
    } catch (err: any) {
      console.error('Error checking verification status:', err);
      setError(err.message);
      setVerificationState('error');
    }
  }, [getVerificationData]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const onRefresh = async () => {
    setRefreshing(true);
    await checkStatus();
    setRefreshing(false);
  };

  // Start verification process
  const handleStartVerification = async () => {
    // Check attempt limit
    if (attemptCount >= MAX_VERIFICATION_ATTEMPTS) {
      setVerificationState('max_attempts_reached');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await PaymentService.createIdentityVerificationSession(rentalId);

      if (!result.success) {
        throw new Error(result.error || 'Failed to create verification session');
      }

      if (result.result?.alreadyVerified) {
        setVerificationState('verified');
        Alert.alert(
          '🎉 Already Verified!', 
          'Great news - your identity has already been verified!'
        );
        return;
      }

      // Update attempt count
      await updateAttemptCount(true);

      // Open Stripe's hosted verification page
      if (result.result?.url) {
        const canOpen = await Linking.canOpenURL(result.result.url);
        if (canOpen) {
          await Linking.openURL(result.result.url);
          
          // Mark as potentially abandoned (will be cleared if completed)
          await markAsAbandoned();
          
          Alert.alert(
            'Verification Started',
            'Complete the quick verification in your browser. When you\'re done, come back here and tap "Check Status" to continue.',
            [{ text: 'Got it!' }]
          );
        } else {
          throw new Error('Cannot open verification URL');
        }
      } else {
        throw new Error('No verification URL returned');
      }

      setVerificationState('processing');
    } catch (err: any) {
      console.error('Error starting verification:', err);
      setError(err.message);
      Alert.alert('Oops!', err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Get friendly status display info
  const getStatusInfo = () => {
    const attemptsRemaining = MAX_VERIFICATION_ATTEMPTS - attemptCount;
    
    const info: Record<VerificationState, { 
      icon: string; 
      color: string; 
      title: string; 
      subtitle: string;
      showAttempts?: boolean;
    }> = {
      loading: {
        icon: 'hourglass-outline',
        color: '#6366f1',
        title: 'One moment...',
        subtitle: 'Checking your verification status',
      },
      none: {
        icon: 'shield-outline',
        color: '#6366f1',
        title: 'Quick Verification Needed',
        subtitle: itemName 
          ? `Verify your identity to rent "${itemName}" and other premium items.`
          : 'Verify once to unlock rentals over $500 and build trust with owners.',
        showAttempts: attemptCount > 0,
      },
      requires_input: {
        icon: 'alert-circle-outline',
        color: '#f59e0b',
        title: 'Almost There!',
        subtitle: lastErrorReason || 'We need a bit more info to complete your verification.',
        showAttempts: true,
      },
      processing: {
        icon: 'time-outline',
        color: '#6366f1',
        title: 'Verification In Progress',
        subtitle: 'Your documents are being reviewed. This usually takes just a minute or two.',
      },
      verified: {
        icon: 'shield-checkmark',
        color: '#22c55e',
        title: 'You\'re Verified! 🎉',
        subtitle: 'You now have access to all items on Share Stash, including premium rentals.',
      },
      canceled: {
        icon: 'close-circle-outline',
        color: '#f59e0b',
        title: 'Verification Paused',
        subtitle: 'No worries! You can pick up where you left off anytime.',
        showAttempts: true,
      },
      max_attempts_reached: {
        icon: 'help-buoy-outline',
        color: '#ef4444',
        title: 'We\'re Here to Help',
        subtitle: 'You\'ve reached the verification attempt limit. Our support team can assist you.',
      },
      error: {
        icon: 'warning-outline',
        color: '#ef4444',
        title: 'Something Went Wrong',
        subtitle: error || 'Please try again or contact support if this continues.',
        showAttempts: true,
      },
    };
    
    return { ...info[verificationState], attemptsRemaining };
  };

  const statusInfo = getStatusInfo();

  // Handle navigation after verification
  const handleContinue = () => {
    if (returnTo) {
      navigation.navigate(returnTo, { rentalId, verified: true });
    } else {
      navigation.goBack();
    }
  };

  // Contact support
  const handleContactSupport = () => {
    // You can customize this to open email, in-app chat, etc.
    Alert.alert(
      'Contact Support',
      'Would you like to email our support team?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Send Email', 
          onPress: () => Linking.openURL('mailto:support@sharestash.app?subject=Identity%20Verification%20Help')
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor="#6366f1"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <Animated.View 
          style={[
            styles.content,
            { 
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }]
            }
          ]}
        >
          {/* Status Icon */}
          <View style={[styles.iconContainer, { backgroundColor: `${statusInfo.color}15` }]}>
            <View style={[styles.iconInner, { backgroundColor: `${statusInfo.color}25` }]}>
              <Ionicons 
                name={statusInfo.icon as any} 
                size={56} 
                color={statusInfo.color} 
              />
            </View>
          </View>

          {/* Status Message */}
          <View style={styles.messageContainer}>
            <Text style={styles.title}>{statusInfo.title}</Text>
            <Text style={styles.subtitle}>{statusInfo.subtitle}</Text>
            
            {/* Attempts remaining indicator */}
            {statusInfo.showAttempts && statusInfo.attemptsRemaining > 0 && (
              <View style={styles.attemptsContainer}>
                <Ionicons name="refresh-outline" size={14} color="#64748b" />
                <Text style={styles.attemptsText}>
                  {statusInfo.attemptsRemaining} {statusInfo.attemptsRemaining === 1 ? 'attempt' : 'attempts'} remaining
                </Text>
              </View>
            )}
          </View>

          {/* Item context (if coming from a specific rental) */}
          {itemName && itemPrice && verificationState === 'none' && (
            <View style={styles.itemContext}>
              <View style={styles.itemContextIcon}>
                <Ionicons name="pricetag-outline" size={20} color="#6366f1" />
              </View>
              <View style={styles.itemContextText}>
                <Text style={styles.itemContextTitle}>{itemName}</Text>
                <Text style={styles.itemContextPrice}>
                  ${itemPrice.toFixed(2)} rental
                </Text>
              </View>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionsContainer}>
            {verificationState === 'loading' && (
              <ActivityIndicator size="large" color="#6366f1" />
            )}

            {(verificationState === 'none' || 
              verificationState === 'requires_input' || 
              verificationState === 'canceled' ||
              verificationState === 'error') && (
              <>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleStartVerification}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="shield-checkmark-outline" size={22} color="#fff" />
                      <Text style={styles.primaryButtonText}>
                        {verificationState === 'none' ? 'Verify My Identity' : 'Try Again'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => navigation.goBack()}
                  activeOpacity={0.7}
                >
                  <Text style={styles.secondaryButtonText}>Maybe Later</Text>
                </TouchableOpacity>
              </>
            )}

            {verificationState === 'processing' && (
              <>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={onRefresh}
                  disabled={refreshing}
                  activeOpacity={0.8}
                >
                  {refreshing ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="refresh-outline" size={22} color="#fff" />
                      <Text style={styles.primaryButtonText}>Check Status</Text>
                    </>
                  )}
                </TouchableOpacity>

                <Text style={styles.processingHint}>
                  Finished in browser? Tap above to check your status.
                </Text>
              </>
            )}

            {verificationState === 'verified' && (
              <TouchableOpacity
                style={[styles.primaryButton, styles.successButton]}
                onPress={handleContinue}
                activeOpacity={0.8}
              >
                <Ionicons 
                  name={returnTo ? "arrow-forward-outline" : "checkmark-outline"} 
                  size={22} 
                  color="#fff" 
                />
                <Text style={styles.primaryButtonText}>
                  {returnTo ? 'Continue to Checkout' : 'Done'}
                </Text>
              </TouchableOpacity>
            )}

            {verificationState === 'max_attempts_reached' && (
              <>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleContactSupport}
                  activeOpacity={0.8}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={22} color="#fff" />
                  <Text style={styles.primaryButtonText}>Contact Support</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => navigation.goBack()}
                  activeOpacity={0.7}
                >
                  <Text style={styles.secondaryButtonText}>Go Back</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Refresh button for non-loading states */}
            {verificationState !== 'loading' && 
             verificationState !== 'processing' && 
             verificationState !== 'verified' &&
             verificationState !== 'max_attempts_reached' && (
              <TouchableOpacity
                style={styles.refreshButton}
                onPress={onRefresh}
                disabled={refreshing}
                activeOpacity={0.7}
              >
                <Ionicons name="refresh-outline" size={18} color="#6366f1" />
                <Text style={styles.refreshButtonText}>Refresh Status</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Trust & Safety Info */}
          {verificationState !== 'verified' && verificationState !== 'max_attempts_reached' && (
            <View style={styles.infoSection}>
              <Text style={styles.infoTitle}>Why verify?</Text>
              
              <View style={styles.infoItem}>
                <View style={[styles.infoIcon, { backgroundColor: '#dbeafe' }]}>
                  <Ionicons name="people-outline" size={20} color="#3b82f6" />
                </View>
                <View style={styles.infoTextContainer}>
                  <Text style={styles.infoItemTitle}>Build trust</Text>
                  <Text style={styles.infoItemText}>
                    Verified members are more likely to get their rental requests accepted
                  </Text>
                </View>
              </View>

              <View style={styles.infoItem}>
                <View style={[styles.infoIcon, { backgroundColor: '#dcfce7' }]}>
                  <Ionicons name="lock-closed-outline" size={20} color="#22c55e" />
                </View>
                <View style={styles.infoTextContainer}>
                  <Text style={styles.infoItemTitle}>Your data is safe</Text>
                  <Text style={styles.infoItemText}>
                    Powered by Stripe — the same security used by Amazon and Google
                  </Text>
                </View>
              </View>

              <View style={styles.infoItem}>
                <View style={[styles.infoIcon, { backgroundColor: '#fef3c7' }]}>
                  <Ionicons name="flash-outline" size={20} color="#f59e0b" />
                </View>
                <View style={styles.infoTextContainer}>
                  <Text style={styles.infoItemTitle}>Quick & easy</Text>
                  <Text style={styles.infoItemText}>
                    Just snap a photo of your ID — takes about 2 minutes
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Accepted Documents */}
          {(verificationState === 'none' || verificationState === 'requires_input') && (
            <View style={styles.documentsSection}>
              <Text style={styles.documentsTitle}>Accepted IDs</Text>
              <View style={styles.documentsList}>
                <View style={styles.documentChip}>
                  <Ionicons name="car-outline" size={16} color="#64748b" />
                  <Text style={styles.documentChipText}>Driver's License</Text>
                </View>
                <View style={styles.documentChip}>
                  <Ionicons name="airplane-outline" size={16} color="#64748b" />
                  <Text style={styles.documentChipText}>Passport</Text>
                </View>
                <View style={styles.documentChip}>
                  <Ionicons name="card-outline" size={16} color="#64748b" />
                  <Text style={styles.documentChipText}>State ID</Text>
                </View>
              </View>
            </View>
          )}

          {/* Success celebration for verified state */}
          {verificationState === 'verified' && (
            <View style={styles.successSection}>
              <View style={styles.successBadge}>
                <Ionicons name="shield-checkmark" size={24} color="#22c55e" />
                <Text style={styles.successBadgeText}>Verified Member</Text>
              </View>
              <Text style={styles.successDescription}>
                This badge will appear on your profile, helping you build trust with the Share Stash community.
              </Text>
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  content: {
    flex: 1,
    alignItems: 'center',
  },
  iconContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 24,
  },
  iconInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageContainer: {
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 24,
  },
  attemptsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
  },
  attemptsText: {
    fontSize: 13,
    color: '#64748b',
    marginLeft: 6,
  },
  itemContext: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  itemContextIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  itemContextText: {
    flex: 1,
  },
  itemContextTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 2,
  },
  itemContextPrice: {
    fontSize: 14,
    color: '#64748b',
  },
  actionsContainer: {
    width: '100%',
    marginBottom: 32,
    alignItems: 'center',
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
  successButton: {
    backgroundColor: '#22c55e',
    shadowColor: '#22c55e',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    marginLeft: 10,
  },
  secondaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  secondaryButtonText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '500',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  refreshButtonText: {
    color: '#6366f1',
    fontSize: 15,
    fontWeight: '500',
    marginLeft: 6,
  },
  processingHint: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 8,
  },
  infoSection: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 2,
  },
  infoItemText: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
  },
  documentsSection: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  documentsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 12,
  },
  documentsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  documentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
  },
  documentChipText: {
    fontSize: 14,
    color: '#475569',
    marginLeft: 6,
  },
  successSection: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 20,
  },
  successBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginBottom: 16,
  },
  successBadgeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#16a34a',
    marginLeft: 8,
  },
  successDescription: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
});

export default VerifyIdentityScreen;


