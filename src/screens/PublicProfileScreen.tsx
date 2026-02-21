// src/screens/PublicProfileScreen.tsx
// Issue #16: View Owner Profile - separate screen showing public user info, reviews, and listings
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ReviewService, Review, ReviewStats } from '../services/ReviewService';
import ItemService from '../services/ItemService';
import TrustScoreService, { TrustScoreBreakdown } from '../services/TrustScoreService';
import { TrustScoreCard, TrustScoreCompactBadge } from '../components/TrustScoreBadge';

const Colors = {
  primary: '#F5C542',
  secondary: '#2E86AB',
  success: '#46A758',
  background: '#F8F9FA',
  text: '#212529',
  white: '#FFFFFF',
  border: '#E9ECEF',
  warning: '#F59E0B',
};

interface UserProfile {
  firstName: string;
  lastName: string;
  photoURL?: string;
  bio?: string;
  createdAt: string;
  verificationStatus?: string;
  identityVerified?: boolean;
}

export default function PublicProfileScreen({ navigation, route }: any) {
  const { userId, userName } = route.params;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'reviews' | 'listings'>('listings');
  const [trustScore, setTrustScore] = useState<TrustScoreBreakdown | null>(null);

  useEffect(() => {
    loadData();
  }, [userId]);

  const loadData = async () => {
    try {
      // Load user profile
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        setProfile(userDoc.data() as UserProfile);
      }

      // Load reviews about this user
      const userReviews = await ReviewService.getUserReviews(userId);
      setReviews(userReviews);

      // Load review stats
      const stats = await ReviewService.getUserStats(userId);
      setReviewStats(stats);

      // Load user's items
      const items = await ItemService.getUserItems(userId);
      setListings(items.filter((item: any) => item.isAvailable));

      // Load trust score
      const score = await TrustScoreService.computeTrustScore(userId);
      setTrustScore(score);
    } catch (error) {
      console.error('Error loading public profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const getMemberSince = () => {
    if (!profile?.createdAt) return '';
    const date = new Date(profile.createdAt);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const renderStars = (rating: number) => (
    <View style={{ flexDirection: 'row' }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Ionicons
          key={star}
          name={star <= rating ? 'star' : star - 0.5 <= rating ? 'star-half' : 'star-outline'}
          size={16}
          color={Colors.primary}
          style={{ marginRight: 1 }}
        />
      ))}
    </View>
  );

  const renderReview = (review: Review) => (
    <View key={review.id} style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <View style={styles.reviewerInfo}>
          <View style={styles.reviewerAvatar}>
            <Ionicons name="person" size={16} color={Colors.white} />
          </View>
          <View>
            <Text style={styles.reviewerName}>{review.reviewerName}</Text>
            <Text style={styles.reviewDate}>
              {review.createdAt?.toDate?.()
                ? review.createdAt.toDate().toLocaleDateString()
                : ''}
            </Text>
          </View>
        </View>
        {renderStars(review.rating)}
      </View>
      <Text style={styles.reviewComment}>{review.comment}</Text>
    </View>
  );

  const renderListing = (item: any) => (
    <TouchableOpacity
      key={item.id}
      style={styles.listingCard}
      onPress={() => navigation.navigate('ItemDetails', { itemId: item.id })}
    >
      {item.image ? (
        <Image source={{ uri: item.image }} style={styles.listingImage} />
      ) : (
        <View style={[styles.listingImage, styles.listingImagePlaceholder]}>
          <Ionicons name="image-outline" size={24} color={Colors.border} />
        </View>
      )}
      <View style={styles.listingInfo}>
        <Text style={styles.listingTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.listingPrice}>${item.pricePerDay}/day</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
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
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            {profile?.photoURL ? (
              <Image source={{ uri: profile.photoURL }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={40} color={Colors.white} />
              </View>
            )}
            {profile?.identityVerified && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="shield-checkmark" size={14} color={Colors.white} />
              </View>
            )}
          </View>

          <Text style={styles.profileName}>
            {profile?.firstName} {profile?.lastName}
          </Text>

          {profile?.identityVerified && (
            <View style={styles.verifiedRow}>
              <Ionicons name="shield-checkmark" size={14} color={Colors.success} />
              <Text style={styles.verifiedText}>Verified User</Text>
            </View>
          )}

          <Text style={styles.memberSince}>Member since {getMemberSince()}</Text>

          {profile?.bio ? (
            <Text style={styles.bioText}>{profile.bio}</Text>
          ) : null}

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{listings.length}</Text>
              <Text style={styles.statLabel}>Listings</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{reviewStats?.totalReviews || 0}</Text>
              <Text style={styles.statLabel}>Reviews</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="star" size={16} color={Colors.primary} />
                <Text style={styles.statNumber}>
                  {reviewStats?.averageRating?.toFixed(1) || '—'}
                </Text>
              </View>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
          </View>
        </View>

        {/* Trust Score */}
        {trustScore && (
          <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
            <TrustScoreCard
              breakdown={trustScore}
              showBreakdown={true}
              isOwnProfile={false}
            />
          </View>
        )}

        {/* Tabs */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, selectedTab === 'listings' && styles.activeTab]}
            onPress={() => setSelectedTab('listings')}
          >
            <Text style={[styles.tabText, selectedTab === 'listings' && styles.activeTabText]}>
              Listings ({listings.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, selectedTab === 'reviews' && styles.activeTab]}
            onPress={() => setSelectedTab('reviews')}
          >
            <Text style={[styles.tabText, selectedTab === 'reviews' && styles.activeTabText]}>
              Reviews ({reviews.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Content */}
        {selectedTab === 'listings' && (
          <View style={styles.listingsGrid}>
            {listings.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="cube-outline" size={48} color={Colors.border} />
                <Text style={styles.emptyText}>No listings yet</Text>
              </View>
            ) : (
              listings.map(renderListing)
            )}
          </View>
        )}

        {selectedTab === 'reviews' && (
          <View style={styles.reviewsSection}>
            {reviews.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="chatbubble-outline" size={48} color={Colors.border} />
                <Text style={styles.emptyText}>No reviews yet</Text>
              </View>
            ) : (
              reviews.map(renderReview)
            )}
          </View>
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
  loadingContainer: {
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
  content: {
    flex: 1,
  },
  profileCard: {
    backgroundColor: Colors.white,
    padding: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
  profileName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  verifiedText: {
    fontSize: 13,
    color: Colors.success,
    fontWeight: '600',
  },
  memberSince: {
    fontSize: 14,
    color: Colors.text,
    opacity: 0.6,
    marginBottom: 8,
  },
  bioText: {
    fontSize: 14,
    color: Colors.text,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    width: '100%',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.text,
    opacity: 0.6,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text,
    opacity: 0.6,
  },
  activeTabText: {
    opacity: 1,
    fontWeight: '600',
  },
  listingsGrid: {
    padding: 16,
    gap: 12,
  },
  listingCard: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  listingImage: {
    width: 100,
    height: 100,
  },
  listingImagePlaceholder: {
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listingInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  listingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  listingPrice: {
    fontSize: 15,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  reviewsSection: {
    padding: 16,
    gap: 12,
  },
  reviewCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reviewerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reviewerName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  reviewDate: {
    fontSize: 12,
    color: Colors.text,
    opacity: 0.6,
  },
  reviewComment: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.text,
    opacity: 0.5,
  },
});