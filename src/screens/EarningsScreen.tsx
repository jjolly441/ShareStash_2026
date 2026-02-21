// src/screens/EarningsScreen.tsx
// Enhanced Owner Earnings Dashboard with analytics, item earnings, and payout history
import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PayoutService, OwnerEarnings, Payout } from '../services/PayoutService';
import { auth } from '../config/firebase';
import { doc, getDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import SettingsService from '../services/SettingsService';
import { AuthContext } from '../contexts/AuthContext';

const Colors = {
  primary: '#F5C542',
  secondary: '#2E86AB',
  success: '#46A758',
  warning: '#F59E0B',
  danger: '#EF4444',
  background: '#F8F9FA',
  text: '#212529',
  white: '#FFFFFF',
  border: '#E9ECEF',
  muted: '#6C757D',
};

const { width } = Dimensions.get('window');

type TabType = 'overview' | 'items' | 'history';

interface ItemEarning {
  itemId: string;
  itemName: string;
  totalRentals: number;
  totalEarned: number;
  pendingAmount: number;
  lastRental: string;
}

interface MonthlyEarning {
  month: string;
  label: string;
  amount: number;
}

export default function EarningsScreen({ navigation }: any) {
  const { user } = useContext(AuthContext);
  const [earnings, setEarnings] = useState<OwnerEarnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [accountStatus, setAccountStatus] = useState<any>(null);
  const [feePercent, setFeePercent] = useState(10);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Analytics data
  const [itemEarnings, setItemEarnings] = useState<ItemEarning[]>([]);
  const [monthlyEarnings, setMonthlyEarnings] = useState<MonthlyEarning[]>([]);
  const [completedRentals, setCompletedRentals] = useState(0);
  const [activeRentals, setActiveRentals] = useState(0);
  const [pendingPayoutRentals, setPendingPayoutRentals] = useState(0);
  const [avgRentalValue, setAvgRentalValue] = useState(0);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    await Promise.all([
      loadEarnings(),
      checkStripeAccount(),
      loadRentalAnalytics(),
      loadFeePercent(),
    ]);
  };

  const loadFeePercent = async () => {
    try {
      const settings = await SettingsService.getSettings();
      setFeePercent(settings.serviceFeePercent);
    } catch {}
  };

  const checkStripeAccount = async () => {
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) return;
      const userDoc = await getDoc(doc(db, 'users', userId));
      const userData = userDoc.data();
      if (userData?.stripeConnectAccountId) {
        setStripeAccountId(userData.stripeConnectAccountId);
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
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadRentalAnalytics = async () => {
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) return;

      // Fetch all rentals where user is owner
      const rentalsRef = collection(db, 'rentals');
      const q = query(rentalsRef, where('ownerId', '==', userId));
      const snapshot = await getDocs(q);

      const itemMap: Record<string, ItemEarning> = {};
      const monthMap: Record<string, number> = {};
      let completed = 0;
      let active = 0;
      let pendingPayout = 0;
      let totalValue = 0;
      let rentalCount = 0;

      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const status = data.status;
        const price = data.totalPrice || 0;
        const itemId = data.itemId || 'unknown';
        const itemName = data.itemName || 'Unknown Item';

        // Count by status
        if (status === 'completed') {
          completed++;
          totalValue += price;
          rentalCount++;
        } else if (status === 'active') {
          active++;
        } else if (status === 'completed_pending_payout') {
          pendingPayout++;
          totalValue += price;
          rentalCount++;
        }

        // Item earnings
        if (!itemMap[itemId]) {
          itemMap[itemId] = {
            itemId,
            itemName,
            totalRentals: 0,
            totalEarned: 0,
            pendingAmount: 0,
            lastRental: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          };
        }
        itemMap[itemId].totalRentals++;
        if (status === 'completed') {
          // Approximate owner earnings (rental price minus platform fee)
          itemMap[itemId].totalEarned += price * (1 - feePercent / 100);
        } else if (status === 'completed_pending_payout' || status === 'active') {
          itemMap[itemId].pendingAmount += price * (1 - feePercent / 100);
        }
        const dateStr = data.createdAt?.toDate?.()?.toISOString() || '';
        if (dateStr > itemMap[itemId].lastRental) {
          itemMap[itemId].lastRental = dateStr;
        }

        // Monthly earnings (completed only)
        if (status === 'completed' || status === 'completed_pending_payout') {
          const date = data.completedAt?.toDate?.() || data.createdAt?.toDate?.() || new Date();
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          const ownerAmount = price * (1 - feePercent / 100);
          monthMap[monthKey] = (monthMap[monthKey] || 0) + ownerAmount;
        }
      });

      // Sort items by total earned
      const sortedItems = Object.values(itemMap).sort((a, b) => b.totalEarned - a.totalEarned);
      setItemEarnings(sortedItems);

      // Build monthly array (last 6 months)
      const months: MonthlyEarning[] = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = d.toLocaleDateString('en-US', { month: 'short' });
        months.push({ month: key, label, amount: monthMap[key] || 0 });
      }
      setMonthlyEarnings(months);

      setCompletedRentals(completed);
      setActiveRentals(active);
      setPendingPayoutRentals(pendingPayout);
      setAvgRentalValue(rentalCount > 0 ? totalValue / rentalCount : 0);
    } catch (error) {
      console.error('Error loading rental analytics:', error);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadAllData();
  };

  const handleConnectBank = () => {
    navigation.navigate('StripeConnect');
  };

  const handleOpenDashboard = async () => {
    try {
      const url = await PayoutService.createDashboardLink();
      if (url) {
        // Open in browser
        const { Linking } = require('react-native');
        Linking.openURL(url);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Could not open Stripe dashboard');
    }
  };

  const fmt = (n: number) => `$${n.toFixed(2)}`;

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return Colors.success;
      case 'processing': return Colors.warning;
      case 'pending': return Colors.secondary;
      case 'failed': return Colors.danger;
      default: return Colors.muted;
    }
  };

  // ─── Monthly Chart (simple bar chart) ─────────────────────────────
  const maxMonthly = Math.max(...monthlyEarnings.map((m) => m.amount), 1);

  // ─── Render ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.secondary} />
          <Text style={styles.loadingText}>Loading earnings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Earnings</Text>
        {accountStatus?.payoutsEnabled ? (
          <TouchableOpacity onPress={handleOpenDashboard}>
            <Ionicons name="open-outline" size={22} color={Colors.secondary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Bank Account Status */}
        {!stripeAccountId || !accountStatus?.detailsSubmitted ? (
          <View style={styles.connectCard}>
            <Ionicons name="warning-outline" size={36} color={Colors.warning} />
            <Text style={styles.connectTitle}>Connect Your Bank Account</Text>
            <Text style={styles.connectDesc}>
              To receive payouts, you need to connect your bank account via Stripe.
            </Text>
            <TouchableOpacity style={styles.connectBtn} onPress={handleConnectBank}>
              <Text style={styles.connectBtnText}>Connect Bank Account</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.connectedBanner}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
            <Text style={styles.connectedText}>Bank account connected — payouts enabled</Text>
          </View>
        )}

        {/* Hero Stats */}
        <View style={styles.heroCard}>
          <View style={styles.heroMain}>
            <Text style={styles.heroLabel}>Total Earnings</Text>
            <Text style={styles.heroAmount}>{fmt(earnings?.totalEarnings || 0)}</Text>
          </View>
          <View style={styles.heroRow}>
            <View style={styles.heroStat}>
              <View style={[styles.heroDot, { backgroundColor: Colors.success }]} />
              <View>
                <Text style={styles.heroStatValue}>{fmt(earnings?.availableBalance || 0)}</Text>
                <Text style={styles.heroStatLabel}>Available</Text>
              </View>
            </View>
            <View style={styles.heroStat}>
              <View style={[styles.heroDot, { backgroundColor: Colors.warning }]} />
              <View>
                <Text style={styles.heroStatValue}>{fmt(earnings?.pendingPayouts || 0)}</Text>
                <Text style={styles.heroStatLabel}>Pending</Text>
              </View>
            </View>
            <View style={styles.heroStat}>
              <View style={[styles.heroDot, { backgroundColor: Colors.muted }]} />
              <View>
                <Text style={styles.heroStatValue}>{fmt(earnings?.platformFees || 0)}</Text>
                <Text style={styles.heroStatLabel}>Fees ({feePercent}%)</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Quick Stats Row */}
        <View style={styles.quickStatsRow}>
          <View style={styles.quickStat}>
            <Ionicons name="checkmark-done" size={20} color={Colors.success} />
            <Text style={styles.quickStatValue}>{completedRentals}</Text>
            <Text style={styles.quickStatLabel}>Completed</Text>
          </View>
          <View style={styles.quickStat}>
            <Ionicons name="time" size={20} color={Colors.secondary} />
            <Text style={styles.quickStatValue}>{activeRentals}</Text>
            <Text style={styles.quickStatLabel}>Active</Text>
          </View>
          <View style={styles.quickStat}>
            <Ionicons name="hourglass" size={20} color={Colors.warning} />
            <Text style={styles.quickStatValue}>{pendingPayoutRentals}</Text>
            <Text style={styles.quickStatLabel}>Awaiting Payout</Text>
          </View>
          <View style={styles.quickStat}>
            <Ionicons name="trending-up" size={20} color={Colors.primary} />
            <Text style={styles.quickStatValue}>{fmt(avgRentalValue)}</Text>
            <Text style={styles.quickStatLabel}>Avg. Value</Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          {(['overview', 'items', 'history'] as TabType[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'overview' ? 'Overview' : tab === 'items' ? 'By Item' : 'Payout History'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <>
            {/* Monthly Earnings Chart */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Monthly Earnings</Text>
              <View style={styles.chartContainer}>
                {monthlyEarnings.map((m) => (
                  <View key={m.month} style={styles.chartCol}>
                    <Text style={styles.chartAmount}>
                      {m.amount > 0 ? `$${m.amount.toFixed(0)}` : ''}
                    </Text>
                    <View style={styles.chartBarWrapper}>
                      <View
                        style={[
                          styles.chartBar,
                          {
                            height: Math.max(4, (m.amount / maxMonthly) * 100),
                            backgroundColor: m.amount > 0 ? Colors.secondary : Colors.border,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.chartLabel}>{m.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Payout Info */}
            <View style={styles.infoCard}>
              <Ionicons name="information-circle" size={20} color={Colors.secondary} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.infoTitle}>How Payouts Work</Text>
                <Text style={styles.infoText}>
                  After a rental is completed and both parties confirm return, there's a 48-hour dispute window. Once cleared, your payout is automatically processed to your connected bank account. We deduct a {feePercent}% platform fee.
                </Text>
              </View>
            </View>
          </>
        )}

        {activeTab === 'items' && (
          <>
            {itemEarnings.length > 0 ? (
              itemEarnings.map((item) => (
                <View key={item.itemId} style={styles.itemCard}>
                  <View style={styles.itemHeader}>
                    <Text style={styles.itemName} numberOfLines={1}>{item.itemName}</Text>
                    <Text style={styles.itemTotal}>{fmt(item.totalEarned)}</Text>
                  </View>
                  <View style={styles.itemStatsRow}>
                    <View style={styles.itemStat}>
                      <Text style={styles.itemStatValue}>{item.totalRentals}</Text>
                      <Text style={styles.itemStatLabel}>Rentals</Text>
                    </View>
                    <View style={styles.itemStat}>
                      <Text style={[styles.itemStatValue, { color: Colors.warning }]}>
                        {fmt(item.pendingAmount)}
                      </Text>
                      <Text style={styles.itemStatLabel}>Pending</Text>
                    </View>
                    <View style={styles.itemStat}>
                      <Text style={[styles.itemStatValue, { color: Colors.success }]}>
                        {fmt(item.totalRentals > 0 ? item.totalEarned / item.totalRentals : 0)}
                      </Text>
                      <Text style={styles.itemStatLabel}>Avg / Rental</Text>
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="cube-outline" size={48} color={Colors.border} />
                <Text style={styles.emptyTitle}>No item data yet</Text>
                <Text style={styles.emptySubtext}>
                  Earnings per item will appear here after rentals are completed
                </Text>
              </View>
            )}
          </>
        )}

        {activeTab === 'history' && (
          <>
            {earnings?.payoutHistory && earnings.payoutHistory.length > 0 ? (
              earnings.payoutHistory.map((payout) => (
                <View key={payout.id} style={styles.payoutCard}>
                  <View style={styles.payoutRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.payoutAmount}>{fmt(payout.amount)}</Text>
                      <Text style={styles.payoutDate}>{formatDate(payout.createdAt)}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(payout.status) + '15' }]}>
                      <View style={[styles.statusDot, { backgroundColor: getStatusColor(payout.status) }]} />
                      <Text style={[styles.statusText, { color: getStatusColor(payout.status) }]}>
                        {payout.status.charAt(0).toUpperCase() + payout.status.slice(1)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.payoutDetails}>
                    <View style={styles.payoutDetailRow}>
                      <Text style={styles.payoutDetailLabel}>Rental Total</Text>
                      <Text style={styles.payoutDetailValue}>{fmt(payout.originalAmount)}</Text>
                    </View>
                    <View style={styles.payoutDetailRow}>
                      <Text style={styles.payoutDetailLabel}>Platform Fee ({feePercent}%)</Text>
                      <Text style={[styles.payoutDetailValue, { color: Colors.danger }]}>
                        -{fmt(payout.platformFee)}
                      </Text>
                    </View>
                    <View style={[styles.payoutDetailRow, { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 6, marginTop: 4 }]}>
                      <Text style={[styles.payoutDetailLabel, { fontWeight: '700' }]}>Your Payout</Text>
                      <Text style={[styles.payoutDetailValue, { fontWeight: '700', color: Colors.success }]}>
                        {fmt(payout.amount)}
                      </Text>
                    </View>
                  </View>
                  {payout.completedAt && (
                    <Text style={styles.payoutCompletedText}>
                      Deposited {formatDate(payout.completedAt)}
                    </Text>
                  )}
                </View>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="cash-outline" size={48} color={Colors.border} />
                <Text style={styles.emptyTitle}>No payouts yet</Text>
                <Text style={styles.emptySubtext}>
                  Payouts will appear here after rentals are completed and cleared
                </Text>
              </View>
            )}
          </>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 16, color: Colors.muted },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.text },

  content: { padding: 16 },

  // Connect bank
  connectCard: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.warning + '40',
  },
  connectTitle: { fontSize: 17, fontWeight: '700', color: Colors.text, marginTop: 10, marginBottom: 6 },
  connectDesc: { fontSize: 13, color: Colors.muted, textAlign: 'center', marginBottom: 16, lineHeight: 19 },
  connectBtn: { backgroundColor: Colors.secondary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  connectBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
  connectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.success + '10',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.success + '30',
  },
  connectedText: { fontSize: 13, fontWeight: '600', color: Colors.success },

  // Hero stats
  heroCard: {
    backgroundColor: Colors.text,
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
  },
  heroMain: { marginBottom: 16 },
  heroLabel: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 4 },
  heroAmount: { fontSize: 32, fontWeight: '800', color: Colors.white },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between' },
  heroStat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroDot: { width: 8, height: 8, borderRadius: 4 },
  heroStatValue: { fontSize: 14, fontWeight: '700', color: Colors.white },
  heroStatLabel: { fontSize: 10, color: 'rgba(255,255,255,0.5)' },

  // Quick stats
  quickStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  quickStat: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickStatValue: { fontSize: 16, fontWeight: '800', color: Colors.text, marginTop: 4 },
  quickStatLabel: { fontSize: 9, color: Colors.muted, marginTop: 2, textAlign: 'center' },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: Colors.secondary },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.muted },
  tabTextActive: { color: Colors.white },

  // Card
  card: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 14 },

  // Chart
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 140,
  },
  chartCol: { flex: 1, alignItems: 'center' },
  chartAmount: { fontSize: 10, color: Colors.muted, marginBottom: 4 },
  chartBarWrapper: { height: 100, justifyContent: 'flex-end' },
  chartBar: { width: 28, borderRadius: 6, minHeight: 4 },
  chartLabel: { fontSize: 11, color: Colors.muted, marginTop: 6 },

  // Info card
  infoCard: {
    flexDirection: 'row',
    backgroundColor: Colors.secondary + '08',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.secondary + '20',
    marginBottom: 16,
  },
  infoTitle: { fontSize: 13, fontWeight: '700', color: Colors.secondary, marginBottom: 4 },
  infoText: { fontSize: 12, color: Colors.muted, lineHeight: 18 },

  // Item cards
  itemCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  itemName: { fontSize: 14, fontWeight: '700', color: Colors.text, flex: 1, marginRight: 10 },
  itemTotal: { fontSize: 16, fontWeight: '800', color: Colors.success },
  itemStatsRow: { flexDirection: 'row', gap: 16 },
  itemStat: {},
  itemStatValue: { fontSize: 14, fontWeight: '700', color: Colors.text },
  itemStatLabel: { fontSize: 10, color: Colors.muted },

  // Payout cards
  payoutCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  payoutRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  payoutAmount: { fontSize: 18, fontWeight: '800', color: Colors.text },
  payoutDate: { fontSize: 12, color: Colors.muted, marginTop: 2 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    gap: 5,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '600' },
  payoutDetails: { gap: 4 },
  payoutDetailRow: { flexDirection: 'row', justifyContent: 'space-between' },
  payoutDetailLabel: { fontSize: 13, color: Colors.muted },
  payoutDetailValue: { fontSize: 13, fontWeight: '600', color: Colors.text },
  payoutCompletedText: { fontSize: 11, color: Colors.success, marginTop: 8, fontWeight: '600' },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: Colors.muted, marginTop: 12 },
  emptySubtext: { fontSize: 13, color: Colors.muted, marginTop: 4, textAlign: 'center', lineHeight: 19 },
});