// src/screens/CreateReviewScreen.tsx
import React, { useState, useContext, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { AuthContext } from '../contexts/AuthContext';
import { RootStackParamList } from '../types/navigation';
import { ReviewService } from '../services/ReviewService';
import { RentalService } from '../services/RentalService';

const Colors = {
  primary: '#F5C542',
  secondary: '#2E86AB',
  success: '#46A758',
  background: '#F8F9FA',
  text: '#212529',
  white: '#FFFFFF',
  border: '#E9ECEF',
  gray: '#6C757D',
};

type CreateReviewScreenNavigationProp = StackNavigationProp<RootStackParamList, 'CreateReview'>;
type CreateReviewScreenRouteProp = RouteProp<RootStackParamList, 'CreateReview'>;

interface Props {
  navigation: CreateReviewScreenNavigationProp;
  route: CreateReviewScreenRouteProp;
}

export default function CreateReviewScreen({ navigation, route }: Props) {
  const { rentalId } = route.params;
  const { user } = useContext(AuthContext);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Rental data
  const [rental, setRental] = useState<any>(null);
  
  // Item review
  const [itemRating, setItemRating] = useState(0);
  const [itemComment, setItemComment] = useState('');
  
  // User review (owner/renter)
  const [userRating, setUserRating] = useState(0);
  const [userComment, setUserComment] = useState('');

  useEffect(() => {
    loadRentalData();
  }, []);

  const loadRentalData = async () => {
    try {
      setLoading(true);
      const rentalData = await RentalService.getRentalById(rentalId);
      
      if (!rentalData) {
        Alert.alert('Error', 'Rental not found');
        navigation.goBack();
        return;
      }

      setRental(rentalData);
    } catch (error) {
      console.error('Error loading rental:', error);
      Alert.alert('Error', 'Failed to load rental data');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitReviews = async () => {
    if (!user || !rental) return;

    // Validate at least one review
    if (itemRating === 0 && userRating === 0) {
      Alert.alert('Rating Required', 'Please rate the item and/or the experience with the other user.');
      return;
    }

    // Validate item review if rating given
    if (itemRating > 0 && !itemComment.trim()) {
      Alert.alert('Comment Required', 'Please write a comment about the item.');
      return;
    }

    // Validate user review if rating given
    if (userRating > 0 && !userComment.trim()) {
      Alert.alert('Comment Required', 'Please write a comment about your experience with the other user.');
      return;
    }

    setSubmitting(true);

    try {
      const isRenter = rental.renterId === user.id;
      const revieweeName = isRenter ? rental.ownerName : rental.renterName;
      const revieweeId = isRenter ? rental.ownerId : rental.renterId;

      let itemSuccess = false;
      let userSuccess = false;

      // Submit item review (only renters review items)
      if (isRenter && itemRating > 0) {
        const result = await ReviewService.createItemReview(
          rentalId,
          rental.itemId,
          rental.itemName,
          user.id,
          `${user.firstName} ${user.lastName}`,
          rental.ownerId,
          rental.ownerName,
          itemRating,
          itemComment.trim(),
          []
        );

        if (result.success) {
          itemSuccess = true;
        } else {
          Alert.alert('Error', result.error || 'Failed to submit item review');
          setSubmitting(false);
          return;
        }
      }

      // Submit user review (both can review each other)
      if (userRating > 0) {
        const result = await ReviewService.createUserReview(
          rentalId,
          rental.itemId,
          rental.itemName,
          user.id,
          `${user.firstName} ${user.lastName}`,
          revieweeId,
          revieweeName,
          userRating,
          userComment.trim()
        );

        if (result.success) {
          userSuccess = true;
        } else {
          Alert.alert('Error', result.error || 'Failed to submit user review');
          setSubmitting(false);
          return;
        }
      }

      // Success!
      const messages = [];
      if (itemSuccess) messages.push('item');
      if (userSuccess) messages.push(isRenter ? 'owner' : 'renter');

      Alert.alert(
        'Review Submitted!',
        `Thank you for reviewing the ${messages.join(' and ')}!`,
        [
          {
            text: 'OK',
            onPress: () => {
              navigation.goBack();
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error submitting reviews:', error);
      Alert.alert('Error', 'Failed to submit reviews. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStarRating = (
    rating: number,
    onRatingChange: (rating: number) => void,
    label: string
  ) => {
    return (
      <View style={styles.ratingSection}>
        <Text style={styles.ratingLabel}>{label}</Text>
        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((star) => (
            <TouchableOpacity
              key={star}
              onPress={() => onRatingChange(star)}
              style={styles.starButton}
            >
              <Ionicons
                name={star <= rating ? 'star' : 'star-outline'}
                size={40}
                color={star <= rating ? Colors.primary : Colors.gray}
              />
            </TouchableOpacity>
          ))}
        </View>
        {rating > 0 && (
          <Text style={styles.ratingText}>
            {rating === 1 && 'Poor'}
            {rating === 2 && 'Fair'}
            {rating === 3 && 'Good'}
            {rating === 4 && 'Very Good'}
            {rating === 5 && 'Excellent'}
          </Text>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!rental) {
    return null;
  }

  const isRenter = rental.renterId === user?.id;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Leave a Review</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Rental Info */}
        <View style={styles.rentalInfo}>
          {rental.itemImage && (
            <Image source={{ uri: rental.itemImage }} style={styles.itemImage} />
          )}
          <Text style={styles.itemName}>{rental.itemName}</Text>
          <Text style={styles.rentalDate}>
            {new Date(rental.startDate).toLocaleDateString()} - {new Date(rental.endDate).toLocaleDateString()}
          </Text>
        </View>

        {/* Item Review (Renters only) */}
        {isRenter && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="cube-outline" size={24} color={Colors.secondary} />
              <Text style={styles.sectionTitle}>Rate the Item</Text>
            </View>
            
            {renderStarRating(itemRating, setItemRating, 'How was the item?')}

            {itemRating > 0 && (
              <View style={styles.commentSection}>
                <Text style={styles.commentLabel}>Your Review</Text>
                <TextInput
                  style={styles.commentInput}
                  multiline
                  numberOfLines={4}
                  placeholder="Share details about your experience with this item..."
                  value={itemComment}
                  onChangeText={setItemComment}
                  textAlignVertical="top"
                />
                <Text style={styles.characterCount}>{itemComment.length}/500</Text>
              </View>
            )}
          </View>
        )}

        {/* User Review */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="person-outline" size={24} color={Colors.secondary} />
            <Text style={styles.sectionTitle}>
              Rate {isRenter ? 'the Owner' : 'the Renter'}
            </Text>
          </View>
          
          {renderStarRating(
            userRating,
            setUserRating,
            `How was your experience with ${isRenter ? rental.ownerName : rental.renterName}?`
          )}

          {userRating > 0 && (
            <View style={styles.commentSection}>
              <Text style={styles.commentLabel}>Your Review</Text>
              <TextInput
                style={styles.commentInput}
                multiline
                numberOfLines={4}
                placeholder={`Share details about your experience with ${isRenter ? 'the owner' : 'the renter'}...`}
                value={userComment}
                onChangeText={setUserComment}
                textAlignVertical="top"
              />
              <Text style={styles.characterCount}>{userComment.length}/500</Text>
            </View>
          )}
        </View>

        {/* Guidelines */}
        <View style={styles.guidelines}>
          <Text style={styles.guidelinesTitle}>Review Guidelines</Text>
          <Text style={styles.guidelinesText}>
            • Be honest and constructive{'\n'}
            • Focus on your personal experience{'\n'}
            • Keep it respectful and appropriate{'\n'}
            • Reviews cannot be edited once submitted
          </Text>
        </View>
      </ScrollView>

      {/* Submit Button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[
            styles.submitButton,
            (itemRating === 0 && userRating === 0) && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmitReviews}
          disabled={submitting || (itemRating === 0 && userRating === 0)}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.text} />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={24} color={Colors.text} />
              <Text style={styles.submitButtonText}>Submit Review</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

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
  rentalInfo: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  itemImage: {
    width: 100,
    height: 100,
    borderRadius: 12,
    marginBottom: 16,
  },
  itemName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  rentalDate: {
    fontSize: 14,
    color: Colors.gray,
  },
  section: {
    backgroundColor: Colors.white,
    marginTop: 16,
    padding: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    marginLeft: 12,
  },
  ratingSection: {
    marginBottom: 20,
  },
  ratingLabel: {
    fontSize: 16,
    color: Colors.text,
    marginBottom: 12,
    fontWeight: '500',
  },
  stars: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  starButton: {
    padding: 4,
  },
  ratingText: {
    textAlign: 'center',
    fontSize: 16,
    color: Colors.primary,
    fontWeight: '600',
  },
  commentSection: {
    marginTop: 8,
  },
  commentLabel: {
    fontSize: 16,
    color: Colors.text,
    marginBottom: 8,
    fontWeight: '500',
  },
  commentInput: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: Colors.text,
    minHeight: 100,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  characterCount: {
    textAlign: 'right',
    fontSize: 12,
    color: Colors.gray,
    marginTop: 4,
  },
  guidelines: {
    margin: 20,
    padding: 16,
    backgroundColor: Colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  guidelinesTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 8,
  },
  guidelinesText: {
    fontSize: 14,
    color: Colors.gray,
    lineHeight: 22,
  },
  bottomBar: {
    padding: 20,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 8,
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
  },
});