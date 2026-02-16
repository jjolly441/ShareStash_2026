// src/screens/EarningsScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PayoutService, OwnerEarnings, Payout } from '../services/PayoutService';
import { auth } from '../config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import SettingsService from '../services/SettingsService';

export default function EarningsScreen({ navigation }: any) {
  const [earnings, setEarnings] = useState<OwnerEarnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [accountStatus, setAccountStatus] = useState<any>(null);
  const [feeLabel, setFeeLabel] = useState('10%');

  useEffect(() => {
    loadEarnings();
    checkStripeAccount();
    SettingsService.getSettings().then(s => setFeeLabel(`${s.serviceFeePercent}%`)).catch(() => {});
  }, []);

  const checkStripeAccount = async () => {
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) return;

      const userDoc = await getDoc(doc(db, 'users', userId));
      const userData = userDoc.data();
      
      if (userData?.stripeConnectAccountId) {
        setStripeAccountId(userData.stripeConnectAccountId);
        
        // Check account status
        const status = await PayoutService.checkAccountStatus(userData.stripeConnectAccountId);
        setAccountStatus(status);
      }
    } catch (error) {
      console.error('Error checking Stripe account:', error);
    }
  };

  const loadEarnings = async () => {
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) return;

      const earningsData = await PayoutService.getOwnerEarnings(userId);
      setEarnings(earningsData);
    } catch (error) {
      console.error('Error loading earnings:', error);
      Alert.alert('Error', 'Failed to load earnings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadEarnings();
    checkStripeAccount();
  };

  const handleConnectBank = () => {
    navigation.navigate('StripeConnect');
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#4CAF50';
      case 'processing': return '#FF9800';
      case 'pending': return '#2196F3';
      case 'failed': return '#F44336';
      default: return '#666';
    }
  };

  const renderPayoutItem = (payout: Payout) => (
    <View key={payout.id} style={styles.payoutItem}>
      <View style={styles.payoutHeader}>
        <View style={styles.payoutInfo}>
          <Text style={styles.payoutAmount}>{formatCurrency(payout.amount)}</Text>
          <Text style={styles.payoutDate}>{formatDate(payout.createdAt)}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(payout.status) }]}>
          <Text style={styles.statusText}>{payout.status.toUpperCase()}</Text>
        </View>
      </View>
      <View style={styles.payoutDetails}>
        <Text style={styles.payoutDetailText}>
          Platform Fee: {formatCurrency(payout.platformFee)}
        </Text>
        {payout.completedAt && (
          <Text style={styles.payoutDetailText}>
            Completed: {formatDate(payout.completedAt)}
          </Text>
        )}
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Earnings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Bank Account Status */}
        {!stripeAccountId || !accountStatus?.detailsSubmitted ? (
          <View style={styles.connectCard}>
            <Ionicons name="warning-outline" size={40} color="#FF9800" />
            <Text style={styles.connectTitle}>Connect Your Bank Account</Text>
            <Text style={styles.connectDescription}>
              To receive payouts, you need to connect your bank account via Stripe.
            </Text>
            <TouchableOpacity style={styles.connectButton} onPress={handleConnectBank}>
              <Text style={styles.connectButtonText}>Connect Bank Account</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.connectedCard}>
            <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
            <Text style={styles.connectedText}>Bank Account Connected</Text>
            {accountStatus.payoutsEnabled && (
              <Text style={styles.connectedSubtext}>Payouts enabled</Text>
            )}
          </View>
        )}

        {/* Earnings Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>Earnings Summary</Text>
          
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total Earnings</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(earnings?.totalEarnings || 0)}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Available</Text>
              <Text style={[styles.summaryValue, { color: '#4CAF50' }]}>
                {formatCurrency(earnings?.availableBalance || 0)}
              </Text>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Pending</Text>
              <Text style={[styles.summaryValue, { color: '#FF9800' }]}>
                {formatCurrency(earnings?.pendingPayouts || 0)}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Platform Fees</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(earnings?.platformFees || 0)}
              </Text>
            </View>
          </View>
        </View>

        {/* Payout History */}
        <View style={styles.historyCard}>
          <Text style={styles.sectionTitle}>Payout History</Text>
          
          {earnings?.payoutHistory && earnings.payoutHistory.length > 0 ? (
            earnings.payoutHistory.map(renderPayoutItem)
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="cash-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>No payouts yet</Text>
              <Text style={styles.emptySubtext}>
                Payouts will appear here after rentals are completed
              </Text>
            </View>
          )}
        </View>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={20} color="#007AFF" />
          <Text style={styles.infoText}>
            Payouts are automatically processed when rentals are completed. We charge a {feeLabel} platform fee.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    padding: 16,
  },
  connectCard: {
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
  connectTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 8,
  },
  connectDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  connectButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  connectedCard: {
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  connectedText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2E7D32',
    marginLeft: 8,
    flex: 1,
  },
  connectedSubtext: {
    fontSize: 12,
    color: '#4CAF50',
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  historyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  payoutItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingVertical: 12,
  },
  payoutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  payoutInfo: {
    flex: 1,
  },
  payoutAmount: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  payoutDate: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  payoutDetails: {
    marginTop: 4,
  },
  payoutDetailText: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
    textAlign: 'center',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#1976D2',
    marginLeft: 8,
  },
});