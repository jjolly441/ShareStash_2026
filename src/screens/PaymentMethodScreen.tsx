// src/screens/PaymentMethodScreen.tsx
// Payment Method Management Screen
// UPDATED: Uses HTTP calls for v2 Cloud Functions (onRequest)
import React, { useState, useEffect, useContext, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CardField, useStripe } from '@stripe/stripe-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { auth } from '../config/firebase';
import { AuthContext } from '../contexts/AuthContext';
import { FUNCTIONS_BASE_URL } from '../config/constants';

// ============================================================================
// CONFIGURATION
// ============================================================================


// ============================================================================
// TYPES
// ============================================================================

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
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

  // Handle non-JSON responses (e.g. rate limiting, HTML error pages)
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text();
    throw new Error(text || `Function ${functionName} returned non-JSON response`);
  }

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
// COMPONENT
// ============================================================================

export default function PaymentMethodScreen({ navigation }: any) {
  const { user } = useContext(AuthContext);
  const { createPaymentMethod, confirmSetupIntent } = useStripe();
  
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addingCard, setAddingCard] = useState(false);
  const [removingCard, setRemovingCard] = useState<string | null>(null);
  const [settingDefault, setSettingDefault] = useState<string | null>(null);
  const [cardComplete, setCardComplete] = useState(false);

  // ==========================================================================
  // LOAD PAYMENT METHODS
  // ==========================================================================

  const loadPaymentMethods = useCallback(async () => {
    if (!user) return;

    try {
      const result = await callFunction<{
        paymentMethods: Array<{
          id: string;
          brand: string;
          last4: string;
          expMonth: number;
          expYear: number;
          isDefault: boolean;
        }>;
        defaultPaymentMethodId: string | null;
      }>('listPaymentMethods', {});

      const methods: PaymentMethod[] = result.paymentMethods.map(pm => ({
        id: pm.id,
        brand: pm.brand || 'card',
        last4: pm.last4 || '****',
        expiryMonth: pm.expMonth || 0,
        expiryYear: pm.expYear || 0,
        isDefault: pm.isDefault || pm.id === result.defaultPaymentMethodId,
      }));

      setPaymentMethods(methods);
    } catch (error) {
      console.error('Error loading payment methods:', error);
      // Don't show alert on initial load failure - might just be empty
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  // Initial load
  useEffect(() => {
    loadPaymentMethods();
  }, []);

  // Pull to refresh
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadPaymentMethods();
  }, [loadPaymentMethods]);

  // ==========================================================================
  // ADD CARD
  // ==========================================================================

  const handleAddCard = async () => {
    if (!cardComplete) {
      Alert.alert('Incomplete', 'Please complete the card information');
      return;
    }

    if (!user) {
      Alert.alert('Error', 'Please sign in to add a card');
      return;
    }

    setAddingCard(true);

    try {
      // Step 1: Create SetupIntent on the server
      const setupResult = await callFunction<{
        clientSecret: string;
        setupIntentId: string;
      }>('createSetupIntent', {});

      // Step 2: Confirm SetupIntent with Stripe SDK
      const { setupIntent, error: confirmError } = await confirmSetupIntent(
        setupResult.clientSecret,
        {
          paymentMethodType: 'Card',
        }
      );

      if (confirmError) {
        throw new Error(confirmError.message);
      }

      if (!setupIntent?.paymentMethodId) {
        throw new Error('Failed to create payment method');
      }

      // Card is now attached via the SetupIntent
      Alert.alert('Success', 'Card added successfully');
      await loadPaymentMethods();
    } catch (error: any) {
      console.error('Error adding card:', error);
      Alert.alert('Error', error.message || 'Failed to add card');
    } finally {
      setAddingCard(false);
    }
  };

  // ==========================================================================
  // REMOVE CARD
  // ==========================================================================

  const handleRemoveCard = (method: PaymentMethod) => {
    if (method.isDefault && paymentMethods.length > 1) {
      Alert.alert(
        'Cannot Remove',
        'Please set another card as default before removing this one.',
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      'Remove Card',
      `Are you sure you want to remove the ${method.brand} card ending in ${method.last4}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeCard(method.id),
        },
      ]
    );
  };

  const removeCard = async (paymentMethodId: string) => {
    setRemovingCard(paymentMethodId);

    try {
      await callFunction<{ success: boolean }>('detachPaymentMethod', {
        paymentMethodId,
      });

      // Remove from local state immediately for better UX
      setPaymentMethods(prev => prev.filter(m => m.id !== paymentMethodId));
      Alert.alert('Success', 'Card removed successfully');
    } catch (error: any) {
      console.error('Error removing card:', error);
      Alert.alert('Error', error.message || 'Failed to remove card');
    } finally {
      setRemovingCard(null);
    }
  };

  // ==========================================================================
  // SET DEFAULT CARD
  // ==========================================================================

  const handleSetDefault = async (method: PaymentMethod) => {
    if (method.isDefault) return;

    setSettingDefault(method.id);

    try {
      await callFunction<{ success: boolean }>('setDefaultPaymentMethod', {
        paymentMethodId: method.id,
      });

      // Update local state
      setPaymentMethods(prev =>
        prev.map(m => ({
          ...m,
          isDefault: m.id === method.id,
        }))
      );
      Alert.alert('Success', 'Default card updated');
    } catch (error: any) {
      console.error('Error setting default:', error);
      Alert.alert('Error', error.message || 'Failed to update default card');
    } finally {
      setSettingDefault(null);
    }
  };

  // ==========================================================================
  // RENDER HELPERS
  // ==========================================================================

  const getCardIcon = (brand: string): string => {
    const brandLower = brand.toLowerCase();
    switch (brandLower) {
      case 'visa':
      case 'mastercard':
      case 'amex':
      case 'discover':
        return 'card';
      default:
        return 'card-outline';
    }
  };

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
    const isRemoving = removingCard === method.id;
    const isSettingDefault = settingDefault === method.id;
    const isProcessing = isRemoving || isSettingDefault;

    return (
      <View key={method.id} style={[styles.cardItem, isProcessing && styles.cardItemProcessing]}>
        <TouchableOpacity
          style={styles.cardInfo}
          onPress={() => handleSetDefault(method)}
          disabled={method.isDefault || isProcessing}
        >
          <View style={[styles.cardIconContainer, { backgroundColor: getCardColor(method.brand) + '15' }]}>
            <Ionicons name={getCardIcon(method.brand)} size={28} color={getCardColor(method.brand)} />
          </View>
          <View style={styles.cardDetails}>
            <Text style={styles.cardBrand}>{method.brand.toUpperCase()}</Text>
            <Text style={styles.cardNumber}>•••• •••• •••• {method.last4}</Text>
            <Text style={styles.cardExpiry}>
              Expires {String(method.expiryMonth).padStart(2, '0')}/{method.expiryYear}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.cardActions}>
          {isSettingDefault ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : method.isDefault ? (
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultText}>Default</Text>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => handleSetDefault(method)}
              style={styles.setDefaultButton}
              disabled={isProcessing}
            >
              <Text style={styles.setDefaultText}>Set Default</Text>
            </TouchableOpacity>
          )}

          {isRemoving ? (
            <ActivityIndicator size="small" color={Colors.warning} style={{ marginLeft: 8 }} />
          ) : (
            <TouchableOpacity
              onPress={() => handleRemoveCard(method)}
              style={styles.removeButton}
              disabled={isProcessing}
            >
              <Ionicons name="trash-outline" size={20} color={Colors.warning} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading payment methods...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment Methods</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="shield-checkmark" size={24} color={Colors.success} />
          <View style={styles.infoTextContainer}>
            <Text style={styles.infoTitle}>Secure Payment</Text>
            <Text style={styles.infoText}>
              Your payment information is encrypted and secure
            </Text>
          </View>
        </View>

        {/* Saved Cards */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Saved Cards</Text>
          {paymentMethods.length > 0 ? (
            <View style={styles.cardsList}>
              {paymentMethods.map(renderPaymentMethod)}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="card-outline" size={64} color={Colors.border} />
              <Text style={styles.emptyTitle}>No payment methods</Text>
              <Text style={styles.emptyText}>
                Add a card to make payments faster
              </Text>
            </View>
          )}
        </View>

        {/* Add New Card */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Add New Card</Text>

          <View style={styles.cardFieldContainer}>
            <CardField
              postalCodeEnabled={true}
              placeholders={{
                number: '4242 4242 4242 4242',
              }}
              cardStyle={styles.cardFieldStyle}
              style={styles.cardField}
              onCardChange={(cardDetails) => {
                setCardComplete(cardDetails.complete);
              }}
            />
          </View>

          <TouchableOpacity
            style={[styles.addButton, (!cardComplete || addingCard) && styles.addButtonDisabled]}
            onPress={handleAddCard}
            disabled={!cardComplete || addingCard}
          >
            {addingCard ? (
              <ActivityIndicator color={Colors.text} />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={20} color={Colors.text} />
                <Text style={styles.addButtonText}>Add Card</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Security Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security & Privacy</Text>

          <View style={styles.securityItem}>
            <Ionicons name="lock-closed" size={20} color={Colors.success} />
            <Text style={styles.securityText}>
              Your card details are never stored on our servers
            </Text>
          </View>

          <View style={styles.securityItem}>
            <Ionicons name="shield-checkmark" size={20} color={Colors.success} />
            <Text style={styles.securityText}>
              All transactions are encrypted with industry-standard SSL
            </Text>
          </View>

          <View style={styles.securityItem}>
            <Ionicons name="business" size={20} color={Colors.success} />
            <Text style={styles.securityText}>
              Powered by Stripe - trusted by millions worldwide
            </Text>
          </View>
        </View>

        {/* Test Card Info (Development Only) */}
        {__DEV__ && (
          <View style={styles.testCardInfo}>
            <Text style={styles.testCardTitle}>🧪 Test Card (Development)</Text>
            <Text style={styles.testCardText}>Card: 4242 4242 4242 4242</Text>
            <Text style={styles.testCardText}>Expiry: Any future date</Text>
            <Text style={styles.testCardText}>CVC: Any 3 digits</Text>
            <Text style={styles.testCardText}>ZIP: Any 5 digits</Text>
          </View>
        )}
      </ScrollView>
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
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.success + '15',
    margin: 20,
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 14,
    color: Colors.text,
    opacity: 0.8,
  },
  section: {
    backgroundColor: Colors.white,
    marginHorizontal: 20,
    marginBottom: 16,
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
  cardsList: {
    gap: 12,
  },
  cardItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardItemProcessing: {
    opacity: 0.6,
  },
  cardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cardIconContainer: {
    width: 48,
    height: 48,
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
    fontSize: 15,
    color: Colors.text,
    marginBottom: 2,
    fontFamily: 'monospace',
  },
  cardExpiry: {
    fontSize: 12,
    color: Colors.text,
    opacity: 0.6,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  defaultBadge: {
    backgroundColor: Colors.success,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  defaultText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.white,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  setDefaultButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.secondary,
  },
  setDefaultText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.secondary,
  },
  removeButton: {
    padding: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.text,
    opacity: 0.6,
    textAlign: 'center',
  },
  cardFieldContainer: {
    marginBottom: 16,
  },
  cardField: {
    height: 50,
    marginVertical: 8,
  },
  cardFieldStyle: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    fontSize: 16,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  addButtonDisabled: {
    opacity: 0.6,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
  },
  securityItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  securityText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
  testCardInfo: {
    backgroundColor: Colors.secondary + '15',
    marginHorizontal: 20,
    marginBottom: 32,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.secondary + '30',
  },
  testCardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.secondary,
    marginBottom: 8,
  },
  testCardText: {
    fontSize: 12,
    color: Colors.secondary,
    marginBottom: 2,
    fontFamily: 'monospace',
  },
});