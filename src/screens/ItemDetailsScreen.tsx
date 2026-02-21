// src/screens/ItemDetailsScreen.tsx - WITH RATINGS, REVIEWS & VERIFICATION BADGE
import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import ItemService, { RentalItem } from '../services/ItemService';
import MessageService from '../services/MessageService';
import { ReviewService, Review, ReviewStats } from '../services/ReviewService';
import { AuthContext } from '../contexts/AuthContext';
import WishlistService from '../services/WishlistService';
import { useTranslation } from '../i18n/useTranslation';

const { width } = Dimensions.get('window');

const Colors = {
  primary: '#F5C542',
  secondary: '#2E86AB',
  success: '#46A758',
  warning: '#F76707',
  background: '#F8F9FA',
  text: '#212529',
  white: '#FFFFFF',
  border: '#E9ECEF',
};

// Star Rating Component
const StarRating = ({ rating, size = 16 }: { rating: number; size?: number }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
    {[1, 2, 3, 4, 5].map((star) => (
      <Ionicons
        key={star}
        name={star <= rating ? 'star' : star - 0.5 <= rating ? 'star-half' : 'star-outline'}
        size={size}
        color={Colors.primary}
        style={{ marginRight: 2 }}
      />
    ))}
  </View>
);

// ============================================================================
// VERIFICATION BADGE COMPONENT
// ============================================================================

interface VerificationBadgeProps {
  isVerified: boolean;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
}

const VerificationBadge: React.FC<VerificationBadgeProps> = ({ 
  isVerified, 
  size = 'medium',
  showLabel = true 
}) => {
  if (!isVerified) return null;

  const iconSize = size === 'small' ? 14 : size === 'medium' ? 16 : 20;
  const fontSize = size === 'small' ? 11 : size === 'medium' ? 12 : 14;

  return (
    <View style={[
      styles.verificationBadge,
      size === 'small' && styles.verificationBadgeSmall,
      size === 'large' && styles.verificationBadgeLarge,
    ]}>
      <Ionicons name="shield-checkmark" size={iconSize} color={Colors.success} />
      {showLabel && (
        <Text style={[styles.verificationBadgeText, { fontSize }]}>Verified</Text>
      )}
    </View>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ItemDetailsScreen({ navigation, route }: any) {
  const { itemId } = route.params;
  const { user } = useContext(AuthContext);
  const { t } = useTranslation();
  const [item, setItem] = useState<RentalItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);
  
  // NEW: Owner verification status
  const [ownerVerified, setOwnerVerified] = useState(false);

  useEffect(() => {
    loadItemDetails();
  }, [itemId]);

  const loadItemDetails = async () => {
    try {
      setLoading(true);
      const itemData = await ItemService.getItemById(itemId);
      if (itemData) {
        setItem(itemData);
        // Track view (fire-and-forget, doesn't block UI)
        ItemService.recordItemView(itemId, user?.id, itemData.ownerId);
        // Check wishlist status
        if (user?.id) {
          setIsFavorite(WishlistService.isFavorite(itemId));
        }
        // Load reviews and stats
        await loadReviews(itemId);
        // Load owner verification status
        await loadOwnerVerificationStatus(itemData.ownerId);
      } else {
        Alert.alert('Error', 'Item not found');
        navigation.goBack();
      }
    } catch (error) {
      console.error('Error loading item:', error);
      Alert.alert('Error', 'Failed to load item details');
    } finally {
      setLoading(false);
    }
  };

  const loadReviews = async (itemId: string) => {
    try {
      const itemReviews = await ReviewService.getItemReviews(itemId);
      const stats = await ReviewService.getItemStats(itemId);
      
      // Also load user reviews for the owner so both types are visible
      if (item?.ownerId) {
        const ownerReviews = await ReviewService.getUserReviews(item.ownerId);
        // Combine both, with item reviews first
        setReviews([...itemReviews, ...ownerReviews]);
        
        // Merge stats if owner has reviews too
        const ownerStats = await ReviewService.getUserStats(item.ownerId);
        if (stats && ownerStats) {
          const combinedTotal = stats.totalReviews + ownerStats.totalReviews;
          const combinedAvg = combinedTotal > 0 
            ? ((stats.averageRating * stats.totalReviews) + (ownerStats.averageRating * ownerStats.totalReviews)) / combinedTotal
            : 0;
          setReviewStats({
            ...stats,
            averageRating: combinedAvg,
            totalReviews: combinedTotal,
          });
        } else {
          setReviewStats(stats || ownerStats);
        }
      } else {
        setReviews(itemReviews);
        setReviewStats(stats);
      }
    } catch (error) {
      console.error('Error loading reviews:', error);
    }
  };

  // NEW: Load owner's verification status
  const loadOwnerVerificationStatus = async (ownerId: string) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', ownerId));
      const userData = userDoc.data();
      setOwnerVerified(userData?.identityVerified || false);
    } catch (error) {
      console.error('Error loading owner verification status:', error);
      setOwnerVerified(false);
    }
  };

  const handleContactOwner = async () => {
    if (!user || !item) return;

    if (user.id === item.ownerId) {
      Alert.alert('Notice', 'This is your own item');
      return;
    }

    try {
      // Create or find existing conversation WITHOUT sending an auto-message
      // This lets the user type their own first message in the Chat screen
      const result = await MessageService.createConversation(
        [user.id, item.ownerId],
        [`${user.firstName} ${user.lastName}`, item.ownerName],
        item.id,
        item.title
      );

      if (result.success && result.conversationId) {
        navigation.navigate('Chat', {
          conversationId: result.conversationId,
          otherUserId: item.ownerId,
          otherUserName: item.ownerName,
        });
      } else {
        Alert.alert('Error', result.error || 'Failed to start conversation');
      }
    } catch (error) {
      console.error('Error contacting owner:', error);
      Alert.alert('Error', 'Failed to contact owner');
    }
  };

  const handleRentNow = () => {
    if (!user || !item) return;

    if (user.id === item.ownerId) {
      Alert.alert('Notice', 'You cannot rent your own item');
      return;
    }

    if (!item.isAvailable) {
      Alert.alert('Unavailable', 'This item is currently not available for rent');
      return;
    }

    navigation.navigate('BookItem', {
      itemId: item.id,
      itemTitle: item.title,
      itemImage: item.image,
      pricePerDay: item.pricePerDay,
      pricePerHour: item.pricePerHour || null,
      pricePerWeek: item.pricePerWeek || null,
      pricePerMonth: item.pricePerMonth || null,
      weeklyDiscountPercent: item.weeklyDiscountPercent || null,
      monthlyDiscountPercent: item.monthlyDiscountPercent || null,
      securityDeposit: item.securityDeposit || 0,
      ownerId: item.ownerId,
      ownerName: item.ownerName,
    });
  };

  const toggleFavorite = async () => {
    if (!user?.id) {
      Alert.alert('Sign In Required', 'Please sign in to save items.');
      return;
    }
    try {
      const newState = await WishlistService.toggleWishlist(user.id, itemId);
      setIsFavorite(newState);
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  // Issue #20: Share item using native OS share sheet
  const handleShareItem = async () => {
    if (!item) return;
    try {
      await Share.share({
        title: item.title,
        message: `Check out "${item.title}" on ShareStash! $${item.pricePerDay}/day. https://sharestash.app/item/${item.id}`,
      });
    } catch (error) {
      console.error('Error sharing item:', error);
    }
  };

  // Issue #16: Navigate to owner public profile
  const handleViewOwnerProfile = () => {
    if (!item) return;
    navigation.navigate('PublicProfile', {
      userId: item.ownerId,
      userName: item.ownerName,
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const renderReview = (review: Review) => (
    <View key={review.id} style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <View style={styles.reviewerAvatar}>
          <Ionicons name="person" size={20} color={Colors.white} />
        </View>
        <View style={styles.reviewerInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.reviewerName}>{review.reviewerName}</Text>
            <View style={{ backgroundColor: review.reviewType === 'item' ? Colors.secondary + '20' : Colors.primary + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
              <Text style={{ fontSize: 11, color: review.reviewType === 'item' ? Colors.secondary : Colors.primary, fontWeight: '600' }}>
                {review.reviewType === 'item' ? 'Item' : 'Owner'}
              </Text>
            </View>
          </View>
          <View style={styles.reviewMeta}>
            <StarRating rating={review.rating} size={14} />
            <Text style={styles.reviewDate}> · {formatDate(review.createdAt.toString())}</Text>
          </View>
        </View>
      </View>
      <Text style={styles.reviewComment}>{review.comment}</Text>
      {review.response && (
        <View style={styles.responseBox}>
          <Text style={styles.responseLabel}>Owner's Response:</Text>
          <Text style={styles.responseText}>{review.response}</Text>
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Item not found</Text>
      </View>
    );
  }

  const isOwnItem = user?.id === item.ownerId;
  const averageRating = reviewStats?.averageRating || 0;
  const totalReviews = reviewStats?.totalReviews || 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header Image */}
        <View style={styles.imageContainer}>
          <Image source={{ uri: item.image }} style={styles.image} />
          
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>

          {!isOwnItem && (
            <TouchableOpacity style={styles.favoriteButton} onPress={toggleFavorite}>
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={24}
                color={isFavorite ? Colors.warning : Colors.text}
              />
            </TouchableOpacity>
          )}

          {/* Share Button */}
          <TouchableOpacity style={styles.shareButton} onPress={handleShareItem}>
            <Ionicons name="share-outline" size={22} color={Colors.text} />
          </TouchableOpacity>

          <View style={[styles.availabilityBadge, !item.isAvailable && styles.unavailableBadge]}>
            <Text style={styles.availabilityText}>
              {item.isAvailable ? 'Available' : 'Unavailable'}
            </Text>
          </View>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Title and Price */}
          <View style={styles.headerSection}>
            <View style={styles.titleContainer}>
              <Text style={styles.title}>{item.title}</Text>
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{item.category}</Text>
              </View>
            </View>
            
            {/* Rating Display */}
            {totalReviews > 0 && (
              <View style={styles.ratingContainer}>
                <StarRating rating={averageRating} size={20} />
                <Text style={styles.ratingText}>
                  {averageRating.toFixed(1)} ({totalReviews} {totalReviews === 1 ? t('itemDetails.review') : t('itemDetails.reviews')})
                </Text>
              </View>
            )}

            {/* View Count */}
            {(item.viewCount || 0) > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: totalReviews > 0 ? 4 : 8 }}>
                <Ionicons name="eye-outline" size={14} color="#999" />
                <Text style={{ fontSize: 13, color: '#999', marginLeft: 4 }}>
                  {item.viewCount} {item.viewCount === 1 ? 'view' : 'views'}
                </Text>
              </View>
            )}

            <View style={styles.priceContainer}>
              <Text style={styles.price}>${item.pricePerDay}</Text>
              <Text style={styles.priceLabel}>per day</Text>
            </View>
            {(item.pricePerHour || item.pricePerWeek || item.pricePerMonth) && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {item.pricePerHour ? (
                  <View style={{ backgroundColor: '#F0F7FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ fontSize: 13, color: Colors.secondary, fontWeight: '600' }}>${item.pricePerHour}/hr</Text>
                  </View>
                ) : null}
                {item.pricePerWeek ? (
                  <View style={{ backgroundColor: '#F0FFF4', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ fontSize: 13, color: Colors.success, fontWeight: '600' }}>${item.pricePerWeek}/wk</Text>
                  </View>
                ) : null}
                {item.pricePerMonth ? (
                  <View style={{ backgroundColor: '#FFF8F0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ fontSize: 13, color: '#E67E22', fontWeight: '600' }}>${item.pricePerMonth}/mo</Text>
                  </View>
                ) : null}
              </View>
            )}
            {(item.weeklyDiscountPercent || item.monthlyDiscountPercent) && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {item.weeklyDiscountPercent ? (
                  <View style={{ backgroundColor: '#F0FFF4', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="pricetag-outline" size={12} color={Colors.success} />
                    <Text style={{ fontSize: 13, color: Colors.success, fontWeight: '600', marginLeft: 4 }}>{item.weeklyDiscountPercent}% off weekly</Text>
                  </View>
                ) : null}
                {item.monthlyDiscountPercent ? (
                  <View style={{ backgroundColor: '#F0FFF4', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="pricetag-outline" size={12} color={Colors.success} />
                    <Text style={{ fontSize: 13, color: Colors.success, fontWeight: '600', marginLeft: 4 }}>{item.monthlyDiscountPercent}% off monthly</Text>
                  </View>
                ) : null}
              </View>
            )}
          </View>

          {/* Security Deposit Notice */}
          {item.securityDeposit && item.securityDeposit > 0 && (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#EFF6FF',
              borderRadius: 10,
              padding: 12,
              marginHorizontal: 16,
              marginTop: 8,
              borderWidth: 1,
              borderColor: '#BFDBFE',
            }}>
              <Ionicons name="shield-checkmark" size={22} color={Colors.secondary} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.text }}>
                  ${item.securityDeposit.toFixed(2)} Refundable Deposit
                </Text>
                <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                  Held on your card and released after successful return
                </Text>
              </View>
            </View>
          )}

          {/* Location */}
          {item.location && (
            <View style={styles.locationSection}>
              <Ionicons name="location" size={20} color={Colors.secondary} />
              <View style={styles.locationInfo}>
                <Text style={styles.locationText}>
                  {item.location.city}, {item.location.state}
                </Text>
                {distance !== null && (
                  <Text style={styles.distanceText}>{distance} miles away</Text>
                )}
              </View>
            </View>
          )}

          {/* Owner Info - UPDATED with verification badge */}
          <View style={styles.ownerSection}>
            <TouchableOpacity style={styles.ownerInfo} onPress={handleViewOwnerProfile}>
              <View style={styles.ownerAvatarContainer}>
                <View style={styles.ownerAvatar}>
                  <Ionicons name="person" size={24} color={Colors.white} />
                </View>
                {/* Verification checkmark on avatar */}
                {ownerVerified && (
                  <View style={styles.avatarVerifiedBadge}>
                    <Ionicons name="shield-checkmark" size={14} color={Colors.white} />
                  </View>
                )}
              </View>
              <View style={styles.ownerDetails}>
                <Text style={styles.ownerLabel}>Listed by</Text>
                <View style={styles.ownerNameRow}>
                  <Text style={styles.ownerName}>{item.ownerName}</Text>
                  {/* Verified badge next to name */}
                  <VerificationBadge isVerified={ownerVerified} size="small" />
                </View>
              </View>
            </TouchableOpacity>
            {!isOwnItem && (
              <TouchableOpacity style={styles.contactButton} onPress={handleContactOwner}>
                <Ionicons name="chatbubble-outline" size={20} color={Colors.secondary} />
                <Text style={styles.contactButtonText}>Contact</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Trust Indicators Section - NEW */}
          {ownerVerified && (
            <View style={styles.trustSection}>
              <View style={styles.trustHeader}>
                <Ionicons name="shield-checkmark" size={20} color={Colors.success} />
                <Text style={styles.trustTitle}>Verified Owner</Text>
              </View>
              <Text style={styles.trustDescription}>
                This owner has verified their identity, adding an extra layer of trust and security to your rental.
              </Text>
              <View style={styles.trustBenefits}>
                <View style={styles.trustBenefitItem}>
                  <Ionicons name="checkmark" size={16} color={Colors.success} />
                  <Text style={styles.trustBenefitText}>Government ID verified</Text>
                </View>
                <View style={styles.trustBenefitItem}>
                  <Ionicons name="checkmark" size={16} color={Colors.success} />
                  <Text style={styles.trustBenefitText}>Identity confirmed</Text>
                </View>
                <View style={styles.trustBenefitItem}>
                  <Ionicons name="checkmark" size={16} color={Colors.success} />
                  <Text style={styles.trustBenefitText}>Accountable community member</Text>
                </View>
              </View>
            </View>
          )}

          {/* Description */}
          <View style={styles.descriptionSection}>
            <Text style={styles.sectionTitle}>{t('itemDetails.description')}</Text>
            <Text style={styles.description}>{item.description}</Text>
          </View>

          {/* Details */}
          <View style={styles.detailsSection}>
            <Text style={styles.sectionTitle}>Details</Text>
            
            <View style={styles.detailRow}>
              <View style={styles.detailItem}>
                <Ionicons name="pricetag-outline" size={20} color={Colors.text} />
                <Text style={styles.detailLabel}>Category</Text>
              </View>
              <Text style={styles.detailValue}>{item.category}</Text>
            </View>

            <View style={styles.detailRow}>
              <View style={styles.detailItem}>
                <Ionicons name="calendar-outline" size={20} color={Colors.text} />
                <Text style={styles.detailLabel}>Listed</Text>
              </View>
              <Text style={styles.detailValue}>
                {new Date(item.createdAt).toLocaleDateString()}
              </Text>
            </View>

            {item.location?.address && (
              <View style={styles.detailRow}>
                <View style={styles.detailItem}>
                  <Ionicons name="location-outline" size={20} color={Colors.text} />
                  <Text style={styles.detailLabel}>Address</Text>
                </View>
                <Text style={styles.detailValue} numberOfLines={2}>
                  {item.location.address}
                  {item.location.zipCode && `, ${item.location.zipCode}`}
                </Text>
              </View>
            )}
          </View>

          {/* Reviews Section */}
          {totalReviews > 0 && (
            <View style={styles.reviewsSection}>
              <Text style={styles.sectionTitle}>
                Reviews ({totalReviews})
              </Text>

              {/* Rating Breakdown */}
              {reviewStats && (
                <View style={styles.ratingBreakdown}>
                  <View style={styles.ratingOverview}>
                    <Text style={styles.ratingNumber}>{averageRating.toFixed(1)}</Text>
                    <StarRating rating={averageRating} size={24} />
                    <Text style={styles.ratingCount}>{totalReviews} {t('itemDetails.reviews')}</Text>
                  </View>

                  <View style={styles.ratingBars}>
                    {[5, 4, 3, 2, 1].map((star) => {
                      const count = reviewStats.reviewStats[star as keyof typeof reviewStats.reviewStats] || 0;
                      const percentage = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
                      return (
                        <View key={star} style={styles.ratingBar}>
                          <Text style={styles.starLabel}>{star}★</Text>
                          <View style={styles.barBackground}>
                            <View style={[styles.barFill, { width: `${percentage}%` }]} />
                          </View>
                          <Text style={styles.countLabel}>{count}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Review List */}
              <View style={styles.reviewsList}>
                {reviews.slice(0, 3).map(renderReview)}
              </View>

              {reviews.length > 3 && (
                <TouchableOpacity style={styles.viewAllButton}>
                  <Text style={styles.viewAllText}>View all {reviews.length} reviews</Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.secondary} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Rental Terms */}
          <View style={styles.termsSection}>
            <Text style={styles.sectionTitle}>Rental Terms</Text>
            <View style={styles.termItem}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
              <Text style={styles.termText}>Flexible rental periods</Text>
            </View>
            <View style={styles.termItem}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
              <Text style={styles.termText}>Secure payment processing</Text>
            </View>
            <View style={styles.termItem}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
              <Text style={styles.termText}>Damage protection available</Text>
            </View>
            <View style={styles.termItem}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
              <Text style={styles.termText}>Cancel up to 24 hours before</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Action Bar */}
      {!isOwnItem && item.isAvailable && (
        <View style={styles.bottomBar}>
          <View style={styles.bottomPriceInfo}>
            <Text style={styles.bottomPrice}>${item.pricePerDay}/day</Text>
            <Text style={styles.bottomPriceSubtext}>Plus applicable fees</Text>
          </View>
          <TouchableOpacity style={styles.rentButton} onPress={handleRentNow}>
            <Text style={styles.rentButtonText}>{t('itemDetails.bookNow')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {isOwnItem && (
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => {
              Alert.alert(
                'Delete Item',
                'Are you sure you want to delete this item? This action cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        const result = await ItemService.deleteItem(item.id);
                        if (result.success) {
                          Alert.alert('Success', 'Item deleted successfully', [
                            { text: 'OK', onPress: () => navigation.goBack() }
                          ]);
                        } else {
                          Alert.alert('Error', result.error || 'Failed to delete item');
                        }
                      } catch (error) {
                        Alert.alert('Error', 'Failed to delete item');
                      }
                    },
                  },
                ]
              );
            }}
          >
            <Ionicons name="trash-outline" size={20} color={Colors.white} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.rentButton, styles.editButton]}
            onPress={() => {
              navigation.navigate('AddItem', { editItemId: item.id });
            }}
          >
            <Text style={styles.rentButtonText}>Edit Item</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  errorText: {
    fontSize: 16,
    color: Colors.text,
    opacity: 0.6,
  },
  scrollView: {
    flex: 1,
  },
  imageContainer: {
    width: width,
    height: width * 0.75,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  backButton: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  favoriteButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  shareButton: {
    position: 'absolute',
    top: 12,
    right: 60,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  availabilityBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: Colors.success,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  unavailableBadge: {
    backgroundColor: Colors.warning,
  },
  availabilityText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '600',
  },
  content: {
    padding: 20,
  },
  headerSection: {
    marginBottom: 20,
  },
  titleContainer: {
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 8,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.background,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  categoryText: {
    fontSize: 12,
    color: Colors.text,
    fontWeight: '600',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
  },
  ratingText: {
    marginLeft: 8,
    fontSize: 16,
    color: Colors.text,
    fontWeight: '500',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  price: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  priceLabel: {
    fontSize: 16,
    color: Colors.text,
    opacity: 0.6,
    marginLeft: 8,
  },
  locationSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  locationInfo: {
    marginLeft: 12,
    flex: 1,
  },
  locationText: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '500',
  },
  distanceText: {
    fontSize: 14,
    color: Colors.text,
    opacity: 0.6,
    marginTop: 2,
  },
  // Owner Section - Updated
  ownerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  ownerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  ownerAvatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  ownerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarVerifiedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
  ownerDetails: {
    flex: 1,
  },
  ownerLabel: {
    fontSize: 12,
    color: Colors.text,
    opacity: 0.6,
  },
  ownerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ownerName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  // Verification Badge
  verificationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.success + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  verificationBadgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  verificationBadgeLarge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  verificationBadgeText: {
    color: Colors.success,
    fontWeight: '600',
  },
  // Trust Section - NEW
  trustSection: {
    backgroundColor: Colors.success + '10',
    borderRadius: 12,
    padding: 16,
    marginVertical: 16,
    borderWidth: 1,
    borderColor: Colors.success + '30',
  },
  trustHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  trustTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.success,
  },
  trustDescription: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
    marginBottom: 12,
  },
  trustBenefits: {
    gap: 6,
  },
  trustBenefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trustBenefitText: {
    fontSize: 13,
    color: Colors.text,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.secondary,
    borderRadius: 20,
    gap: 6,
    flexShrink: 0,
  },
  contactButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.secondary,
  },
  descriptionSection: {
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: Colors.text,
    lineHeight: 24,
  },
  detailsSection: {
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  detailLabel: {
    fontSize: 16,
    color: Colors.text,
    marginLeft: 8,
  },
  detailValue: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  reviewsSection: {
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  ratingBreakdown: {
    flexDirection: 'row',
    marginBottom: 24,
    gap: 24,
  },
  ratingOverview: {
    alignItems: 'center',
    paddingRight: 24,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  ratingNumber: {
    fontSize: 48,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 8,
  },
  ratingCount: {
    fontSize: 14,
    color: Colors.text,
    opacity: 0.6,
    marginTop: 4,
  },
  ratingBars: {
    flex: 1,
    justifyContent: 'center',
  },
  ratingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  starLabel: {
    fontSize: 14,
    width: 30,
    color: Colors.text,
  },
  barBackground: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.background,
    borderRadius: 4,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
  countLabel: {
    fontSize: 14,
    width: 30,
    textAlign: 'right',
    color: Colors.text,
    opacity: 0.6,
  },
  reviewsList: {
    marginTop: 8,
  },
  reviewCard: {
    backgroundColor: Colors.background,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  reviewHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  reviewerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  reviewerInfo: {
    flex: 1,
  },
  reviewerName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  reviewMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reviewDate: {
    fontSize: 14,
    color: Colors.text,
    opacity: 0.6,
  },
  reviewComment: {
    fontSize: 15,
    color: Colors.text,
    lineHeight: 22,
  },
  responseBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  responseLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  responseText: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
    opacity: 0.8,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  viewAllText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.secondary,
    marginRight: 4,
  },
  termsSection: {
    paddingVertical: 20,
    marginBottom: 100,
  },
  termItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  termText: {
    fontSize: 16,
    color: Colors.text,
    marginLeft: 12,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
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
  bottomPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
  },
  bottomPriceSubtext: {
    fontSize: 12,
    color: Colors.text,
    opacity: 0.6,
  },
  rentButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
  },
  rentButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
  },
  ownItemText: {
    fontSize: 16,
    color: Colors.text,
    opacity: 0.6,
    flex: 1,
  },
  editButton: {
    backgroundColor: Colors.secondary,
  },
  deleteButton: {
    backgroundColor: '#DC3545',
    padding: 14,
    borderRadius: 8,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
},
});

