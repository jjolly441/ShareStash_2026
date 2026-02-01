// src/screens/ProfileScreen.tsx
// UPDATED: Added verification status section and prompts
// UPDATED: Added VerificationTestHelper for testing (REMOVE BEFORE PRODUCTION)
import React, { useContext, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../contexts/AuthContext';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation';
import NotificationService from '../services/NotificationService';
import { ReviewService, ReviewStats } from '../services/ReviewService';
import {
  VerificationService,
  VerificationStatus,
} from '../services/VerificationService';

// ⚠️ TEST HELPER - REMOVE BEFORE PRODUCTION
import VerificationTestHelper from '../components/VerificationTestHelper';

// ============================================================================
// CONSTANTS
// ============================================================================

const Colors = {
  primary: '#F5C542',
  secondary: '#2E86AB',
  success: '#4CAF50',
  background: '#F8F9FA',
  text: '#212529',
  white: '#FFFFFF',
  border: '#E9ECEF',
  danger: '#DC3545',
  admin: '#8b5cf6',
  warning: '#FF9800',
  info: '#2196F3',
};

type ProfileScreenNavigationProp = StackNavigationProp<RootStackParamList>;

// ============================================================================
// COMPONENTS
// ============================================================================

/**
 * Star Rating Display Component
 */
const StarRating = ({
  rating,
  size = 16,
}: {
  rating: number;
  size?: number;
}) => (
  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
    {[1, 2, 3, 4, 5].map((star) => (
      <Ionicons
        key={star}
        name={star <= rating ? 'star' : 'star-outline'}
        size={size}
        color={Colors.primary}
        style={{ marginRight: 2 }}
      />
    ))}
  </View>
);

/**
 * Verification Badge Component
 */
const VerificationBadge = ({
  status,
}: {
  status: VerificationStatus | null;
}) => {
  if (!status) return null;

  const getBadgeConfig = () => {
    if (status.verificationStatus === 'fully_verified') {
      return {
        icon: 'shield-checkmark',
        text: 'Fully Verified',
        color: Colors.success,
        bgColor: Colors.success + '20',
      };
    } else if (status.verificationStatus === 'phone_verified') {
      return {
        icon: 'phone-portrait',
        text: 'Phone Verified',
        color: Colors.info,
        bgColor: Colors.info + '20',
      };
    } else if (status.verificationStatus === 'rejected') {
      return {
        icon: 'close-circle',
        text: 'Verification Failed',
        color: Colors.danger,
        bgColor: Colors.danger + '20',
      };
    }
    return null;
  };

  const config = getBadgeConfig();
  if (!config) return null;

  return (
    <View
      style={[
        styles.verificationBadge,
        { backgroundColor: config.bgColor },
      ]}
    >
      <Ionicons name={config.icon as any} size={14} color={config.color} />
      <Text style={[styles.verificationBadgeText, { color: config.color }]}>
        {config.text}
      </Text>
    </View>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ProfileScreen() {
  const { user, logout, refreshUser } = useContext(AuthContext);
  const navigation = useNavigation<ProfileScreenNavigationProp>();

  // State
  const [unreadCount, setUnreadCount] = useState(0);
  const [userStats, setUserStats] = useState<ReviewStats | null>(null);
  const [verificationStatus, setVerificationStatus] =
    useState<VerificationStatus | null>(null);
  const [loadingVerification, setLoadingVerification] = useState(true);

  // ==========================================================================
  // DATA LOADING
  // ==========================================================================

  const loadUnreadCount = async () => {
    if (!user) return;
    try {
      const count = await NotificationService.getUnreadCount(user.id);
      setUnreadCount(count);
    } catch (error) {
      console.error('Error loading unread count:', error);
    }
  };

  const loadUserRating = async () => {
    if (!user) return;
    try {
      const stats = await ReviewService.getUserStats(user.id);
      setUserStats(stats);
    } catch (error) {
      console.error('Error loading user rating:', error);
    }
  };

  const loadVerificationStatus = async () => {
    if (!user) return;
    setLoadingVerification(true);
    try {
      const status = await VerificationService.getUserVerificationStatus(
        user.id
      );
      setVerificationStatus(status);
    } catch (error) {
      console.error('Error loading verification status:', error);
    } finally {
      setLoadingVerification(false);
    }
  };

  // Reload data when screen is focused
  useFocusEffect(
    React.useCallback(() => {
      loadUnreadCount();
      loadUserRating();
      loadVerificationStatus();
    }, [user])
  );

  useEffect(() => {
    loadUnreadCount();
    loadUserRating();
    loadVerificationStatus();
  }, []);

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: logout,
      },
    ]);
  };

  const handleVerifyIdentity = () => {
    navigation.navigate('VerifyIdentity');
  };

  const handleVerifyPhone = () => {
    // Phone verification is deferred to native builds
    Alert.alert(
      'Coming Soon',
      'Phone verification will be available in the next update. Identity verification is currently available.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Verify Identity Instead',
          onPress: handleVerifyIdentity,
        },
      ]
    );
  };

  // ==========================================================================
  // COMPUTED VALUES
  // ==========================================================================

  const averageRating = userStats?.averageRating || 0;
  const totalReviews = userStats?.totalReviews || 0;
  const isFullyVerified =
    verificationStatus?.verificationStatus === 'fully_verified';
  const isPhoneVerified = verificationStatus?.phoneVerified || false;
  const needsVerification = !isFullyVerified;

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with Notification Bell */}
      <View style={styles.topHeader}>
        <Text style={styles.topHeaderTitle}>Profile</Text>
        <TouchableOpacity
          style={styles.notificationButton}
          onPress={() => navigation.navigate('Notifications')}
        >
          <Ionicons
            name="notifications-outline"
            size={28}
            color={Colors.text}
          />
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          {/* ============================================================== */}
          {/* ⚠️ TEST HELPER - REMOVE BEFORE PRODUCTION ⚠️ */}
          {/* ============================================================== */}
          <VerificationTestHelper />

          {/* User Info Header */}
          <View style={styles.header}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={40} color={Colors.text} />
              {isFullyVerified && (
                <View style={styles.verifiedCheckmark}>
                  <Ionicons
                    name="checkmark-circle"
                    size={24}
                    color={Colors.success}
                  />
                </View>
              )}
            </View>
            <Text style={styles.name}>
              {user ? `${user.firstName} ${user.lastName}` : 'User'}
            </Text>
            <Text style={styles.email}>{user?.email}</Text>

            {/* Verification Badge */}
            <VerificationBadge status={verificationStatus} />

            {/* User Rating Display */}
            {totalReviews > 0 && (
              <View style={styles.ratingContainer}>
                <StarRating rating={averageRating} size={18} />
                <Text style={styles.ratingText}>
                  {averageRating.toFixed(1)} · {totalReviews}{' '}
                  {totalReviews === 1 ? 'review' : 'reviews'}
                </Text>
              </View>
            )}

            {/* Admin Badge */}
            {user?.role === 'admin' && (
              <View style={styles.adminBadge}>
                <Ionicons
                  name="shield-checkmark"
                  size={16}
                  color={Colors.white}
                />
                <Text style={styles.adminBadgeText}>Admin</Text>
              </View>
            )}
          </View>

          {/* ================================================================ */}
          {/* VERIFICATION SECTION - NEW */}
          {/* ================================================================ */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Verification Status</Text>

            {loadingVerification ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.loadingText}>
                  Loading verification status...
                </Text>
              </View>
            ) : (
              <>
                {/* Fully Verified Card */}
                {isFullyVerified ? (
                  <View style={styles.verifiedCard}>
                    <View style={styles.verifiedCardHeader}>
                      <Ionicons
                        name="shield-checkmark"
                        size={32}
                        color={Colors.success}
                      />
                      <View style={styles.verifiedCardText}>
                        <Text style={styles.verifiedCardTitle}>
                          Fully Verified
                        </Text>
                        <Text style={styles.verifiedCardSubtitle}>
                          Your identity has been verified
                        </Text>
                      </View>
                    </View>
                    <View style={styles.verifiedBenefits}>
                      <View style={styles.benefitItem}>
                        <Ionicons
                          name="checkmark"
                          size={16}
                          color={Colors.success}
                        />
                        <Text style={styles.benefitText}>
                          Can list items for rent
                        </Text>
                      </View>
                      <View style={styles.benefitItem}>
                        <Ionicons
                          name="checkmark"
                          size={16}
                          color={Colors.success}
                        />
                        <Text style={styles.benefitText}>
                          Can rent high-value items ($500+)
                        </Text>
                      </View>
                      <View style={styles.benefitItem}>
                        <Ionicons
                          name="checkmark"
                          size={16}
                          color={Colors.success}
                        />
                        <Text style={styles.benefitText}>
                          Verified badge on profile
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  /* Verification Needed Card */
                  <View style={styles.verificationNeededCard}>
                    <View style={styles.verificationNeededHeader}>
                      <Ionicons
                        name="shield-outline"
                        size={32}
                        color={Colors.warning}
                      />
                      <View style={styles.verificationNeededText}>
                        <Text style={styles.verificationNeededTitle}>
                          Verification Incomplete
                        </Text>
                        <Text style={styles.verificationNeededSubtitle}>
                          Complete verification to unlock all features
                        </Text>
                      </View>
                    </View>

                    {/* Benefits Preview */}
                    <View style={styles.benefitsPreview}>
                      <Text style={styles.benefitsPreviewTitle}>
                        With verification you can:
                      </Text>
                      <View style={styles.benefitItem}>
                        <Ionicons
                          name="add-circle-outline"
                          size={16}
                          color={Colors.text}
                        />
                        <Text style={styles.benefitText}>
                          List your items for rent
                        </Text>
                      </View>
                      <View style={styles.benefitItem}>
                        <Ionicons
                          name="diamond-outline"
                          size={16}
                          color={Colors.text}
                        />
                        <Text style={styles.benefitText}>
                          Rent high-value items ($500+)
                        </Text>
                      </View>
                      <View style={styles.benefitItem}>
                        <Ionicons
                          name="ribbon-outline"
                          size={16}
                          color={Colors.text}
                        />
                        <Text style={styles.benefitText}>
                          Get a verified badge
                        </Text>
                      </View>
                    </View>

                    {/* Verify Identity Button */}
                    <TouchableOpacity
                      style={styles.verifyButton}
                      onPress={handleVerifyIdentity}
                    >
                      <Ionicons
                        name="shield-checkmark"
                        size={20}
                        color={Colors.text}
                      />
                      <Text style={styles.verifyButtonText}>
                        Verify Your Identity
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color={Colors.text}
                      />
                    </TouchableOpacity>
                  </View>
                )}

                {/* Verification Status Details */}
                <View style={styles.verificationDetails}>
                  <View style={styles.verificationDetailRow}>
                    <View style={styles.verificationDetailLeft}>
                      <Ionicons
                        name="card-outline"
                        size={20}
                        color={
                          verificationStatus?.identityVerified
                            ? Colors.success
                            : Colors.text
                        }
                      />
                      <Text style={styles.verificationDetailText}>
                        Identity Verification
                      </Text>
                    </View>
                    {verificationStatus?.identityVerified ? (
                      <View style={styles.statusVerified}>
                        <Ionicons
                          name="checkmark-circle"
                          size={18}
                          color={Colors.success}
                        />
                        <Text style={styles.statusVerifiedText}>Verified</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.statusNotVerified}
                        onPress={handleVerifyIdentity}
                      >
                        <Text style={styles.statusNotVerifiedText}>
                          Verify Now
                        </Text>
                        <Ionicons
                          name="chevron-forward"
                          size={16}
                          color={Colors.primary}
                        />
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={styles.verificationDetailRow}>
                    <View style={styles.verificationDetailLeft}>
                      <Ionicons
                        name="phone-portrait-outline"
                        size={20}
                        color={
                          verificationStatus?.phoneVerified
                            ? Colors.success
                            : Colors.text
                        }
                      />
                      <Text style={styles.verificationDetailText}>
                        Phone Verification
                      </Text>
                    </View>
                    {verificationStatus?.phoneVerified ? (
                      <View style={styles.statusVerified}>
                        <Ionicons
                          name="checkmark-circle"
                          size={18}
                          color={Colors.success}
                        />
                        <Text style={styles.statusVerifiedText}>Verified</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.statusNotVerified}
                        onPress={handleVerifyPhone}
                      >
                        <Text style={styles.statusNotVerifiedText}>
                          Coming Soon
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </>
            )}
          </View>

          {/* Admin Dashboard Button */}
          {user?.role === 'admin' && (
            <View style={styles.section}>
              <TouchableOpacity
                style={styles.adminButton}
                onPress={() => navigation.navigate('AdminDashboard')}
              >
                <View style={styles.adminButtonContent}>
                  <Ionicons name="shield" size={24} color={Colors.white} />
                  <View style={styles.adminButtonText}>
                    <Text style={styles.adminButtonTitle}>Admin Dashboard</Text>
                    <Text style={styles.adminButtonSubtitle}>
                      Manage users, items & rentals
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={Colors.white}
                  />
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* Account Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account</Text>

            <TouchableOpacity style={styles.menuItem}>
              <Ionicons name="person-outline" size={24} color={Colors.text} />
              <Text style={styles.menuText}>Edit Profile</Text>
              <Ionicons name="chevron-forward" size={20} color={Colors.text} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem}>
              <Ionicons name="list-outline" size={24} color={Colors.text} />
              <Text style={styles.menuText}>My Items</Text>
              <Ionicons name="chevron-forward" size={20} color={Colors.text} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem}>
              <Ionicons name="time-outline" size={24} color={Colors.text} />
              <Text style={styles.menuText}>Rental History</Text>
              <Ionicons name="chevron-forward" size={20} color={Colors.text} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('MyDisputes')}
            >
              <Ionicons
                name="alert-circle-outline"
                size={24}
                color={Colors.text}
              />
              <Text style={styles.menuText}>My Disputes</Text>
              <Ionicons name="chevron-forward" size={20} color={Colors.text} />
            </TouchableOpacity>
          </View>

          {/* Payments Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payments</Text>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('PaymentMethods')}
            >
              <Ionicons name="card-outline" size={24} color={Colors.text} />
              <Text style={styles.menuText}>Payment Methods</Text>
              <Ionicons name="chevron-forward" size={20} color={Colors.text} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('Earnings')}
            >
              <Ionicons name="cash-outline" size={24} color={Colors.text} />
              <Text style={styles.menuText}>My Earnings</Text>
              <Ionicons name="chevron-forward" size={20} color={Colors.text} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem}>
              <Ionicons name="receipt-outline" size={24} color={Colors.text} />
              <Text style={styles.menuText}>Transaction History</Text>
              <Ionicons name="chevron-forward" size={20} color={Colors.text} />
            </TouchableOpacity>
          </View>

          {/* Support Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Support</Text>

            <TouchableOpacity style={styles.menuItem}>
              <Ionicons
                name="help-circle-outline"
                size={24}
                color={Colors.text}
              />
              <Text style={styles.menuText}>Help Center</Text>
              <Ionicons name="chevron-forward" size={20} color={Colors.text} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem}>
              <Ionicons
                name="shield-checkmark-outline"
                size={24}
                color={Colors.text}
              />
              <Text style={styles.menuText}>Privacy Policy</Text>
              <Ionicons name="chevron-forward" size={20} color={Colors.text} />
            </TouchableOpacity>
          </View>

          {/* Logout Button */}
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={24} color={Colors.danger} />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
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
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  topHeaderTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
  },
  notificationButton: {
    padding: 4,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: Colors.danger,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
    paddingVertical: 20,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    position: 'relative',
  },
  verifiedCheckmark: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: Colors.white,
    borderRadius: 12,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  email: {
    fontSize: 16,
    color: Colors.text,
    opacity: 0.7,
    marginBottom: 8,
  },
  verificationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 8,
    gap: 6,
  },
  verificationBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ratingText: {
    marginLeft: 8,
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.admin,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 8,
  },
  adminBadgeText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 16,
  },
  // Verification Section Styles
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 10,
  },
  loadingText: {
    color: Colors.text,
    opacity: 0.7,
  },
  verifiedCard: {
    backgroundColor: Colors.success + '15',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.success + '30',
  },
  verifiedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  verifiedCardText: {
    flex: 1,
  },
  verifiedCardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.success,
  },
  verifiedCardSubtitle: {
    fontSize: 14,
    color: Colors.text,
    opacity: 0.7,
  },
  verifiedBenefits: {
    gap: 8,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  benefitText: {
    fontSize: 14,
    color: Colors.text,
  },
  verificationNeededCard: {
    backgroundColor: Colors.warning + '15',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.warning + '30',
  },
  verificationNeededHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  verificationNeededText: {
    flex: 1,
  },
  verificationNeededTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.warning,
  },
  verificationNeededSubtitle: {
    fontSize: 14,
    color: Colors.text,
    opacity: 0.7,
  },
  benefitsPreview: {
    marginBottom: 16,
    gap: 8,
  },
  benefitsPreviewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  verifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 8,
  },
  verifyButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  verificationDetails: {
    marginTop: 16,
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  verificationDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  verificationDetailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  verificationDetailText: {
    fontSize: 15,
    color: Colors.text,
  },
  statusVerified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusVerifiedText: {
    fontSize: 14,
    color: Colors.success,
    fontWeight: '500',
  },
  statusNotVerified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusNotVerifiedText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '500',
  },
  // Admin Button Styles
  adminButton: {
    backgroundColor: Colors.admin,
    borderRadius: 12,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  adminButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  adminButtonText: {
    flex: 1,
    marginLeft: 12,
  },
  adminButtonTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.white,
    marginBottom: 2,
  },
  adminButtonSubtitle: {
    fontSize: 13,
    color: Colors.white,
    opacity: 0.9,
  },
  // Menu Item Styles
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: Colors.white,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  menuText: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
    marginLeft: 12,
  },
  // Logout Button Styles
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: Colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.danger,
    marginTop: 20,
    marginBottom: 40,
  },
  logoutText: {
    fontSize: 16,
    color: Colors.danger,
    fontWeight: '600',
    marginLeft: 8,
  },
});