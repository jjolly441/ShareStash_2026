// src/screens/RentalsScreen.tsx - FIXED ALL TYPESCRIPT ERRORS
import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { RentalService, Rental } from '../services/RentalService';
import { ReviewService } from '../services/ReviewService';
import { RefundService } from '../services/RefundService';
import { AuthContext } from '../contexts/AuthContext';

const Colors = {
  primary: '#F5C542',
  secondary: '#2E86AB',
  success: '#46A758',
  warning: '#F59E0B',
  background: '#F8F9FA',
  text: '#212529',
  white: '#FFFFFF',
  border: '#E9ECEF',
  blue: '#3B82F6',
  danger: '#DC3545',
};

type Tab = 'requests' | 'myRentals' | 'history';

// Helper functions for status
const getStatusColor = (status: string): string => {
  switch (status) {
    case 'pending': return Colors.warning;
    case 'approved': return Colors.blue;
    case 'active': return Colors.success;
    case 'completed': return Colors.success;
    case 'declined': return Colors.danger;
    case 'cancelled': return Colors.danger;
    default: return Colors.text;
  }
};

const getStatusLabel = (status: string): string => {
  switch (status) {
    case 'pending': return 'Pending';
    case 'approved': return 'Approved';
    case 'active': return 'Active';
    case 'completed': return 'Completed';
    case 'declined': return 'Declined';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
};

export default function RentalsScreen() {
  const [selectedTab, setSelectedTab] = useState<Tab>('requests');
  const [rentalRequests, setRentalRequests] = useState<Rental[]>([]);
  const [myRentals, setMyRentals] = useState<Rental[]>([]);
  const [history, setHistory] = useState<Rental[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [reviewedRentals, setReviewedRentals] = useState<Set<string>>(new Set());
  const { user } = useContext(AuthContext);
  const navigation = useNavigation();

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    try {
      // Rental requests I've received (as owner) - including approved and active
      const ownerRentals = await RentalService.getOwnerRentals(user.id);
      const activeOwnerRequests = ownerRentals.filter((r: Rental) => 
        r.status === 'pending' || r.status === 'approved' || r.status === 'active'
      );
      setRentalRequests(activeOwnerRequests);

      // My active rentals (as renter)
      const renterRentals = await RentalService.getRenterRentals(user.id);
      const active = renterRentals.filter((r: Rental) => 
        r.status === 'pending' || r.status === 'approved' || r.status === 'active'
      );
      setMyRentals(active);

      // History (both as renter and owner)
      const renterHistory = renterRentals.filter((r: Rental) => 
        r.status === 'completed' || r.status === 'declined' || r.status === 'cancelled'
      );
      const ownerHistory = ownerRentals.filter((r: Rental) => 
        r.status === 'completed' || r.status === 'declined' || r.status === 'cancelled'
      );
      setHistory([...renterHistory, ...ownerHistory]);

      // Check which rentals have been reviewed
      await checkReviewedRentals([...renterHistory, ...ownerHistory]);
    } catch (error) {
      console.error('Error loading rentals:', error);
    }
  };

  const checkReviewedRentals = async (rentals: Rental[]) => {
    if (!user) return;

    const reviewed = new Set<string>();
    
    for (const rental of rentals) {
      if (rental.status === 'completed' && rental.id) {
        // Check if user has already reviewed this rental
        const itemReview = await ReviewService.getReviewByRental(rental.id, user.id, 'item');
        const userReview = await ReviewService.getReviewByRental(rental.id, user.id, 'user');
        
        // Mark as reviewed if either review exists
        if (itemReview || userReview) {
          reviewed.add(rental.id);
        }
      }
    }
    
    setReviewedRentals(reviewed);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleApprove = async (rental: Rental) => {
    Alert.alert(
      'Approve Request',
      `Approve rental request from ${rental.renterName}?\n\nThey will be notified to complete payment.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            try {
              await RentalService.approveRental(rental.id!);
              Alert.alert(
                'Success', 
                'Rental request approved! The renter will be notified to complete payment.'
              );
              loadData();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to approve');
            }
          }
        }
      ]
    );
  };

  const handleDecline = async (rental: Rental) => {
    Alert.alert(
      'Decline Request',
      `Decline rental request from ${rental.renterName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            try {
              await RentalService.declineRental(rental.id!);
              Alert.alert('Declined', 'Rental request declined');
              loadData();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to decline');
            }
          }
        }
      ]
    );
  };

  const handlePayNow = (rental: Rental) => {
    (navigation as any).navigate('Checkout', { rentalId: rental.id });
  };

  const handleCompleteRental = async (rental: Rental) => {
    Alert.alert(
      'Complete Rental',
      'Mark this rental as completed? This will trigger the payout to your account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async () => {
            try {
              await RentalService.completeRental(rental.id!);
              Alert.alert(
                'Success', 
                'Rental completed! Payout has been processed to your connected bank account.'
              );
              loadData();
            } catch (error: any) {
              console.error('Complete rental error:', error);
              Alert.alert('Error', error.message || 'Failed to complete rental');
            }
          }
        }
      ]
    );
  };

  const handleReportIssue = (rental: Rental) => {
    if (!user) return;
    const userRole = user.id === rental.ownerId ? 'owner' : 'renter';
    (navigation as any).navigate('ReportDamage', {
      rentalId: rental.id,
      itemId: rental.itemId,
      itemName: rental.itemName,
      ownerId: rental.ownerId,
      ownerName: rental.ownerName,
      renterId: rental.renterId,
      renterName: rental.renterName,
      userRole: userRole,
    });
  };

  const handleLeaveReview = (rental: Rental) => {
    (navigation as any).navigate('CreateReview', { rentalId: rental.id });
  };

  const handleCancelRental = async (rental: Rental) => {
    if (!user) return;

    // Calculate hours until rental starts
    const startDate = (rental.startDate as any)?.toDate 
      ? (rental.startDate as any).toDate() 
      : new Date(rental.startDate as any);
    const now = new Date();
    const hoursUntilStart = (startDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    // Check if cancellation is allowed (24 hours before start)
    if (hoursUntilStart < 24) {
      Alert.alert(
        'Cannot Cancel',
        'Rentals can only be cancelled more than 24 hours before the start date.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Confirm cancellation
    Alert.alert(
      'Cancel Rental',
      `Are you sure you want to cancel this rental? You will receive a full refund of $${rental.totalPrice.toFixed(2)}.`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await RefundService.cancelRentalWithRefund(
                rental.id!,
                user.id,
                `${user.firstName} ${user.lastName}`,
                'Cancelled by renter'
              );

              if (result.success) {
                Alert.alert(
                  'Rental Cancelled',
                  'Your rental has been cancelled and a full refund has been initiated. The refund will be processed within 5-10 business days.',
                  [{ text: 'OK' }]
                );
                loadData(); // Refresh the list
              } else {
                Alert.alert('Error', result.error || 'Failed to cancel rental');
              }
            } catch (error) {
              console.error('Error cancelling rental:', error);
              Alert.alert('Error', 'Failed to cancel rental. Please try again.');
            }
          },
        },
      ]
    );
  };

  const formatDate = (date: Date | any) => {
    const d = (date as any)?.toDate ? (date as any).toDate() : new Date(date);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const calculateDays = (startDate: Date | any, endDate: Date | any): number => {
    const start = (startDate as any)?.toDate ? (startDate as any).toDate() : new Date(startDate);
    const end = (endDate as any)?.toDate ? (endDate as any).toDate() : new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays || 1;
  };

  const renderRentalCard = (rental: Rental, showOwnerActions: boolean = false) => {
    if (!user) return null;
    
    const isOwner = user.id === rental.ownerId;
    const needsPayment = rental.status === 'approved' && rental.paymentStatus === 'unpaid';
    const totalDays = calculateDays(rental.startDate, rental.endDate);
    const hasReviewed = rental.id ? reviewedRentals.has(rental.id) : false;
    const canLeaveReview = rental.status === 'completed' && !hasReviewed;

    // Calculate if cancel button should show
    const canCancel = (() => {
      if (rental.status !== 'approved') return false;
      const startDate = (rental.startDate as any)?.toDate 
        ? (rental.startDate as any).toDate() 
        : new Date(rental.startDate as any);
      const now = new Date();
      const hoursUntilStart = (startDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      return hoursUntilStart >= 24;
    })();

    return (
      <View key={rental.id} style={styles.rentalCard}>
        {rental.itemImage && (
          <Image source={{ uri: rental.itemImage }} style={styles.itemImage} />
        )}
        
        <View style={styles.rentalInfo}>
          <Text style={styles.itemTitle}>{rental.itemName}</Text>
          
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(rental.status) + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(rental.status) }]}>
              {rental.status === 'approved' && needsPayment && !isOwner
                ? 'Payment Required'
                : getStatusLabel(rental.status)}
            </Text>
          </View>

          <Text style={styles.personName}>
            {showOwnerActions ? `Requested by: ${rental.renterName}` : isOwner ? `Rented to: ${rental.renterName}` : `Owner: ${rental.ownerName}`}
          </Text>

          <View style={styles.datesRow}>
            <Ionicons name="calendar-outline" size={16} color={Colors.text} />
            <Text style={styles.datesText}>
              {formatDate(rental.startDate)} - {formatDate(rental.endDate)}
            </Text>
          </View>

          <Text style={styles.priceText}>
            ${rental.totalPrice} total ({totalDays} {totalDays === 1 ? 'day' : 'days'})
          </Text>

          {/* Confirmation Number */}
          {rental.confirmationNumber && (
            <View style={styles.confirmationRow}>
              <Ionicons name="document-text-outline" size={16} color={Colors.secondary} />
              <Text style={styles.confirmationText}>
                Confirmation: {rental.confirmationNumber}
              </Text>
            </View>
          )}

          {rental.message && (
            <View style={styles.messageBox}>
              <Text style={styles.messageLabel}>Message:</Text>
              <Text style={styles.messageText}>{rental.message}</Text>
            </View>
          )}

          {/* RENTER ACTIONS */}
          {!isOwner && (
            <>
              {/* Approved but payment pending - Pay Now button */}
              {rental.status === 'approved' && needsPayment && (
                <View style={styles.paymentNotice}>
                  <Ionicons name="information-circle" size={20} color={Colors.warning} />
                  <Text style={styles.paymentNoticeText}>
                    Your rental request was approved! Complete payment to confirm.
                  </Text>
                </View>
              )}

              {rental.status === 'approved' && needsPayment && (
                <TouchableOpacity 
                  style={[styles.fullButton, styles.payNowButton]}
                  onPress={() => handlePayNow(rental)}
                >
                  <Ionicons name="card" size={20} color={Colors.white} />
                  <Text style={styles.actionButtonText}>Pay Now - ${rental.totalPrice}</Text>
                </TouchableOpacity>
              )}

              {/* Cancel Rental button - for approved rentals >24 hours before start */}
              {canCancel && (
                <TouchableOpacity 
                  style={[styles.fullButton, styles.cancelButton]}
                  onPress={() => handleCancelRental(rental)}
                >
                  <Ionicons name="close-circle" size={20} color={Colors.white} />
                  <Text style={styles.actionButtonText}>Cancel Rental</Text>
                </TouchableOpacity>
              )}

              {/* Pending - Waiting for owner approval */}
              {rental.status === 'pending' && (
                <View style={styles.waitingNotice}>
                  <Ionicons name="time" size={20} color={Colors.warning} />
                  <Text style={styles.waitingNoticeText}>
                    Waiting for owner approval...
                  </Text>
                </View>
              )}
            </>
          )}

          {/* OWNER ACTIONS */}
          {showOwnerActions && (
            <>
              {/* Pending - Approve/Decline buttons for owner */}
              {rental.status === 'pending' && (
                <View style={styles.actionsRow}>
                  <TouchableOpacity 
                    style={[styles.actionButton, styles.approveButton]}
                    onPress={() => handleApprove(rental)}
                  >
                    <Ionicons name="checkmark-circle" size={20} color={Colors.white} />
                    <Text style={styles.actionButtonText}>Approve</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.actionButton, styles.declineButton]}
                    onPress={() => handleDecline(rental)}
                  >
                    <Ionicons name="close-circle" size={20} color={Colors.white} />
                    <Text style={styles.actionButtonText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Approved - Waiting for renter payment */}
              {rental.status === 'approved' && (
                <View style={styles.waitingNotice}>
                  <Ionicons name="time" size={20} color={Colors.secondary} />
                  <Text style={styles.waitingNoticeText}>
                    Waiting for renter to complete payment...
                  </Text>
                </View>
              )}

              {/* Active - Complete Rental button (for owner) */}
              {rental.status === 'active' && (
                <TouchableOpacity 
                  style={[styles.fullButton, styles.completeButton]}
                  onPress={() => handleCompleteRental(rental)}
                >
                  <Ionicons name="checkmark-done-circle" size={20} color={Colors.white} />
                  <Text style={styles.actionButtonText}>Complete Rental</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* Report Issue button - for active or completed (both owner and renter) */}
          {(rental.status === 'active' || rental.status === 'completed') && (
            <TouchableOpacity 
              style={[styles.fullButton, styles.reportButton]}
              onPress={() => handleReportIssue(rental)}
            >
              <Ionicons name="alert-circle" size={20} color={Colors.white} />
              <Text style={styles.actionButtonText}>Report Issue</Text>
            </TouchableOpacity>
          )}

          {/* Leave Review button - for completed rentals that haven't been reviewed */}
          {canLeaveReview && (
            <TouchableOpacity 
              style={[styles.fullButton, styles.reviewButton]}
              onPress={() => handleLeaveReview(rental)}
            >
              <Ionicons name="star" size={20} color={Colors.white} />
              <Text style={styles.actionButtonText}>Leave a Review</Text>
            </TouchableOpacity>
          )}

          {/* Already Reviewed indicator */}
          {rental.status === 'completed' && hasReviewed && (
            <View style={styles.reviewedNotice}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
              <Text style={styles.reviewedText}>Review submitted</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderEmptyState = (message: string) => (
    <View style={styles.emptyState}>
      <Ionicons name="calendar-outline" size={64} color={Colors.text} />
      <Text style={styles.emptyTitle}>No Rentals</Text>
      <Text style={styles.emptySubtitle}>{message}</Text>
    </View>
  );

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Please log in</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Rentals</Text>
        
        <View style={styles.tabs}>
          <TouchableOpacity 
            style={[styles.tab, selectedTab === 'requests' && styles.activeTab]}
            onPress={() => setSelectedTab('requests')}
          >
            <Text style={[styles.tabText, selectedTab === 'requests' && styles.activeTabText]}>
              My Items {rentalRequests.length > 0 && `(${rentalRequests.length})`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.tab, selectedTab === 'myRentals' && styles.activeTab]}
            onPress={() => setSelectedTab('myRentals')}
          >
            <Text style={[styles.tabText, selectedTab === 'myRentals' && styles.activeTabText]}>
              Renting
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.tab, selectedTab === 'history' && styles.activeTab]}
            onPress={() => setSelectedTab('history')}
          >
            <Text style={[styles.tabText, selectedTab === 'history' && styles.activeTabText]}>
              History
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {selectedTab === 'requests' && (
          <>
            {rentalRequests.length === 0 
              ? renderEmptyState('No active rentals for your items')
              : rentalRequests.map(rental => renderRentalCard(rental, true))
            }
          </>
        )}

        {selectedTab === 'myRentals' && (
          <>
            {myRentals.length === 0
              ? renderEmptyState('You haven\'t rented anything yet')
              : myRentals.map(rental => renderRentalCard(rental, false))
            }
          </>
        )}

        {selectedTab === 'history' && (
          <>
            {history.length === 0
              ? renderEmptyState('No rental history')
              : history.map(rental => renderRentalCard(rental, false))
            }
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    padding: 20,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 16,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Colors.background,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
  },
  activeTabText: {
    fontWeight: 'bold',
    color: Colors.text,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  rentalCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  itemImage: {
    width: '100%',
    height: 150,
    backgroundColor: Colors.background,
  },
  rentalInfo: {
    padding: 16,
  },
  itemTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 8,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  personName: {
    fontSize: 14,
    color: Colors.text,
    marginBottom: 8,
  },
  datesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  datesText: {
    fontSize: 14,
    color: Colors.text,
    marginLeft: 8,
  },
  priceText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 12,
  },
  messageBox: {
    backgroundColor: Colors.background,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  messageLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  messageText: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
  paymentNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.warning + '20',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  paymentNoticeText: {
    flex: 1,
    fontSize: 14,
    color: Colors.warning,
    fontWeight: '600',
  },
  waitingNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  waitingNoticeText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
    opacity: 0.7,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
  },
  approveButton: {
    backgroundColor: Colors.success,
  },
  declineButton: {
    backgroundColor: '#EF4444',
  },
  fullButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
    marginTop: 8,
  },
  payNowButton: {
    backgroundColor: Colors.primary,
  },
  completeButton: {
    backgroundColor: Colors.success,
  },
  reportButton: {
    backgroundColor: Colors.warning,
  },
  reviewButton: {
    backgroundColor: Colors.secondary,
  },
  cancelButton: {
    backgroundColor: Colors.danger,
  },
  actionButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  reviewedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.success + '20',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  reviewedText: {
    fontSize: 14,
    color: Colors.success,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: Colors.text,
    opacity: 0.7,
    textAlign: 'center',
  },
  confirmationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  confirmationText: {
    fontSize: 13,
    color: Colors.secondary,
    fontWeight: '600',
  },
});
