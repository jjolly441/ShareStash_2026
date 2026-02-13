// src/screens/CheckoutScreen.tsx
// Checkout/Payment screen for completing rental payments
// UPDATED: Enhanced verification gate with better UX for $500+ rentals
// FIXED: Added AppState listener and refreshUser to properly detect verification completion
// FIXED: Resolved infinite loop in useFocusEffect
import React, { useState, useEffect, useContext, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  RefreshControl,
  AppState,
  AppStateStatus,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { auth } from '../config/firebase';
import { RentalService, Rental } from '../services/RentalService';
import { RootStackParamList } from '../types/navigation';
import { AuthContext } from '../contexts/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

// ============================================================================
// CONFIGURATION
// ============================================================================

const FUNCTIONS_BASE_URL = 'https://us-central1-peerrentalapp.cloudfunctions.net';

// ============================================================================
// TYPES
// ============================================================================

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
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
// COLORS
// ============================================================================

const Colors = {
  primary: '#F5C542',
  secondary: '#2E86AB',
  success: '#46A758',
  warning: '#F76707',
  danger: '#DC3545',
  background: '#F8F9FA',
  text: '#212529',
  white: '#FFFFFF',
  border: '#E9ECEF',
};

// ============================================================================
// NAVIGATION TYPES
// ============================================================================

type CheckoutScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Checkout'>;
type CheckoutScreenRouteProp = RouteProp<RootStackParamList, 'Checkout'>;

type CheckoutScreenProps = {
  navigation: CheckoutScreenNavigationProp;
  route: CheckoutScreenRouteProp;
};

// ============================================================================
// CONSTANTS
// ============================================================================

const PLATFORM_FEE_PERCENT = 0.10; // 10% platform fee
const IDENTITY_VERIFICATION_THRESHOLD = 50000; // $500 in cents
const IDENTITY_VERIFICATION_THRESHOLD_DOLLARS = 500;

// ============================================================================
// VERIFICATION GATE COMPONENT
// ============================================================================

interface VerificationGateProps {
  itemName: string;
  itemPrice: number;
  onVerify: () => void;
  onGoBack: () => void;
}

const VerificationGate: React.FC<VerificationGateProps> = ({ 
  itemName, 
  itemPrice, 
  onVerify,
  onGoBack 
}) => (
  <SafeAreaView style={styles.container}>
    <View style={styles.header}>
      <TouchableOpacity onPress={onGoBack} style={styles.backButton}>
        <Ionicons name="arrow-back" size={24} color={Colors.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Verification Required</Text>
      <View style={styles.headerSpacer} />
    </View>
    
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.gateContainer}>
      <View style={styles.gateIcon}>
        <Ionicons name="shield-checkmark" size={80} color={Colors.secondary} />
      </View>
      
      <Text style={styles.gateTitle}>Identity Verification Required</Text>
      
      <Text style={styles.gateDescription}>
        For rentals of <Text style={styles.gateBold}>${IDENTITY_VERIFICATION_THRESHOLD_DOLLARS}+</Text>, 
        we require identity verification to protect both renters and owners.
      </Text>

      <View style={styles.gateItemCard}>
        <Ionicons name="cube-outline" size={24} color={Colors.text} />
        <View style={styles.gateItemInfo}>
          <Text style={styles.gateItemName} numberOfLines={1}>{itemName}</Text>
          <Text style={styles.gateItemPrice}>${itemPrice.toFixed(2)} total</Text>
        </View>
      </View>

      <View style={styles.gateBenefits}>
        <Text style={styles.gateBenefitsTitle}>Why we verify identities:</Text>
        
        <View style={styles.gateBenefitItem}>
          <Ionicons name="shield-checkmark" size={20} color={Colors.success} />
          <Text style={styles.gateBenefitText}>Protects against fraud and scams</Text>
        </View>
        
        <View style={styles.gateBenefitItem}>
          <Ionicons name="shield-checkmark" size={20} color={Colors.success} />
          <Text style={styles.gateBenefitText}>Ensures accountability for high-value items</Text>
        </View>
        
        <View style={styles.gateBenefitItem}>
          <Ionicons name="shield-checkmark" size={20} color={Colors.success} />
          <Text style={styles.gateBenefitText}>Builds trust in our community</Text>
        </View>
      </View>

      <View style={styles.gateRequirements}>
        <Text style={styles.gateRequirementsTitle}>Quick verification (2-3 min):</Text>
        <Text style={styles.gateRequirementText}>• Government-issued ID</Text>
        <Text style={styles.gateRequirementText}>• Quick selfie for matching</Text>
      </View>

      <TouchableOpacity style={styles.gateVerifyButton} onPress={onVerify}>
        <Ionicons name="shield-checkmark" size={20} color={Colors.text} />
        <Text style={styles.gateVerifyButtonText}>Verify My Identity</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.gateCancelButton} onPress={onGoBack}>
        <Text style={styles.gateCancelButtonText}>Cancel</Text>
      </TouchableOpacity>

      <Text style={styles.gateSecurityNote}>
        🔒 Verification is handled securely by Stripe. Your data is never stored on our servers.
      </Text>
    </ScrollView>
  </SafeAreaView>
);

// ============================================================================
// COMPONENT
// ============================================================================

export default function CheckoutScreen({ navigation, route }: CheckoutScreenProps) {
  const { rentalId } = route.params;
  
  // FIXED: Also get refreshUser from context
  const { user, refreshUser } = useContext(AuthContext);

  const [rental, setRental] = useState<Rental | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState(false);
  
  // Verification state
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
  const [checkingVerification, setCheckingVerification] = useState(true);
  
  // FIXED: Use ref to prevent multiple simultaneous checks
  const isCheckingRef = useRef(false);
  const lastCheckTimeRef = useRef(0);

  // ==========================================================================
  // CHECK VERIFICATION STATUS - FIXED VERSION (no infinite loop)
  // ==========================================================================

  const checkVerificationStatus = useCallback(async (forceCheck = false) => {
    // Prevent multiple simultaneous checks
    if (isCheckingRef.current) {
      console.log('Already checking verification, skipping...');
      return;
    }
    
    // Debounce: don't check more than once every 2 seconds unless forced
    const now = Date.now();
    if (!forceCheck && now - lastCheckTimeRef.current < 2000) {
      console.log('Debouncing verification check');
      return;
    }
    
    if (!user) {
      console.log('No user - skipping verification check');
      setCheckingVerification(false);
      return;
    }

    isCheckingRef.current = true;
    lastCheckTimeRef.current = now;

    try {
      console.log('=== VERIFICATION CHECK ===');
      console.log('User ID:', user.id);
      
      // Fetch fresh data directly from Firestore
      const userDoc = await getDoc(doc(db, 'users', user.id));
      const userData = userDoc.data();
      
      console.log('Firestore identityVerified:', userData?.identityVerified);
      
      // Explicitly check for true (not just truthy)
      const verified = userData?.identityVerified === true;
      setIsVerified(verified);
      
      console.log('Set isVerified to:', verified);
      
      // Only refresh context if verification status changed
      if (verified && !user.identityVerified) {
        console.log('Verification status changed - refreshing user context');
        refreshUser();
      }
    } catch (error) {
      console.error('Error checking verification:', error);
      setIsVerified(false);
    } finally {
      setCheckingVerification(false);
      isCheckingRef.current = false;
    }
  }, [user?.id]); // Only depend on user.id, not the whole user object

  // ==========================================================================
  // LOAD DATA
  // ==========================================================================

  const loadPaymentMethods = useCallback(async () => {
    try {
      const result = await callFunction<{
        paymentMethods: PaymentMethod[];
        defaultPaymentMethodId: string | null;
      }>('listPaymentMethods', {});

      setPaymentMethods(result.paymentMethods);

      // Auto-select default payment method (or first if no default)
      const defaultMethod = result.paymentMethods.find(m => m.isDefault) || result.paymentMethods[0];
      if (defaultMethod && !selectedPaymentMethod) {
        setSelectedPaymentMethod(defaultMethod.id);
      }
    } catch (error) {
      console.error('Error loading payment methods:', error);
    }
  }, [selectedPaymentMethod]);

  const loadCheckoutData = useCallback(async () => {
    if (!user) return;

    try {
      // Load rental details
      const rentalData = await RentalService.getRentalById(rentalId);
      if (rentalData) {
        setRental(rentalData);
      } else {
        Alert.alert('Error', 'Rental not found');
        navigation.goBack();
        return;
      }

      // Load payment methods
      await loadPaymentMethods();
      
      // Check verification status (force check on initial load)
      await checkVerificationStatus(true);
    } catch (error) {
      console.error('Error loading checkout data:', error);
      Alert.alert('Error', 'Failed to load checkout information');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, rentalId, navigation, loadPaymentMethods, checkVerificationStatus]);

  // Initial load
  useEffect(() => {
    loadCheckoutData();
  }, []);

  // Refresh when returning from PaymentMethodScreen or VerifyIdentity
  useFocusEffect(
    useCallback(() => {
      if (!loading && user) {
        console.log('Screen focused - rechecking verification');
        loadPaymentMethods();
        checkVerificationStatus(); // Will be debounced if called too frequently
      }
    }, [loading, user?.id]) // Only depend on user.id to prevent loop
  );

  // ==========================================================================
  // FIXED: Re-check verification when app comes back to foreground
  // This handles the case when user returns from browser-based verification
  // ==========================================================================
  
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && !loading && user) {
        console.log('App became active - rechecking verification status');
        checkVerificationStatus(true); // Force check when returning from browser
      }
    });

    return () => {
      subscription.remove();
    };
  }, [loading, user?.id]); // Only depend on user.id

  // Pull to refresh
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadCheckoutData();
  }, [loadCheckoutData]);

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleAddPaymentMethod = () => {
    navigation.navigate('PaymentMethods');
  };

  const handleVerifyIdentity = () => {
    navigation.navigate('VerifyIdentity', {
      rentalId,
      returnTo: 'Checkout',
      itemName: rental?.itemName,
      itemPrice: rental?.totalPrice,
    });
  };

  const handlePayNow = async () => {
    if (!rental || !user) return;

    if (!selectedPaymentMethod) {
      Alert.alert('Payment Method Required', 'Please select or add a payment method');
      return;
    }

    // Double-check verification for high-value rentals
    const amountInCents = Math.round(rental.totalPrice * 100);
    if (amountInCents >= IDENTITY_VERIFICATION_THRESHOLD) {
      // Fetch fresh verification status directly from Firestore
      try {
        const userDoc = await getDoc(doc(db, 'users', user.id));
        const userData = userDoc.data();
        const currentlyVerified = userData?.identityVerified === true;
        
        console.log('Pay Now - Fresh verification check:', currentlyVerified);
        
        if (!currentlyVerified) {
          Alert.alert(
            'Verification Required',
            'Please verify your identity to complete this rental.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Verify Now', onPress: handleVerifyIdentity },
            ]
          );
          return;
        }
        
        // Update local state if it was stale
        if (!isVerified) {
          setIsVerified(true);
        }
      } catch (error) {
        console.error('Error checking verification in handlePayNow:', error);
        Alert.alert('Error', 'Could not verify your identity status. Please try again.');
        return;
      }
    }

    Alert.alert(
      'Confirm Payment',
      `You will be charged $${rental.totalPrice.toFixed(2)} for this rental.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Pay Now', onPress: processPayment },
      ]
    );
  };

  const processPayment = async () => {
    if (!rental || !user || !selectedPaymentMethod) return;

    // Issue #22: Guard against duplicate payment
    if (rental.paymentStatus === 'paid' || rental.status === 'active') {
      Alert.alert(
        'Already Paid',
        'This rental has already been paid for. Check your Rentals tab for details.',
        [
          {
            text: 'View Rentals',
            onPress: () => {
              (navigation as any).navigate('MainTabs', { screen: 'Rentals' });
            },
          },
        ]
      );
      return;
    }

    setProcessing(true);

    try {
      // Find the selected payment method
      const paymentMethod = paymentMethods.find(pm => pm.id === selectedPaymentMethod);

      if (!paymentMethod) {
        Alert.alert('Error', 'Please select a payment method');
        setProcessing(false);
        return;
      }

      // Convert amount to cents
      const amountInCents = Math.round(rental.totalPrice * 100);

      // Create payment intent via Cloud Function
      const result = await callFunction<{
        clientSecret: string;
        paymentIntentId: string;
        status: string;
        amount: number;
        platformFee: number;
        sellerAmount: number;
        requiresIdentityVerification?: boolean;
      }>('createPaymentIntent', {
        amount: amountInCents,
        currency: 'usd',
        rentalId: rental.id || rentalId,
        sellerId: rental.ownerId,
        itemId: rental.itemId,
        itemName: rental.itemName,
        paymentMethodId: paymentMethod.id,
      });

      // Check if identity verification is required
      if (result.requiresIdentityVerification) {
        Alert.alert(
          'Identity Verification Required',
          'Please verify your identity to complete this rental.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Verify Now', onPress: handleVerifyIdentity },
          ]
        );
        setProcessing(false);
        return;
      }

      // Payment was successful - update rental status
      if (result.status === 'succeeded' || result.status === 'requires_capture') {
        await RentalService.startRental(rental.id || rentalId, result.paymentIntentId);

        // Build success message with confirmation number if available
        const confirmMsg = rental.confirmationNumber
          ? `\n\nConfirmation #: ${rental.confirmationNumber}`
          : '';

        // Success!
        Alert.alert(
          'Payment Successful! 🎉',
          `Your rental has been confirmed. You can now arrange pickup with the owner.${confirmMsg}`,
          [
            {
              text: 'View Rentals',
              onPress: () => {
                (navigation as any).navigate('MainTabs', { screen: 'Rentals' });
              },
            },
          ]
        );
      } else if (result.status === 'requires_action' || result.status === 'requires_confirmation') {
        // Payment needs additional action (3D Secure, etc.)
        Alert.alert(
          'Additional Verification Required',
          'Your bank requires additional verification. Please check your banking app or try a different card.',
          [{ text: 'OK' }]
        );
      } else {
        throw new Error('Payment was not completed successfully');
      }
    } catch (error: any) {
      console.error('Payment processing error:', error);

      // Handle specific error cases
      if (error.message?.includes('Identity verification required')) {
        Alert.alert(
          'Identity Verification Required',
          'Please verify your identity to complete this rental.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Verify Now', onPress: handleVerifyIdentity },
          ]
        );
      } else if (error.message?.includes('insufficient_funds')) {
        Alert.alert('Payment Failed', 'Your card has insufficient funds. Please try another card.');
      } else if (error.message?.includes('card_declined')) {
        Alert.alert('Card Declined', 'Your card was declined. Please try another card.');
      } else if (error.message?.includes('Seller has not set up payments')) {
        Alert.alert('Cannot Complete', 'The seller has not set up their payment account yet. Please contact them or try another listing.');
      } else if (error.message?.includes('duplicate') || error.message?.includes('already been paid') || error.message?.includes('already active')) {
        // Issue #22: Catch duplicate payment errors from server
        Alert.alert(
          'Already Paid',
          'This rental has already been paid for. Check your Rentals tab for details.',
          [
            {
              text: 'View Rentals',
              onPress: () => {
                (navigation as any).navigate('MainTabs', { screen: 'Rentals' });
              },
            },
          ]
        );
      } else {
        Alert.alert('Payment Failed', error.message || 'Payment processing failed. Please try again.');
      }
    } finally {
      setProcessing(false);
    }
  };

  // ==========================================================================
  // RENDER HELPERS
  // ==========================================================================

  const getCardColor = (brand: string): string => {
    const brandLower = brand.toLowerCase();
    switch (brandLower) {
      case 'visa':
        return '#1A1F71';
      case 'mastercard':
        return '#EB001B';
      case 'amex':
        return '#006FCF';
      default:
        return Colors.secondary;
    }
  };

  const renderPaymentMethod = (method: PaymentMethod) => {
    const isSelected = selectedPaymentMethod === method.id;

    return (
      <TouchableOpacity
        key={method.id}
        style={[styles.paymentMethodCard, isSelected && styles.paymentMethodCardSelected]}
        onPress={() => setSelectedPaymentMethod(method.id)}
        disabled={processing}
      >
        <View style={styles.paymentMethodInfo}>
          <View style={[styles.cardIconContainer, { backgroundColor: getCardColor(method.brand) + '15' }]}>
            <Ionicons name="card" size={24} color={getCardColor(method.brand)} />
          </View>
          <View style={styles.cardDetails}>
            <Text style={styles.cardBrand}>{method.brand.toUpperCase()}</Text>
            <Text style={styles.cardNumber}>•••• •••• •••• {method.last4}</Text>
          </View>
          {method.isDefault && (
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultBadgeText}>Default</Text>
            </View>
          )}
        </View>
        <View style={[styles.radioButton, isSelected && styles.radioButtonSelected]}>
          {isSelected && <View style={styles.radioButtonInner} />}
        </View>
      </TouchableOpacity>
    );
  };

  // Calculate fees
  const calculateFees = () => {
    if (!rental) return { subtotal: 0, platformFee: 0, total: 0 };

    const total = rental.totalPrice;
    const platformFee = total * PLATFORM_FEE_PERCENT;
    const subtotal = total - platformFee;

    return { subtotal, platformFee, total };
  };

  const { subtotal, platformFee, total } = calculateFees();

  // Check if identity verification is needed
  const needsIdentityVerification = rental 
    ? Math.round(rental.totalPrice * 100) >= IDENTITY_VERIFICATION_THRESHOLD 
    : false;

  // ==========================================================================
  // RENDER
  // ==========================================================================

  if (loading || checkingVerification) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading checkout...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!rental) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={Colors.warning} />
          <Text style={styles.errorText}>Rental not found</Text>
          <TouchableOpacity style={styles.errorButton} onPress={() => navigation.goBack()}>
            <Text style={styles.errorButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // VERIFICATION GATE: Show verification screen for $500+ rentals if not verified
  if (needsIdentityVerification && !isVerified) {
    return (
      <VerificationGate
        itemName={rental.itemName}
        itemPrice={rental.totalPrice}
        onVerify={handleVerifyIdentity}
        onGoBack={() => navigation.goBack()}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Complete Payment</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Verified Badge for $500+ rentals */}
        {needsIdentityVerification && isVerified && (
          <View style={styles.verifiedNotice}>
            <Ionicons name="shield-checkmark" size={20} color={Colors.success} />
            <Text style={styles.verifiedNoticeText}>Identity Verified - Ready to checkout</Text>
          </View>
        )}

        {/* Rental Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rental Summary</Text>

          <View style={styles.rentalCard}>
            {rental.itemImage && (
              <Image source={{ uri: rental.itemImage }} style={styles.itemImage} />
            )}
            <View style={styles.rentalInfo}>
              <Text style={styles.itemTitle} numberOfLines={2}>{rental.itemName}</Text>
              <Text style={styles.ownerName}>From {rental.ownerName}</Text>
              <View style={styles.datesContainer}>
                <Ionicons name="calendar-outline" size={16} color={Colors.text} />
                <Text style={styles.datesText}>
                  {new Date(rental.startDate).toLocaleDateString()} - {new Date(rental.endDate).toLocaleDateString()}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Payment Method Selection */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Payment Method</Text>
            <TouchableOpacity onPress={handleAddPaymentMethod} disabled={processing}>
              <Text style={[styles.addMethodButton, processing && styles.addMethodButtonDisabled]}>
                + Add Card
              </Text>
            </TouchableOpacity>
          </View>

          {paymentMethods.length > 0 ? (
            <View style={styles.paymentMethodsList}>
              {paymentMethods.map(renderPaymentMethod)}
            </View>
          ) : (
            <View style={styles.noPaymentMethods}>
              <Ionicons name="card-outline" size={48} color={Colors.border} />
              <Text style={styles.noPaymentMethodsText}>No payment methods</Text>
              <TouchableOpacity
                style={styles.addCardButton}
                onPress={handleAddPaymentMethod}
                disabled={processing}
              >
                <Text style={styles.addCardButtonText}>Add a Card</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Price Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Details</Text>

          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Rental Amount</Text>
            <Text style={styles.priceValue}>${subtotal.toFixed(2)}</Text>
          </View>

          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Service Fee (10%)</Text>
            <Text style={styles.priceValue}>${platformFee.toFixed(2)}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.priceRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="shield-checkmark-outline" size={20} color={Colors.success} />
            <Text style={styles.infoText}>
              Payment is held securely until you confirm item pickup
            </Text>
          </View>
        </View>

        {/* Terms */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rental Agreement</Text>

          <View style={styles.termItem}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
            <Text style={styles.termText}>
              Pick up the item on the scheduled start date
            </Text>
          </View>

          <View style={styles.termItem}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
            <Text style={styles.termText}>
              Return the item in the same condition by the end date
            </Text>
          </View>

          <View style={styles.termItem}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
            <Text style={styles.termText}>
              Report any damage immediately through the app
            </Text>
          </View>

          <View style={styles.termItem}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
            <Text style={styles.termText}>
              Free cancellation up to 24 hours before rental start
            </Text>
          </View>
        </View>

        {/* Bottom padding */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomPriceInfo}>
          <Text style={styles.bottomTotal}>${total.toFixed(2)}</Text>
          <Text style={styles.bottomSubtext}>Total amount</Text>
        </View>
        <TouchableOpacity
          style={[
            styles.payButton,
            (!selectedPaymentMethod || processing || rental?.paymentStatus === 'paid' || rental?.status === 'active') && styles.payButtonDisabled,
          ]}
          onPress={handlePayNow}
          disabled={!selectedPaymentMethod || processing || rental?.paymentStatus === 'paid' || rental?.status === 'active'}
        >
          {processing ? (
            <View style={styles.processingContainer}>
              <ActivityIndicator color={Colors.text} size="small" />
              <Text style={styles.payButtonText}>Processing...</Text>
            </View>
          ) : rental?.paymentStatus === 'paid' || rental?.status === 'active' ? (
            <Text style={styles.payButtonText}>Already Paid</Text>
          ) : (
            <Text style={styles.payButtonText}>Pay Now</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
  },
  headerSpacer: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: Colors.text,
    opacity: 0.6,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorText: {
    fontSize: 18,
    color: Colors.text,
    marginTop: 16,
    marginBottom: 24,
  },
  errorButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  errorButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  // Verified notice
  verifiedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success + '15',
    marginHorizontal: 20,
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  verifiedNoticeText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.success,
  },
  // Verification Gate Styles
  gateContainer: {
    flexGrow: 1,
    alignItems: 'center',
    padding: 20,
    paddingTop: 40,
  },
  gateIcon: {
    marginBottom: 24,
  },
  gateTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  gateDescription: {
    fontSize: 16,
    color: Colors.text,
    opacity: 0.7,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  gateBold: {
    fontWeight: 'bold',
    color: Colors.text,
  },
  gateItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  gateItemInfo: {
    flex: 1,
  },
  gateItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  gateItemPrice: {
    fontSize: 14,
    color: Colors.secondary,
    fontWeight: '600',
  },
  gateBenefits: {
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  gateBenefitsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
  },
  gateBenefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  gateBenefitText: {
    fontSize: 14,
    color: Colors.text,
    flex: 1,
  },
  gateRequirements: {
    width: '100%',
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  gateRequirementsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  gateRequirementText: {
    fontSize: 14,
    color: Colors.text,
    opacity: 0.7,
    marginBottom: 4,
  },
  gateVerifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: '100%',
    gap: 10,
    marginBottom: 12,
  },
  gateVerifyButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  gateCancelButton: {
    paddingVertical: 12,
  },
  gateCancelButtonText: {
    fontSize: 16,
    color: Colors.text,
    opacity: 0.6,
  },
  gateSecurityNote: {
    fontSize: 12,
    color: Colors.text,
    opacity: 0.5,
    textAlign: 'center',
    marginTop: 16,
  },
  // Original styles
  section: {
    backgroundColor: Colors.white,
    marginHorizontal: 20,
    marginTop: 16,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  addMethodButton: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.secondary,
  },
  addMethodButtonDisabled: {
    opacity: 0.5,
  },
  rentalCard: {
    flexDirection: 'row',
    gap: 12,
  },
  itemImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: Colors.border,
  },
  rentalInfo: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  ownerName: {
    fontSize: 14,
    color: Colors.text,
    opacity: 0.6,
    marginBottom: 8,
  },
  datesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  datesText: {
    fontSize: 14,
    color: Colors.text,
  },
  paymentMethodsList: {
    gap: 12,
  },
  paymentMethodCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.background,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  paymentMethodCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '10',
  },
  paymentMethodInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cardIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardDetails: {
    flex: 1,
  },
  cardBrand: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  cardNumber: {
    fontSize: 14,
    color: Colors.text,
    fontFamily: 'monospace',
  },
  defaultBadge: {
    backgroundColor: Colors.success + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 8,
  },
  defaultBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.success,
    textTransform: 'uppercase',
  },
  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioButtonSelected: {
    borderColor: Colors.primary,
  },
  radioButtonInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  noPaymentMethods: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  noPaymentMethodsText: {
    fontSize: 16,
    color: Colors.text,
    opacity: 0.6,
    marginTop: 12,
    marginBottom: 16,
  },
  addCardButton: {
    backgroundColor: Colors.secondary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  addCardButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  priceLabel: {
    fontSize: 16,
    color: Colors.text,
  },
  priceValue: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 12,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
  },
  totalValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.success + '10',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: Colors.success,
    lineHeight: 20,
  },
  termItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  termText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  bottomPriceInfo: {
    flex: 1,
  },
  bottomTotal: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.text,
  },
  bottomSubtext: {
    fontSize: 12,
    color: Colors.text,
    opacity: 0.6,
  },
  payButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
    minWidth: 140,
    alignItems: 'center',
  },
  payButtonDisabled: {
    opacity: 0.6,
  },
  payButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
  },
  processingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
