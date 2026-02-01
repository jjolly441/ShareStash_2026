// src/services/ReviewService.ts
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  increment,
} from 'firebase/firestore';
import { db } from '../config/firebase';

export interface Review {
  id?: string;
  rentalId: string;
  itemId: string;
  itemName: string;
  reviewerId: string;
  reviewerName: string;
  revieweeId: string;
  revieweeName: string;
  reviewType: 'item' | 'user';
  rating: number;
  comment: string;
  photos: string[];
  response?: string;
  responseAt?: Timestamp;
  createdAt: Timestamp;
  helpful: number;
}

export interface ReviewStats {
  averageRating: number;
  totalReviews: number;
  reviewStats: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
}

class ReviewServiceClass {
  private reviewsCollection = collection(db, 'reviews');

  /**
   * Create a review for an item
   */
  async createItemReview(
    rentalId: string,
    itemId: string,
    itemName: string,
    reviewerId: string,
    reviewerName: string,
    ownerId: string,
    ownerName: string,
    rating: number,
    comment: string,
    photos: string[] = []
  ): Promise<{ success: boolean; reviewId?: string; error?: string }> {
    try {
      // Check if review already exists
      const existingReview = await this.getReviewByRental(rentalId, reviewerId, 'item');
      if (existingReview) {
        return { success: false, error: 'You have already reviewed this item' };
      }

      // Create review
      const reviewRef = await addDoc(this.reviewsCollection, {
        rentalId,
        itemId,
        itemName,
        reviewerId,
        reviewerName,
        revieweeId: ownerId,
        revieweeName: ownerName,
        reviewType: 'item',
        rating,
        comment,
        photos,
        helpful: 0,
        createdAt: Timestamp.now(),
      });

      // Update item rating stats
      await this.updateItemRating(itemId, rating);

      return { success: true, reviewId: reviewRef.id };
    } catch (error) {
      console.error('Error creating item review:', error);
      return { success: false, error: 'Failed to create review' };
    }
  }

  /**
   * Create a review for a user
   */
  async createUserReview(
    rentalId: string,
    itemId: string,
    itemName: string,
    reviewerId: string,
    reviewerName: string,
    revieweeId: string,
    revieweeName: string,
    rating: number,
    comment: string
  ): Promise<{ success: boolean; reviewId?: string; error?: string }> {
    try {
      // Check if review already exists
      const existingReview = await this.getReviewByRental(rentalId, reviewerId, 'user');
      if (existingReview) {
        return { success: false, error: 'You have already reviewed this user' };
      }

      // Create review
      const reviewRef = await addDoc(this.reviewsCollection, {
        rentalId,
        itemId,
        itemName,
        reviewerId,
        reviewerName,
        revieweeId,
        revieweeName,
        reviewType: 'user',
        rating,
        comment,
        photos: [],
        helpful: 0,
        createdAt: Timestamp.now(),
      });

      // Update user rating stats
      await this.updateUserRating(revieweeId, rating);

      return { success: true, reviewId: reviewRef.id };
    } catch (error) {
      console.error('Error creating user review:', error);
      return { success: false, error: 'Failed to create review' };
    }
  }

  /**
   * Get review by rental (check if already reviewed)
   */
  async getReviewByRental(
    rentalId: string,
    reviewerId: string,
    reviewType: 'item' | 'user'
  ): Promise<Review | null> {
    try {
      const q = query(
        this.reviewsCollection,
        where('rentalId', '==', rentalId),
        where('reviewerId', '==', reviewerId),
        where('reviewType', '==', reviewType)
      );

      const snapshot = await getDocs(q);
      if (snapshot.empty) return null;

      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() } as Review;
    } catch (error) {
      console.error('Error getting review:', error);
      return null;
    }
  }

  /**
   * Get all reviews for an item
   */
  async getItemReviews(itemId: string): Promise<Review[]> {
    try {
      const q = query(
        this.reviewsCollection,
        where('itemId', '==', itemId),
        where('reviewType', '==', 'item'),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Review));
    } catch (error) {
      console.error('Error fetching item reviews:', error);
      return [];
    }
  }

  /**
   * Get all reviews for a user
   */
  async getUserReviews(userId: string): Promise<Review[]> {
    try {
      const q = query(
        this.reviewsCollection,
        where('revieweeId', '==', userId),
        where('reviewType', '==', 'user'),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Review));
    } catch (error) {
      console.error('Error fetching user reviews:', error);
      return [];
    }
  }

  /**
   * Add response to a review (owner only)
   */
  async addResponse(reviewId: string, response: string): Promise<boolean> {
    try {
      const reviewRef = doc(db, 'reviews', reviewId);
      await updateDoc(reviewRef, {
        response,
        responseAt: Timestamp.now(),
      });
      return true;
    } catch (error) {
      console.error('Error adding response:', error);
      return false;
    }
  }

  /**
   * Mark review as helpful
   */
  async markHelpful(reviewId: string): Promise<boolean> {
    try {
      const reviewRef = doc(db, 'reviews', reviewId);
      await updateDoc(reviewRef, {
        helpful: increment(1),
      });
      return true;
    } catch (error) {
      console.error('Error marking helpful:', error);
      return false;
    }
  }

  /**
   * Update item rating statistics
   */
  private async updateItemRating(itemId: string, newRating: number): Promise<void> {
    try {
      const itemRef = doc(db, 'items', itemId);
      const itemDoc = await getDoc(itemRef);

      if (!itemDoc.exists()) return;

      const currentData = itemDoc.data();
      const currentTotal = currentData.totalReviews || 0;
      const currentAverage = currentData.averageRating || 0;
      const currentStats = currentData.reviewStats || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

      // Calculate new average
      const newTotal = currentTotal + 1;
      const newAverage = ((currentAverage * currentTotal) + newRating) / newTotal;

      // Update stats
      const newStats = { ...currentStats };
      newStats[newRating as keyof typeof newStats] = (newStats[newRating as keyof typeof newStats] || 0) + 1;

      await updateDoc(itemRef, {
        averageRating: newAverage,
        totalReviews: newTotal,
        reviewStats: newStats,
      });
    } catch (error) {
      console.error('Error updating item rating:', error);
    }
  }

  /**
   * Update user rating statistics
   */
  private async updateUserRating(userId: string, newRating: number): Promise<void> {
    try {
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) return;

      const currentData = userDoc.data();
      const currentTotal = currentData.totalReviews || 0;
      const currentAverage = currentData.averageRating || 0;
      const currentStats = currentData.reviewStats || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

      // Calculate new average
      const newTotal = currentTotal + 1;
      const newAverage = ((currentAverage * currentTotal) + newRating) / newTotal;

      // Update stats
      const newStats = { ...currentStats };
      newStats[newRating as keyof typeof newStats] = (newStats[newRating as keyof typeof newStats] || 0) + 1;

      await updateDoc(userRef, {
        averageRating: newAverage,
        totalReviews: newTotal,
        reviewStats: newStats,
      });
    } catch (error) {
      console.error('Error updating user rating:', error);
    }
  }

  /**
   * Get item rating stats
   */
  async getItemStats(itemId: string): Promise<ReviewStats | null> {
    try {
      const itemRef = doc(db, 'items', itemId);
      const itemDoc = await getDoc(itemRef);

      if (!itemDoc.exists()) return null;

      const data = itemDoc.data();
      return {
        averageRating: data.averageRating || 0,
        totalReviews: data.totalReviews || 0,
        reviewStats: data.reviewStats || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
      };
    } catch (error) {
      console.error('Error getting item stats:', error);
      return null;
    }
  }

  /**
   * Get user rating stats
   */
  async getUserStats(userId: string): Promise<ReviewStats | null> {
    try {
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) return null;

      const data = userDoc.data();
      return {
        averageRating: data.averageRating || 0,
        totalReviews: data.totalReviews || 0,
        reviewStats: data.reviewStats || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
      };
    } catch (error) {
      console.error('Error getting user stats:', error);
      return null;
    }
  }

  /**
   * Delete review (admin only)
   */
  async deleteReview(reviewId: string): Promise<boolean> {
    try {
      const reviewRef = doc(db, 'reviews', reviewId);
      const reviewDoc = await getDoc(reviewRef);

      if (!reviewDoc.exists()) return false;

      const reviewData = reviewDoc.data() as Review;

      // Delete the review
      await updateDoc(reviewRef, {
        deleted: true,
        deletedAt: Timestamp.now(),
      });

      // Recalculate ratings (subtract this review)
      if (reviewData.reviewType === 'item') {
        await this.recalculateItemRating(reviewData.itemId);
      } else {
        await this.recalculateUserRating(reviewData.revieweeId);
      }

      return true;
    } catch (error) {
      console.error('Error deleting review:', error);
      return false;
    }
  }

  /**
   * Recalculate item rating after deletion
   */
  private async recalculateItemRating(itemId: string): Promise<void> {
    try {
      const reviews = await this.getItemReviews(itemId);
      const activeReviews = reviews.filter(r => !(r as any).deleted);

      if (activeReviews.length === 0) {
        const itemRef = doc(db, 'items', itemId);
        await updateDoc(itemRef, {
          averageRating: 0,
          totalReviews: 0,
          reviewStats: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
        });
        return;
      }

      const stats = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
      let totalRating = 0;

      activeReviews.forEach(review => {
        stats[review.rating as keyof typeof stats]++;
        totalRating += review.rating;
      });

      const itemRef = doc(db, 'items', itemId);
      await updateDoc(itemRef, {
        averageRating: totalRating / activeReviews.length,
        totalReviews: activeReviews.length,
        reviewStats: stats,
      });
    } catch (error) {
      console.error('Error recalculating item rating:', error);
    }
  }

  /**
   * Recalculate user rating after deletion
   */
  private async recalculateUserRating(userId: string): Promise<void> {
    try {
      const reviews = await this.getUserReviews(userId);
      const activeReviews = reviews.filter(r => !(r as any).deleted);

      if (activeReviews.length === 0) {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
          averageRating: 0,
          totalReviews: 0,
          reviewStats: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
        });
        return;
      }

      const stats = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
      let totalRating = 0;

      activeReviews.forEach(review => {
        stats[review.rating as keyof typeof stats]++;
        totalRating += review.rating;
      });

      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        averageRating: totalRating / activeReviews.length,
        totalReviews: activeReviews.length,
        reviewStats: stats,
      });
    } catch (error) {
      console.error('Error recalculating user rating:', error);
    }
  }
}

export const ReviewService = new ReviewServiceClass();