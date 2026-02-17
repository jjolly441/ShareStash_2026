// src/screens/AdminDashboard.tsx - With Migration Feature Added
import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  FlatList,
  TextInput,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  orderBy,
  Timestamp 
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { AuthContext } from '../contexts/AuthContext';
import DisputeService, { Dispute } from '../services/DisputeService';
import { StackNavigationProp } from '@react-navigation/stack';
import { runAllMigrations } from '../scripts/migrateRentals'; // NEW IMPORT
import NotificationService from '../services/NotificationService'; // Issue #13: Blast messages
import SettingsService from '../services/SettingsService';
import PromoCodeService, { PromoCode } from '../services/PromoCodeService';
import ItemService from '../services/ItemService';


const Colors = {
  primary: '#F5C542',
  secondary: '#2E86AB',
  success: '#46A758',
  warning: '#F76707',
  danger: '#EF4444',
  background: '#F8F9FA',
  text: '#212529',
  white: '#FFFFFF',
  border: '#E9ECEF',
  admin: '#8b5cf6',
};

// Types
interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
  role?: 'user' | 'admin';
}

interface Item {
  id: string;
  title: string;
  description: string;
  category: string;
  pricePerDay: number;
  image: string;
  ownerId: string;
  ownerName: string;
  isAvailable: boolean;
  createdAt: string;
}

interface Rental {
  id: string;
  itemId: string;
  itemTitle: string;
  itemImage: string;
  renterId: string;
  renterName: string;
  ownerId: string;
  ownerName: string;
  status: 'pending' | 'approved' | 'active' | 'completed' | 'declined' | 'cancelled';
  startDate: string;
  endDate: string;
  totalPrice: number;
  createdAt: string;
}

interface DashboardStats {
  totalUsers: number;
  totalItems: number;
  activeRentals: number;
  pendingRentals: number;
  totalRevenue: number;
  newUsersThisMonth: number;
  openDisputes: number;
}

type TabType = 'overview' | 'users' | 'items' | 'rentals' | 'disputes' | 'promos';

type AdminDashboardProps = {
  navigation: StackNavigationProp<any>;
};

export default function AdminDashboard({ navigation }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { user } = useContext(AuthContext);

  // Data state
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    totalItems: 0,
    activeRentals: 0,
    pendingRentals: 0,
    totalRevenue: 0,
    newUsersThisMonth: 0,
    openDisputes: 0,
  });
  const [users, setUsers] = useState<User[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);

  // Promo code state
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [showCreatePromo, setShowCreatePromo] = useState(false);
  const [mostViewed, setMostViewed] = useState<any[]>([]);
  const [leastViewed, setLeastViewed] = useState<any[]>([]);
  const [newPromo, setNewPromo] = useState({
    code: '',
    discountType: 'percent' as 'percent' | 'flat',
    discountValue: '',
    maxUses: '0',
    maxUsesPerUser: '1',
    minRentalAmount: '0',
    maxDiscountAmount: '0',
    expiresAt: '',
    description: '',
  });

  // Service fee controls
  const [currentFeePercent, setCurrentFeePercent] = useState<number>(10);
  const [feeInput, setFeeInput] = useState<string>('10');
  const [feeSaving, setFeeSaving] = useState(false);
  const [feeLastUpdated, setFeeLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Fetch users
      const usersSnap = await getDocs(collection(db, 'users'));
      const usersData: User[] = usersSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as User));
      setUsers(usersData);

      // Fetch items
      const itemsSnap = await getDocs(collection(db, 'items'));
      const itemsData: Item[] = itemsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as Item));
      setItems(itemsData);

      // Fetch rentals
      const rentalsSnap = await getDocs(collection(db, 'rentals'));
      const rentalsData: Rental[] = rentalsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as Rental));
      setRentals(rentalsData);

      // Fetch disputes
      const disputesSnap = await getDocs(collection(db, 'disputes'));
      const disputesData: Dispute[] = disputesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as Dispute));
      setDisputes(disputesData);

      // Fetch promo codes
      const promoData = await PromoCodeService.getAllPromoCodes();
      setPromoCodes(promoData);

      // Fetch view analytics
      const topItems = await ItemService.getMostViewedItems(5);
      setMostViewed(topItems);
      const bottomItems = await ItemService.getLeastViewedItems(5);
      setLeastViewed(bottomItems);

      // Calculate stats
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const activeRentalsCount = rentalsData.filter(
        r => r.status === 'approved' || r.status === 'active'
      ).length;

      const pendingRentalsCount = rentalsData.filter(
        r => r.status === 'pending'
      ).length;

      const completedRentals = rentalsData.filter(r => r.status === 'completed');
      const totalRevenue = completedRentals.reduce((sum, r) => sum + r.totalPrice, 0);

      const newUsersCount = usersData.filter(u => {
        const userDate = new Date(u.createdAt);
        return userDate >= monthStart;
      }).length;

      const openDisputesCount = disputesData.filter(d => d.status === 'open').length;

      setStats({
        totalUsers: usersData.length,
        totalItems: itemsData.length,
        activeRentals: activeRentalsCount,
        pendingRentals: pendingRentalsCount,
        totalRevenue: totalRevenue,
        newUsersThisMonth: newUsersCount,
        openDisputes: openDisputesCount,
      });

      // Fetch platform settings (service fee)
      try {
        const settings = await SettingsService.getSettings(true);
        setCurrentFeePercent(settings.serviceFeePercent);
        setFeeInput(settings.serviceFeePercent.toString());
        if (settings.updatedAt) {
          const date = (settings.updatedAt as any).toDate
            ? (settings.updatedAt as any).toDate()
            : new Date(settings.updatedAt as any);
          setFeeLastUpdated(date.toLocaleDateString());
        }
      } catch (settingsErr) {
        console.error('Error fetching settings:', settingsErr);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      Alert.alert('Error', 'Failed to load dashboard data');
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
    setRefreshing(false);
  };

  // NEW MIGRATION FUNCTION
  const handleRunMigration = async () => {
    Alert.alert(
      'Run Database Migration',
      'This will update all rentals and disputes to use "itemName" instead of "itemTitle". This is safe and recommended. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Run Migration',
          onPress: async () => {
            setLoading(true);
            try {
              const results = await runAllMigrations();
              
              if (results.rentals.success && results.disputes.success) {
                Alert.alert(
                  '✅ Migration Complete!',
                  `Rentals updated: ${results.rentals.updated}\nDisputes updated: ${results.disputes.updated}\n\nAll data has been successfully migrated.`
                );
                // Refresh data after migration
                await fetchDashboardData();
              } else {
                Alert.alert(
                  'Migration Issues',
                  'Some migrations failed. Check console for details.'
                );
              }
            } catch (error) {
              console.error('Migration error:', error);
              Alert.alert('Error', 'Migration failed. Check console for details.');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  // Issue #13: Blast message to all users
  const handleBlastMessage = () => {
    Alert.prompt(
      'Send Blast Message',
      'Enter the notification title:',
      async (title) => {
        if (!title?.trim()) return;
        Alert.prompt(
          'Message Body',
          'Enter the notification message:',
          async (body) => {
            if (!body?.trim()) return;
            Alert.alert(
              'Confirm Blast',
              `Send this notification to all ${users.length} users?\n\nTitle: ${title}\nMessage: ${body}`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Send to All',
                  onPress: async () => {
                    setLoading(true);
                    let sent = 0;
                    try {
                      for (const u of users) {
                        await NotificationService.storeNotification(
                          u.id,
                          title.trim(),
                          body.trim(),
                          { type: 'dispute_admin_update', screen: 'Notifications' }
                        );
                        sent++;
                      }
                      Alert.alert('Success', `Notification sent to ${sent} users.`);
                    } catch (error) {
                      console.error('Blast message error:', error);
                      Alert.alert('Error', `Sent to ${sent} users before failing.`);
                    } finally {
                      setLoading(false);
                    }
                  },
                },
              ]
            );
          }
        );
      }
    );
  };

  // User actions
  const deleteUser = async (userId: string, userName: string) => {
    Alert.alert(
      'Delete User',
      `Are you sure you want to delete ${userName}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'users', userId));
              await fetchDashboardData();
              Alert.alert('Success', 'User deleted successfully');
            } catch (error) {
              Alert.alert('Error', 'Failed to delete user');
            }
          },
        },
      ]
    );
  };

  const makeAdmin = async (userId: string, userName: string) => {
    Alert.alert(
      'Make Admin',
      `Grant admin privileges to ${userName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'users', userId), { role: 'admin' });
              await fetchDashboardData();
              Alert.alert('Success', `${userName} is now an admin`);
            } catch (error) {
              Alert.alert('Error', 'Failed to update user role');
            }
          },
        },
      ]
    );
  };

  // Item actions
  const deleteItem = async (itemId: string, itemTitle: string) => {
    Alert.alert(
      'Delete Item',
      `Delete "${itemTitle}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'items', itemId));
              await fetchDashboardData();
              Alert.alert('Success', 'Item deleted');
            } catch (error) {
              Alert.alert('Error', 'Failed to delete item');
            }
          },
        },
      ]
    );
  };

  const toggleItemAvailability = async (item: Item) => {
    try {
      await updateDoc(doc(db, 'items', item.id), {
        isAvailable: !item.isAvailable,
      });
      await fetchDashboardData();
      Alert.alert('Success', `Item ${item.isAvailable ? 'disabled' : 'enabled'}`);
    } catch (error) {
      Alert.alert('Error', 'Failed to update item');
    }
  };

  // Rental actions
  const cancelRental = async (rentalId: string) => {
    Alert.alert(
      'Cancel Rental',
      'Cancel this rental?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'rentals', rentalId), {
                status: 'cancelled',
              });
              await fetchDashboardData();
              Alert.alert('Success', 'Rental cancelled');
            } catch (error) {
              Alert.alert('Error', 'Failed to cancel rental');
            }
          },
        },
      ]
    );
  };

  // Dispute actions
  const updateDisputeStatus = async (disputeId: string, dispute: Dispute) => {
    Alert.alert(
      'Update Dispute Status',
      'Choose an action:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark as Investigating',
          onPress: async () => {
            const result = await DisputeService.updateDisputeStatus(
              disputeId,
              'investigating',
              undefined,
              undefined,
              'Admin is reviewing this case'
            );
            if (result.success) {
              Alert.alert('Success', 'Dispute marked as investigating');
              fetchDashboardData();
            }
          },
        },
        {
          text: 'Resolve Dispute',
          onPress: () => {
            Alert.prompt(
              'Resolve Dispute',
              'Enter resolution notes:',
              async (notes) => {
                if (notes) {
                  const result = await DisputeService.updateDisputeStatus(
                    disputeId,
                    'resolved',
                    'admin',
                    notes,
                    'Resolved by admin'
                  );
                  if (result.success) {
                    Alert.alert('Success', 'Dispute resolved');
                    fetchDashboardData();
                  }
                }
              }
            );
          },
        },
        {
          text: 'Close Dispute',
          style: 'destructive',
          onPress: async () => {
            const result = await DisputeService.updateDisputeStatus(
              disputeId,
              'closed',
              'no_action',
              'Closed without action',
              'Admin closed this dispute'
            );
            if (result.success) {
              Alert.alert('Success', 'Dispute closed');
              fetchDashboardData();
            }
          },
        },
      ]
    );
  };

  // Render components
  // Service fee handler
  const handleSaveFee = async () => {
    const newFee = parseFloat(feeInput);
    if (isNaN(newFee) || newFee < 0 || newFee > 50) {
      Alert.alert('Invalid Fee', 'Please enter a fee between 0% and 50%.');
      return;
    }

    if (newFee === currentFeePercent) {
      Alert.alert('No Change', 'The fee is already set to this value.');
      return;
    }

    Alert.alert(
      'Update Service Fee',
      `Change the platform service fee from ${currentFeePercent}% to ${newFee}%?\n\nThis will affect all future transactions.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update',
          onPress: async () => {
            try {
              setFeeSaving(true);
              await SettingsService.updateSettings(
                { serviceFeePercent: newFee },
                user?.id || 'admin'
              );
              setCurrentFeePercent(newFee);
              setFeeLastUpdated(new Date().toLocaleDateString());
              Alert.alert('Success', `Service fee updated to ${newFee}%.`);
            } catch (error: any) {
              console.error('Error saving fee:', error);
              Alert.alert('Error', 'Failed to update service fee.');
              setFeeInput(currentFeePercent.toString());
            } finally {
              setFeeSaving(false);
            }
          },
        },
      ]
    );
  };

  const StatCard = ({ icon, label, value, color }: any) => (
    <View style={[styles.statCard, { backgroundColor: color }]}>
      <Ionicons name={icon} size={28} color={Colors.white} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  const renderOverview = () => (
    <ScrollView 
      style={styles.content} 
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.sectionTitle}>Dashboard Overview</Text>
      
      <View style={styles.statsGrid}>
        <StatCard 
          icon="people" 
          label="Total Users" 
          value={stats.totalUsers} 
          color={Colors.secondary} 
        />
        <StatCard 
          icon="cube" 
          label="Total Items" 
          value={stats.totalItems} 
          color={Colors.success} 
        />
        <StatCard 
          icon="briefcase" 
          label="Active Rentals" 
          value={stats.activeRentals} 
          color={Colors.primary} 
        />
        <StatCard 
          icon="time" 
          label="Pending" 
          value={stats.pendingRentals} 
          color={Colors.warning} 
        />
        <StatCard 
          icon="alert-circle" 
          label="Open Disputes" 
          value={stats.openDisputes} 
          color={Colors.danger} 
        />
      </View>

      <View style={styles.revenueCard}>
        <View style={styles.revenueHeader}>
          <Ionicons name="cash" size={24} color={Colors.success} />
          <Text style={styles.revenueLabel}>Total Revenue</Text>
        </View>
        <Text style={styles.revenueValue}>${stats.totalRevenue.toFixed(2)}</Text>
        <Text style={styles.revenueSubtext}>From completed rentals</Text>
      </View>

      <View style={styles.quickStatsCard}>
        <Text style={styles.cardTitle}>Quick Stats</Text>
        <View style={styles.statRow}>
          <Text style={styles.statRowLabel}>New Users (This Month)</Text>
          <Text style={styles.statRowValue}>{stats.newUsersThisMonth}</Text>
        </View>
        <View style={[styles.statRow, styles.borderTop]}>
          <Text style={styles.statRowLabel}>Available Items</Text>
          <Text style={styles.statRowValue}>
            {items.filter(i => i.isAvailable).length}
          </Text>
        </View>
      </View>

      {/* Item View Analytics */}
      <View style={styles.quickStatsCard}>
        <Text style={styles.cardTitle}>Most Viewed Items</Text>
        {mostViewed.length === 0 ? (
          <Text style={{ color: '#999', fontSize: 13, padding: 8 }}>No view data yet. Views are tracked when users open item details.</Text>
        ) : (
          mostViewed.map((item, index) => (
            <View key={item.id} style={[styles.statRow, index > 0 && styles.borderTop]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: 'bold', color: Colors.admin, marginRight: 8, width: 20 }}>#{index + 1}</Text>
                <Text style={{ fontSize: 14, color: Colors.text, flex: 1 }} numberOfLines={1}>{item.title}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="eye" size={14} color={Colors.secondary} />
                <Text style={{ fontSize: 14, fontWeight: 'bold', color: Colors.secondary, marginLeft: 4 }}>{item.viewCount || 0}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.quickStatsCard}>
        <Text style={styles.cardTitle}>Least Viewed Items</Text>
        {leastViewed.length === 0 ? (
          <Text style={{ color: '#999', fontSize: 13, padding: 8 }}>No items to show.</Text>
        ) : (
          leastViewed.map((item, index) => (
            <View key={item.id} style={[styles.statRow, index > 0 && styles.borderTop]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: 'bold', color: Colors.warning, marginRight: 8, width: 20 }}>#{index + 1}</Text>
                <Text style={{ fontSize: 14, color: Colors.text, flex: 1 }} numberOfLines={1}>{item.title}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="eye-off-outline" size={14} color="#999" />
                <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#999', marginLeft: 4 }}>{item.viewCount || 0}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* NEW SYSTEM TOOLS SECTION */}
      <View style={styles.quickStatsCard}>
        <Text style={styles.cardTitle}>System Tools</Text>
        
        <TouchableOpacity 
          style={styles.migrationButton}
          onPress={handleRunMigration}
        >
          <View style={styles.migrationButtonContent}>
            <Ionicons name="sync" size={24} color={Colors.admin} />
            <View style={styles.migrationButtonText}>
              <Text style={styles.migrationButtonTitle}>Run Database Migration</Text>
              <Text style={styles.migrationButtonSubtitle}>
                Update field names: itemTitle → itemName
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={Colors.admin} />
          </View>
        </TouchableOpacity>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={16} color={Colors.secondary} />
          <Text style={styles.infoText}>
            Run this migration once to update all existing rentals and disputes to use the new field names.
          </Text>
        </View>

        {/* Blast Message Tool - Issue #13 */}
        <TouchableOpacity 
          style={styles.migrationButton}
          onPress={handleBlastMessage}
        >
          <View style={styles.migrationButtonContent}>
            <Ionicons name="megaphone" size={24} color={Colors.admin} />
            <View style={styles.migrationButtonText}>
              <Text style={styles.migrationButtonTitle}>Send Blast Message</Text>
              <Text style={styles.migrationButtonSubtitle}>
                Notify all users via in-app notification
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={Colors.admin} />
          </View>
        </TouchableOpacity>
      </View>

      {/* PLATFORM SETTINGS — Service Fee Controls */}
      <View style={styles.quickStatsCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Ionicons name="settings" size={20} color={Colors.admin} />
          <Text style={styles.cardTitle}>Platform Settings</Text>
        </View>

        <View style={styles.statRow}>
          <Text style={styles.statRowLabel}>Current Service Fee</Text>
          <Text style={[styles.statRowValue, { color: Colors.admin, fontWeight: 'bold' }]}>
            {currentFeePercent}%
          </Text>
        </View>

        {feeLastUpdated && (
          <View style={[styles.statRow, styles.borderTop]}>
            <Text style={styles.statRowLabel}>Last Updated</Text>
            <Text style={styles.statRowValue}>{feeLastUpdated}</Text>
          </View>
        )}

        <View style={[styles.borderTop, { paddingTop: 12, marginTop: 8 }]}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 8 }}>
            Update Service Fee
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', flex: 1,
              backgroundColor: Colors.background, borderRadius: 10,
              borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12,
            }}>
              <TextInput
                style={{ flex: 1, fontSize: 18, fontWeight: '600', color: Colors.text, paddingVertical: 10 }}
                value={feeInput}
                onChangeText={setFeeInput}
                keyboardType="decimal-pad"
                placeholder="10"
                placeholderTextColor="#aaa"
                maxLength={5}
              />
              <Text style={{ fontSize: 18, fontWeight: '600', color: Colors.admin }}>%</Text>
            </View>
            <TouchableOpacity
              style={{
                backgroundColor: Colors.admin, borderRadius: 10,
                paddingHorizontal: 20, paddingVertical: 12,
                opacity: feeSaving ? 0.6 : 1,
              }}
              onPress={handleSaveFee}
              disabled={feeSaving}
            >
              {feeSaving ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (
                <Text style={{ color: Colors.white, fontWeight: 'bold', fontSize: 15 }}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={[styles.infoBox, { marginTop: 10 }]}>
            <Ionicons name="information-circle" size={16} color={Colors.secondary} />
            <Text style={styles.infoText}>
              Fee is deducted from the owner's payout. Enter a value between 0-50%. Changes apply to all future transactions.
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );

  const renderUsers = () => {
    const filteredUsers = users.filter(u => {
      const query = searchQuery.toLowerCase();
      const firstName = (u.firstName || '').toLowerCase();
      const lastName = (u.lastName || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      return firstName.includes(query) || lastName.includes(query) || email.includes(query);
    });

    return (
      <View style={styles.content}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={Colors.text} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search users..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#9ca3af"
          />
        </View>

        <FlatList
          data={filteredUsers}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.userAvatar}>
                  <Ionicons name="person" size={24} color={Colors.white} />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.cardName}>
                    {item.firstName} {item.lastName}
                  </Text>
                  <Text style={styles.cardSubtext}>{item.email}</Text>
                  {item.role === 'admin' && (
                    <View style={styles.adminBadgeSmall}>
                      <Ionicons name="shield-checkmark" size={12} color={Colors.admin} />
                      <Text style={styles.adminBadgeText}>Admin</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.actionButtons}>
                {item.role !== 'admin' && (
                  <TouchableOpacity 
                    style={[styles.actionButton, styles.buttonAdmin]}
                    onPress={() => makeAdmin(item.id, `${item.firstName} ${item.lastName}`)}
                  >
                    <Ionicons name="shield" size={16} color={Colors.white} />
                    <Text style={styles.buttonText}>Make Admin</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity 
                  style={[styles.actionButton, styles.buttonDanger]}
                  onPress={() => deleteUser(item.id, `${item.firstName} ${item.lastName}`)}
                >
                  <Ionicons name="trash" size={16} color={Colors.white} />
                  <Text style={styles.buttonText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      </View>
    );
  };

  const renderItems = () => {
    const filteredItems = items.filter(i => {
      const query = searchQuery.toLowerCase();
      const title = (i.title || '').toLowerCase();
      const category = (i.category || '').toLowerCase();
      const ownerName = (i.ownerName || '').toLowerCase();
      return title.includes(query) || category.includes(query) || ownerName.includes(query);
    });

    return (
      <View style={styles.content}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={Colors.text} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search items..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#9ca3af"
          />
        </View>

        <FlatList
          data={filteredItems}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Image source={{ uri: item.image }} style={styles.itemImage} />
              
              <View style={styles.itemInfo}>
                <View style={styles.cardHeader}>
                  <View style={styles.flex1}>
                    <Text style={styles.cardName}>{item.title}</Text>
                    <Text style={styles.cardSubtext}>{item.category}</Text>
                    <Text style={styles.cardSubtext}>by {item.ownerName}</Text>
                  </View>
                  <View style={[
                    styles.badge,
                    item.isAvailable ? styles.badgeSuccess : styles.badgeDanger
                  ]}>
                    <Text style={[
                      styles.badgeText,
                      item.isAvailable ? styles.badgeTextSuccess : styles.badgeTextDanger
                    ]}>
                      {item.isAvailable ? 'Available' : 'Unavailable'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.priceText}>${item.pricePerDay}/day</Text>

                <View style={styles.actionButtons}>
                  <TouchableOpacity 
                    style={[styles.actionButton, styles.buttonWarning]}
                    onPress={() => toggleItemAvailability(item)}
                  >
                    <Ionicons 
                      name={item.isAvailable ? 'eye-off' : 'eye'} 
                      size={16} 
                      color={Colors.white} 
                    />
                    <Text style={styles.buttonText}>
                      {item.isAvailable ? 'Disable' : 'Enable'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.actionButton, styles.buttonDanger]}
                    onPress={() => deleteItem(item.id, item.title)}
                  >
                    <Ionicons name="trash" size={16} color={Colors.white} />
                    <Text style={styles.buttonText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        />
      </View>
    );
  };

  const renderRentals = () => {
    const filteredRentals = rentals.filter(r => {
      const query = searchQuery.toLowerCase();
      const itemTitle = (r.itemTitle || '').toLowerCase();
      const renterName = (r.renterName || '').toLowerCase();
      const ownerName = (r.ownerName || '').toLowerCase();
      return itemTitle.includes(query) || renterName.includes(query) || ownerName.includes(query);
    });

    const getStatusColor = (status: string) => {
      const colors = {
        completed: Colors.success,
        approved: Colors.secondary,
        active: Colors.secondary,
        pending: Colors.warning,
        declined: Colors.danger,
        cancelled: Colors.danger,
      };
      return colors[status as keyof typeof colors] || Colors.text;
    };

    return (
      <View style={styles.content}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={Colors.text} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search rentals..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#9ca3af"
          />
        </View>

        <FlatList
          data={filteredRentals}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Image source={{ uri: item.itemImage }} style={styles.rentalImage} />
              
              <View style={styles.rentalInfo}>
                <View style={styles.cardHeader}>
                  <View style={styles.flex1}>
                    <Text style={styles.cardName}>{item.itemTitle}</Text>
                    <Text style={styles.cardSubtext}>
                      Renter: {item.renterName}
                    </Text>
                    <Text style={styles.cardSubtext}>
                      Owner: {item.ownerName}
                    </Text>
                  </View>
                  <View style={[
                    styles.badge,
                    { backgroundColor: getStatusColor(item.status) + '20' }
                  ]}>
                    <Text style={[
                      styles.badgeText,
                      { color: getStatusColor(item.status) }
                    ]}>
                      {item.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <Text style={styles.priceText}>${item.totalPrice.toFixed(2)}</Text>
                <Text style={styles.datesText}>
                  {new Date(item.startDate).toLocaleDateString()} - {new Date(item.endDate).toLocaleDateString()}
                </Text>

                {(item.status === 'pending' || item.status === 'approved' || item.status === 'active') && (
                  <TouchableOpacity 
                    style={[styles.fullButton, styles.buttonDanger]}
                    onPress={() => cancelRental(item.id)}
                  >
                    <Ionicons name="close-circle" size={18} color={Colors.white} />
                    <Text style={styles.buttonText}>Cancel Rental</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        />
      </View>
    );
  };

  const renderDisputes = () => {
    const filteredDisputes = disputes.filter(d => {
      const query = searchQuery.toLowerCase();
      const itemName = ((d as any).itemName || (d as any).itemTitle || '').toLowerCase();
      const reporterName = (d.reporterName || '').toLowerCase();
      const accusedName = (d.accusedName || '').toLowerCase();
      return itemName.includes(query) || reporterName.includes(query) || accusedName.includes(query);
    });

    return (
      <View style={styles.content}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={Colors.text} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search disputes..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#9ca3af"
          />
        </View>

        <FlatList
          data={filteredDisputes}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => {
            const itemName = (item as any).itemName || (item as any).itemTitle || 'Unknown Item';
            
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.flex1}>
                    <Text style={styles.cardName}>{itemName}</Text>
                    <Text style={styles.cardSubtext}>
                      {DisputeService.getDisputeTypeLabel(item.type)}
                    </Text>
                  </View>
                  <View style={[
                    styles.badge,
                    { backgroundColor: DisputeService.getDisputeStatusColor(item.status) + '20' }
                  ]}>
                    <Text style={[
                      styles.badgeText,
                      { color: DisputeService.getDisputeStatusColor(item.status) }
                    ]}>
                      {item.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.disputeParties}>
                  <View style={styles.partyRow}>
                    <Ionicons name="flag" size={16} color={Colors.danger} />
                    <Text style={styles.partyText}>Reporter: {item.reporterName}</Text>
                  </View>
                  <View style={styles.partyRow}>
                    <Ionicons name="person" size={16} color={Colors.secondary} />
                    <Text style={styles.partyText}>Accused: {item.accusedName}</Text>
                  </View>
                </View>

                <Text style={styles.disputeDescription} numberOfLines={2}>
                  {item.description}
                </Text>

                {item.estimatedCost && (
                  <Text style={styles.costText}>
                    Estimated Cost: ${item.estimatedCost.toFixed(2)}
                  </Text>
                )}

                {item.damagePhotos.length > 0 && (
                  <View style={styles.photoCount}>
                    <Ionicons name="images" size={16} color={Colors.secondary} />
                    <Text style={styles.photoCountText}>
                      {item.damagePhotos.length} photo(s) attached
                    </Text>
                  </View>
                )}

                <TouchableOpacity 
                  style={[styles.fullButton, styles.buttonAdmin]}
                  onPress={() => updateDisputeStatus(item.id, item)}
                >
                  <Ionicons name="settings" size={18} color={Colors.white} />
                  <Text style={styles.buttonText}>Manage Dispute</Text>
                </TouchableOpacity>
              </View>
            );
          }}
        />
      </View>
    );
  };

  // ==========================================================================
  // PROMO CODES TAB
  // ==========================================================================

  const handleCreatePromo = async () => {
    if (!newPromo.code.trim()) {
      Alert.alert('Error', 'Promo code is required');
      return;
    }
    if (!newPromo.discountValue || isNaN(Number(newPromo.discountValue))) {
      Alert.alert('Error', 'Valid discount value is required');
      return;
    }

    try {
      await PromoCodeService.createPromoCode({
        code: newPromo.code,
        discountType: newPromo.discountType,
        discountValue: parseFloat(newPromo.discountValue),
        maxUses: parseInt(newPromo.maxUses) || 0,
        maxUsesPerUser: parseInt(newPromo.maxUsesPerUser) || 0,
        minRentalAmount: parseFloat(newPromo.minRentalAmount) || 0,
        maxDiscountAmount: parseFloat(newPromo.maxDiscountAmount) || 0,
        expiresAt: newPromo.expiresAt ? Timestamp.fromDate(new Date(newPromo.expiresAt)) : null,
        isActive: true,
        createdBy: user?.id || '',
        description: newPromo.description,
      });

      Alert.alert('Success', `Promo code "${newPromo.code.toUpperCase()}" created!`);
      setShowCreatePromo(false);
      setNewPromo({
        code: '', discountType: 'percent', discountValue: '', maxUses: '0',
        maxUsesPerUser: '1', minRentalAmount: '0', maxDiscountAmount: '0',
        expiresAt: '', description: '',
      });
      await fetchDashboardData();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create promo code');
    }
  };

  const handleTogglePromo = async (promo: PromoCode) => {
    if (!promo.id) return;
    await PromoCodeService.toggleActive(promo.id, !promo.isActive);
    await fetchDashboardData();
  };

  const handleDeletePromo = (promo: PromoCode) => {
    Alert.alert(
      'Delete Promo Code',
      `Delete "${promo.code}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (promo.id) {
              await PromoCodeService.deletePromoCode(promo.id);
              await fetchDashboardData();
            }
          },
        },
      ]
    );
  };

  const renderPromos = () => (
    <ScrollView
      style={styles.scrollView}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Create Button */}
      <TouchableOpacity
        style={[styles.actionButton, { backgroundColor: Colors.admin, marginHorizontal: 16, marginTop: 16, marginBottom: 8, borderRadius: 10, paddingVertical: 14 }]}
        onPress={() => setShowCreatePromo(!showCreatePromo)}
      >
        <Ionicons name={showCreatePromo ? 'close' : 'add'} size={20} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15, marginLeft: 8 }}>
          {showCreatePromo ? 'Cancel' : 'Create Promo Code'}
        </Text>
      </TouchableOpacity>

      {/* Create Form */}
      {showCreatePromo && (
        <View style={[styles.card, { margin: 16, padding: 16 }]}>
          <Text style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 12 }}>New Promo Code</Text>

          <Text style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>Code *</Text>
          <TextInput
            style={[styles.input, { textTransform: 'uppercase' }]}
            value={newPromo.code}
            onChangeText={(v) => setNewPromo({ ...newPromo, code: v.toUpperCase() })}
            placeholder="e.g. WELCOME20"
            autoCapitalize="characters"
          />

          <Text style={{ fontSize: 13, color: '#666', marginBottom: 4, marginTop: 10 }}>Discount Type</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            <TouchableOpacity
              onPress={() => setNewPromo({ ...newPromo, discountType: 'percent' })}
              style={{
                flex: 1, padding: 10, borderRadius: 8, borderWidth: 2, alignItems: 'center',
                borderColor: newPromo.discountType === 'percent' ? Colors.admin : '#ddd',
                backgroundColor: newPromo.discountType === 'percent' ? Colors.admin + '15' : '#fff',
              }}
            >
              <Text style={{ fontWeight: newPromo.discountType === 'percent' ? 'bold' : '500' }}>Percentage (%)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setNewPromo({ ...newPromo, discountType: 'flat' })}
              style={{
                flex: 1, padding: 10, borderRadius: 8, borderWidth: 2, alignItems: 'center',
                borderColor: newPromo.discountType === 'flat' ? Colors.admin : '#ddd',
                backgroundColor: newPromo.discountType === 'flat' ? Colors.admin + '15' : '#fff',
              }}
            >
              <Text style={{ fontWeight: newPromo.discountType === 'flat' ? 'bold' : '500' }}>Flat Amount ($)</Text>
            </TouchableOpacity>
          </View>

          <Text style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>
            Discount Value {newPromo.discountType === 'percent' ? '(%)' : '($)'} *
          </Text>
          <TextInput
            style={styles.input}
            value={newPromo.discountValue}
            onChangeText={(v) => setNewPromo({ ...newPromo, discountValue: v })}
            placeholder={newPromo.discountType === 'percent' ? 'e.g. 20' : 'e.g. 5.00'}
            keyboardType="numeric"
          />

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>Max Total Uses (0=unlimited)</Text>
              <TextInput style={styles.input} value={newPromo.maxUses} onChangeText={(v) => setNewPromo({ ...newPromo, maxUses: v })} keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>Max Per User (0=unlimited)</Text>
              <TextInput style={styles.input} value={newPromo.maxUsesPerUser} onChangeText={(v) => setNewPromo({ ...newPromo, maxUsesPerUser: v })} keyboardType="numeric" />
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>Min Rental Amount ($)</Text>
              <TextInput style={styles.input} value={newPromo.minRentalAmount} onChangeText={(v) => setNewPromo({ ...newPromo, minRentalAmount: v })} keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>Max Discount Cap ($)</Text>
              <TextInput style={styles.input} value={newPromo.maxDiscountAmount} onChangeText={(v) => setNewPromo({ ...newPromo, maxDiscountAmount: v })} keyboardType="numeric" />
            </View>
          </View>

          <Text style={{ fontSize: 13, color: '#666', marginBottom: 4, marginTop: 10 }}>Description (internal)</Text>
          <TextInput
            style={styles.input}
            value={newPromo.description}
            onChangeText={(v) => setNewPromo({ ...newPromo, description: v })}
            placeholder="e.g. Launch promo for early users"
          />

          <TouchableOpacity
            style={{ backgroundColor: Colors.success, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 16 }}
            onPress={handleCreatePromo}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Create Promo Code</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Promo Code List */}
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>
          {promoCodes.length} promo code{promoCodes.length !== 1 ? 's' : ''}
        </Text>

        {promoCodes.length === 0 ? (
          <View style={[styles.card, { padding: 24, alignItems: 'center' }]}>
            <Ionicons name="pricetag-outline" size={40} color="#ccc" />
            <Text style={{ color: '#999', marginTop: 8 }}>No promo codes yet</Text>
          </View>
        ) : (
          promoCodes
            .sort((a, b) => (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0))
            .map((promo) => (
            <View key={promo.id} style={[styles.card, { padding: 14, marginBottom: 10, opacity: promo.isActive ? 1 : 0.6 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 17, fontWeight: 'bold', color: Colors.text }}>{promo.code}</Text>
                    <View style={{
                      backgroundColor: promo.isActive ? '#C6F6D5' : '#FED7D7',
                      borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2,
                    }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: promo.isActive ? Colors.success : Colors.danger }}>
                        {promo.isActive ? 'Active' : 'Inactive'}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 14, color: Colors.secondary, fontWeight: '600', marginTop: 4 }}>
                    {promo.discountType === 'percent' ? `${promo.discountValue}% off` : `$${promo.discountValue.toFixed(2)} off`}
                    {promo.maxDiscountAmount > 0 ? ` (max $${promo.maxDiscountAmount})` : ''}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                    Used {promo.currentUses}/{promo.maxUses || '∞'}
                    {promo.minRentalAmount > 0 ? ` • Min $${promo.minRentalAmount}` : ''}
                    {promo.description ? ` • ${promo.description}` : ''}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={() => handleTogglePromo(promo)}>
                    <Ionicons name={promo.isActive ? 'pause-circle' : 'play-circle'} size={28} color={promo.isActive ? Colors.warning : Colors.success} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeletePromo(promo)}>
                    <Ionicons name="trash-outline" size={24} color={Colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.admin} />
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
      );
    }

    switch (activeTab) {
      case 'overview':
        return renderOverview();
      case 'users':
        return renderUsers();
      case 'items':
        return renderItems();
      case 'rentals':
        return renderRentals();
      case 'disputes':
        return renderDisputes();
      case 'promos':
        return renderPromos();
      default:
        return renderOverview();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Navigation Bar */}
      <View style={styles.topNav}>
        <TouchableOpacity
          style={styles.navBackButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.admin} />
          <Text style={styles.navBackText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navHomeButton}
          onPress={() => navigation.navigate('MainTabs')}
        >
          <Ionicons name="home" size={24} color={Colors.admin} />
          <Text style={styles.navHomeText}>Home</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Admin Dashboard</Text>
        <Text style={styles.headerSubtitle}>Manage your rental platform</Text>
      </View>

      {renderContent()}

      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => {
            setActiveTab('overview');
            setSearchQuery('');
          }}
        >
          <Ionicons 
            name={activeTab === 'overview' ? 'stats-chart' : 'stats-chart-outline'} 
            size={24} 
            color={activeTab === 'overview' ? Colors.admin : Colors.text} 
          />
          <Text style={[styles.navText, activeTab === 'overview' && styles.navTextActive]}>
            Overview
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => {
            setActiveTab('users');
            setSearchQuery('');
          }}
        >
          <Ionicons 
            name={activeTab === 'users' ? 'people' : 'people-outline'} 
            size={24} 
            color={activeTab === 'users' ? Colors.admin : Colors.text} 
          />
          <Text style={[styles.navText, activeTab === 'users' && styles.navTextActive]}>
            Users
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => {
            setActiveTab('items');
            setSearchQuery('');
          }}
        >
          <Ionicons 
            name={activeTab === 'items' ? 'cube' : 'cube-outline'} 
            size={24} 
            color={activeTab === 'items' ? Colors.admin : Colors.text} 
          />
          <Text style={[styles.navText, activeTab === 'items' && styles.navTextActive]}>
            Items
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => {
            setActiveTab('rentals');
            setSearchQuery('');
          }}
        >
          <Ionicons 
            name={activeTab === 'rentals' ? 'briefcase' : 'briefcase-outline'} 
            size={24} 
            color={activeTab === 'rentals' ? Colors.admin : Colors.text} 
          />
          <Text style={[styles.navText, activeTab === 'rentals' && styles.navTextActive]}>
            Rentals
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => {
            setActiveTab('disputes');
            setSearchQuery('');
          }}
        >
          <Ionicons 
            name={activeTab === 'disputes' ? 'alert-circle' : 'alert-circle-outline'} 
            size={24} 
            color={activeTab === 'disputes' ? Colors.admin : Colors.text} 
          />
          <Text style={[styles.navText, activeTab === 'disputes' && styles.navTextActive]}>
            Disputes
          </Text>
          {stats.openDisputes > 0 && (
            <View style={styles.badge_notification}>
              <Text style={styles.badgeNotificationText}>{stats.openDisputes}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => {
            setActiveTab('promos');
            setSearchQuery('');
          }}
        >
          <Ionicons 
            name={activeTab === 'promos' ? 'pricetag' : 'pricetag-outline'} 
            size={24} 
            color={activeTab === 'promos' ? Colors.admin : Colors.text} 
          />
          <Text style={[styles.navText, activeTab === 'promos' && styles.navTextActive]}>
            Promos
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  navBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  navBackText: {
    fontSize: 16,
    color: Colors.admin,
    fontWeight: '600',
  },
  navHomeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  navHomeText: {
    fontSize: 16,
    color: Colors.admin,
    fontWeight: '600',
  },
  header: {
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    padding: 20,
    paddingTop: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.text,
    opacity: 0.7,
    marginTop: 4,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: Colors.text,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statCard: {
    width: '48%',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.white,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 14,
    color: Colors.white,
    marginTop: 4,
    opacity: 0.9,
  },
  revenueCard: {
    backgroundColor: Colors.white,
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  revenueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  revenueLabel: {
    fontSize: 16,
    color: Colors.text,
    marginLeft: 8,
    fontWeight: '600',
  },
  revenueValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: Colors.success,
    marginVertical: 8,
  },
  revenueSubtext: {
    fontSize: 14,
    color: Colors.text,
    opacity: 0.6,
  },
  quickStatsCard: {
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  borderTop: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  statRowLabel: {
    fontSize: 14,
    color: Colors.text,
  },
  statRowValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  // NEW MIGRATION STYLES
  migrationButton: {
    borderWidth: 2,
    borderColor: Colors.admin,
    borderRadius: 12,
    marginBottom: 12,
  },
  migrationButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  migrationButtonText: {
    flex: 1,
    marginLeft: 12,
  },
  migrationButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  migrationButtonSubtitle: {
    fontSize: 13,
    color: Colors.text,
    opacity: 0.7,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: Colors.secondary + '15',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: Colors.secondary,
    lineHeight: 18,
  },
  searchBar: {
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    color: Colors.text,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  flex1: {
    flex: 1,
  },
  cardName: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  cardSubtext: {
    fontSize: 14,
    color: Colors.text,
    opacity: 0.7,
    marginTop: 2,
  },
  adminBadgeSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.admin + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  adminBadgeText: {
    fontSize: 12,
    color: Colors.admin,
    fontWeight: '600',
    marginLeft: 4,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  },
  badgeSuccess: {
    backgroundColor: Colors.success + '20',
  },
  badgeDanger: {
    backgroundColor: Colors.danger + '20',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  badgeTextSuccess: {
    color: Colors.success,
  },
  badgeTextDanger: {
    color: Colors.danger,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  buttonAdmin: {
    backgroundColor: Colors.admin,
  },
  buttonWarning: {
    backgroundColor: Colors.warning,
  },
  buttonDanger: {
    backgroundColor: Colors.danger,
  },
  buttonText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  fullButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
    marginTop: 12,
  },
  itemImage: {
    width: '100%',
    height: 150,
    backgroundColor: Colors.background,
  },
  itemInfo: {
    padding: 16,
  },
  priceText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  rentalImage: {
    width: '100%',
    height: 120,
    backgroundColor: Colors.background,
  },
  rentalInfo: {
    padding: 16,
  },
  datesText: {
    fontSize: 14,
    color: Colors.text,
    opacity: 0.7,
  },
  disputeParties: {
    marginBottom: 12,
  },
  partyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  partyText: {
    fontSize: 14,
    color: Colors.text,
  },
  disputeDescription: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
    marginBottom: 8,
  },
  costText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: Colors.danger,
    marginBottom: 8,
  },
  photoCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  photoCountText: {
    fontSize: 14,
    color: Colors.secondary,
    fontWeight: '600',
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingVertical: 8,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    position: 'relative',
  },
  navText: {
    fontSize: 12,
    color: Colors.text,
    marginTop: 4,
  },
  navTextActive: {
    color: Colors.admin,
    fontWeight: '600',
  },
  badge_notification: {
    position: 'absolute',
    top: 4,
    right: 8,
    backgroundColor: Colors.danger,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeNotificationText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: 'bold',
  },
});
