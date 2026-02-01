// src/screens/StripeConnectScreen.tsx
// Stripe Connect onboarding screen for sellers
// UPDATED: Uses HTTP calls for v2 Cloud Functions (onRequest)

import React, { useState, useEffect, useCallback } from 'react';
import { ScrollView } from 'react-native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { auth, db } from '../config/firebase';
import { doc, getDoc } from 'firebase/firestore';

// ============================================================================
// CONFIGURATION
// ============================================================================

const FUNCTIONS_BASE_URL = 'https://us-central1-peerrentalapp.cloudfunctions.net';

// ============================================================================
// TYPES
// ============================================================================

interface ConnectAccountStatus {
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
// COMPONENT
// ============================================================================

export default function StripeConnectScreen({ navigation }: any) {
  const [loading, setLoading] = useState(false);
  const [accountStatus, setAccountStatus] = useState<ConnectAccountStatus | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);

  // ==========================================================================
  // CHECK ACCOUNT STATUS
  // ==========================================================================

  const checkAccountStatus = useCallback(async () => {
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) {
        setCheckingStatus(false);
        return;
      }

      // Call Cloud Function to get status
      const result = await callFunction<ConnectAccountStatus>('getConnectAccountStatus', {});
      setAccountStatus(result);
    } catch (error: any) {
      console.error('Error checking account status:', error);
      
      // Fallback: check Firestore directly
      try {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser?.uid || ''));
        const userData = userDoc.data();
        
        if (userData?.stripeConnectAccountId) {
          setAccountStatus({
            hasAccount: true,
            accountId: userData.stripeConnectAccountId,
            status: userData.stripeConnectStatus || 'pending',
            message: 'Account found',
            detailsSubmitted: userData.stripeConnectDetailsSubmitted || false,
            chargesEnabled: userData.stripeConnectChargesEnabled || false,
            payoutsEnabled: userData.stripeConnectPayoutsEnabled || false,
            requirements: userData.stripeConnectRequirements || [],
          });
        } else {
          setAccountStatus({
            hasAccount: false,
            accountId: null,
            status: 'none',
            message: 'No account found',
            detailsSubmitted: false,
            chargesEnabled: false,
            payoutsEnabled: false,
          });
        }
      } catch (fbError) {
        console.error('Fallback check failed:', fbError);
        setAccountStatus({
          hasAccount: false,
          accountId: null,
          status: 'none',
          message: 'Could not check status',
          detailsSubmitted: false,
          chargesEnabled: false,
          payoutsEnabled: false,
        });
      }
    } finally {
      setCheckingStatus(false);
    }
  }, []);

  // Initial check
  useEffect(() => {
    checkAccountStatus();
  }, [checkAccountStatus]);

  // Refresh when screen comes into focus (e.g., after returning from Stripe)
  useFocusEffect(
    useCallback(() => {
      if (!checkingStatus) {
        checkAccountStatus();
      }
    }, [checkAccountStatus, checkingStatus])
  );

  // ==========================================================================
  // CONNECT ACCOUNT
  // ==========================================================================

  const handleConnectAccount = async () => {
    try {
      setLoading(true);
      const userEmail = auth.currentUser?.email;

      if (!userEmail) {
        Alert.alert('Error', 'Please sign in to continue');
        return;
      }

      let accountId = accountStatus?.accountId;

      // Create account if doesn't exist
      if (!accountId) {
        console.log('Creating Connect account...');
        const createResult = await callFunction<{ accountId: string }>('createConnectAccount', {
          email: userEmail,
          firstName: auth.currentUser?.displayName?.split(' ')[0],
          lastName: auth.currentUser?.displayName?.split(' ').slice(1).join(' '),
        });
        
        accountId = createResult.accountId;
        console.log('Account created:', accountId);
      }

      if (!accountId) {
        throw new Error('No account ID available');
      }

      // Create onboarding link (URLs are now set server-side to use Firebase Hosting)
      console.log('Creating account link...');
      const linkResult = await callFunction<{ url: string }>('createAccountLink', {
        accountId,
      });

      console.log('Account link received:', linkResult.url);

      // Open Stripe onboarding
      const canOpen = await Linking.canOpenURL(linkResult.url);
      if (canOpen) {
        await Linking.openURL(linkResult.url);
        
        // Show instruction alert
        Alert.alert(
          'Complete Setup',
          'Please complete the Stripe onboarding in your browser. When finished, you\'ll be redirected back to the app.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', 'Cannot open Stripe onboarding. Please try again.');
      }
    } catch (error: any) {
      console.error('Error connecting account:', error);
      Alert.alert(
        'Error',
        error.message || 'Failed to start setup. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================================
  // OPEN STRIPE DASHBOARD
  // ==========================================================================

  const handleOpenDashboard = async () => {
    try {
      setLoading(true);

      const result = await callFunction<{ url: string }>('createConnectLoginLink', {});

      if (result.url) {
        await Linking.openURL(result.url);
      } else {
        throw new Error('No dashboard URL returned');
      }
    } catch (error: any) {
      console.error('Error opening dashboard:', error);
      
      // Check if setup is needed
      if (error.message?.includes('not set up') || error.message?.includes('onboarding')) {
        Alert.alert(
          'Setup Required',
          'Please complete account setup before accessing the dashboard.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Complete Setup', onPress: handleConnectAccount },
          ]
        );
      } else {
        Alert.alert('Error', error.message || 'Failed to open dashboard');
      }
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================================
  // REFRESH STATUS
  // ==========================================================================

  const handleRefreshStatus = async () => {
    setLoading(true);
    await checkAccountStatus();
    setLoading(false);

    // Show appropriate message based on status
    if (accountStatus?.payoutsEnabled && accountStatus?.chargesEnabled) {
      Alert.alert(
        'Account Ready! 🎉',
        'Your account is fully set up and ready to receive payouts.',
        [{ text: 'Great!' }]
      );
    } else if (accountStatus?.hasAccount && !accountStatus?.detailsSubmitted) {
      Alert.alert(
        'Setup Incomplete',
        'Please complete the Stripe onboarding to enable payouts.',
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Continue Setup', onPress: handleConnectAccount },
        ]
      );
    } else if (accountStatus?.hasAccount && accountStatus?.detailsSubmitted && !accountStatus?.payoutsEnabled) {
      Alert.alert(
        'Under Review',
        'Your account is being reviewed by Stripe. This usually takes 1-2 business days.',
        [{ text: 'OK' }]
      );
    }
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  if (checkingStatus) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Checking account status...</Text>
      </View>
    );
  }

  const isFullyConnected = 
    accountStatus?.hasAccount && 
    accountStatus?.detailsSubmitted && 
    accountStatus?.payoutsEnabled;

  const hasPartialSetup = 
    accountStatus?.hasAccount && 
    !accountStatus?.payoutsEnabled;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Seller Account</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Fully Connected State */}
        {isFullyConnected && (
          <View style={styles.statusCard}>
            <View style={styles.successBadge}>
              <Ionicons name="checkmark-circle" size={64} color="#4CAF50" />
            </View>
            <Text style={styles.statusTitle}>Account Active!</Text>
            <Text style={styles.statusDescription}>
              Your seller account is fully set up. You can receive payouts from rentals.
            </Text>

            <View style={styles.statusDetails}>
              <View style={styles.statusItem}>
                <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                <Text style={styles.statusItemText}>Identity Verified</Text>
              </View>
              <View style={styles.statusItem}>
                <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                <Text style={styles.statusItemText}>Bank Account Connected</Text>
              </View>
              <View style={styles.statusItem}>
                <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                <Text style={styles.statusItemText}>Payouts Enabled</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleOpenDashboard}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="open-outline" size={20} color="#fff" style={styles.buttonIcon} />
                  <Text style={styles.primaryButtonText}>Open Stripe Dashboard</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => navigation.navigate('Earnings')}
            >
              <Text style={styles.secondaryButtonText}>View Earnings</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Partial Setup State */}
        {hasPartialSetup && (
          <View style={styles.infoCard}>
            <Ionicons name="time-outline" size={64} color="#FF9800" />
            <Text style={styles.title}>Setup Incomplete</Text>
            <Text style={styles.description}>
              You've started the setup process, but there are still some steps to complete 
              before you can receive payouts.
            </Text>

            {accountStatus?.requirements && accountStatus.requirements.length > 0 && (
              <View style={styles.requirementsBox}>
                <Text style={styles.requirementsTitle}>Still Needed:</Text>
                {accountStatus.requirements.slice(0, 3).map((req, index) => (
                  <Text key={index} style={styles.requirementText}>
                    • {formatRequirement(req)}
                  </Text>
                ))}
                {accountStatus.requirements.length > 3 && (
                  <Text style={styles.requirementText}>
                    • And {accountStatus.requirements.length - 3} more...
                  </Text>
                )}
              </View>
            )}

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleConnectAccount}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="arrow-forward" size={20} color="#fff" style={styles.buttonIcon} />
                  <Text style={styles.primaryButtonText}>Continue Setup</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleRefreshStatus}
              disabled={loading}
            >
              <Text style={styles.secondaryButtonText}>Refresh Status</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* No Account State */}
        {!accountStatus?.hasAccount && (
          <View style={styles.infoCard}>
            <Ionicons name="wallet-outline" size={64} color="#007AFF" />
            <Text style={styles.title}>Get Paid for Your Rentals</Text>
            <Text style={styles.description}>
              Set up your seller account to receive payouts when someone rents your items. 
              Setup takes just a few minutes.
            </Text>

            <View style={styles.stepsList}>
              <View style={styles.step}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>1</Text>
                </View>
                <Text style={styles.stepText}>Verify your identity</Text>
              </View>
              <View style={styles.step}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>2</Text>
                </View>
                <Text style={styles.stepText}>Add your bank account</Text>
              </View>
              <View style={styles.step}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>3</Text>
                </View>
                <Text style={styles.stepText}>Start earning!</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleConnectAccount}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="link" size={20} color="#fff" style={styles.buttonIcon} />
                  <Text style={styles.primaryButtonText}>Set Up Seller Account</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Security Card */}
        <View style={styles.securityCard}>
          <Ionicons name="shield-checkmark" size={24} color="#4CAF50" />
          <View style={styles.securityContent}>
            <Text style={styles.securityTitle}>Secure & Trusted</Text>
            <Text style={styles.securityText}>
              Payments are processed by Stripe, trusted by millions of businesses. 
              Your banking info is encrypted and never stored on our servers.
            </Text>
          </View>
        </View>

        {/* FAQ Card */}
        <View style={styles.faqCard}>
          <Text style={styles.faqTitle}>Frequently Asked Questions</Text>

          <View style={styles.faqItem}>
            <Text style={styles.faqQuestion}>When will I get paid?</Text>
            <Text style={styles.faqAnswer}>
              Payouts are processed when rentals are completed. Funds typically arrive 
              in your bank account within 2-3 business days.
            </Text>
          </View>

          <View style={styles.faqItem}>
            <Text style={styles.faqQuestion}>What are the fees?</Text>
            <Text style={styles.faqAnswer}>
              We charge a 10% platform fee. You keep 90% of each rental price.
            </Text>
          </View>

          <View style={styles.faqItem}>
            <Text style={styles.faqQuestion}>Can I change my bank account?</Text>
            <Text style={styles.faqAnswer}>
              Yes! Once set up, you can manage your bank account and payout settings 
              through the Stripe Dashboard.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const formatRequirement = (requirement: string): string => {
  const map: Record<string, string> = {
    'individual.verification.document': 'Identity document',
    'individual.verification.additional_document': 'Additional ID document',
    'external_account': 'Bank account',
    'individual.dob.day': 'Date of birth',
    'individual.dob.month': 'Date of birth',
    'individual.dob.year': 'Date of birth',
    'individual.address.city': 'Address',
    'individual.address.line1': 'Address',
    'individual.address.postal_code': 'Postal code',
    'individual.address.state': 'State',
    'individual.ssn_last_4': 'Last 4 of SSN',
    'individual.phone': 'Phone number',
    'tos_acceptance.date': 'Accept terms of service',
    'tos_acceptance.ip': 'Accept terms of service',
  };
  return map[requirement] || requirement.replace(/_/g, ' ').replace(/\./g, ' ');
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  successBadge: {
    marginBottom: 8,
  },
  statusTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 8,
    color: '#1a1a1a',
  },
  statusDescription: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  statusDetails: {
    width: '100%',
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusItemText: {
    fontSize: 16,
    marginLeft: 12,
    color: '#333',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
    color: '#1a1a1a',
  },
  description: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  requirementsBox: {
    width: '100%',
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
  },
  requirementsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E65100',
    marginBottom: 8,
  },
  requirementText: {
    fontSize: 14,
    color: '#F57C00',
    marginBottom: 4,
  },
  stepsList: {
    width: '100%',
    marginBottom: 24,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepNumberText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  stepText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonIcon: {
    marginRight: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
    width: '100%',
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  securityCard: {
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    marginBottom: 16,
  },
  securityContent: {
    flex: 1,
    marginLeft: 12,
  },
  securityTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2E7D32',
    marginBottom: 4,
  },
  securityText: {
    fontSize: 14,
    color: '#388E3C',
    lineHeight: 20,
  },
  faqCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  faqTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    color: '#1a1a1a',
  },
  faqItem: {
    marginBottom: 16,
  },
  faqQuestion: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  faqAnswer: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
});

