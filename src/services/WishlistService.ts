// src/services/WishlistService.ts — Persist user wishlists/favorites in Firestore
import {
  collection, doc, setDoc, deleteDoc, getDocs, query, where, onSnapshot, Unsubscribe
} from 'firebase/firestore';
import { db } from '../config/firebase';

export interface WishlistItem {
  itemId: string;
  userId: string;
  addedAt: string; // ISO string
}

class WishlistServiceClass {
  private collectionName = 'wishlists';

  // In-memory cache of current user's wishlist item IDs for fast lookups
  private cachedItemIds: Set<string> = new Set();
  private cacheUserId: string | null = null;
  private unsubscribe: Unsubscribe | null = null;

  /**
   * Start real-time listener for a user's wishlist.
   * Keeps cachedItemIds in sync with Firestore.
   */
  subscribe(userId: string, onChange?: (itemIds: Set<string>) => void): void {
    // Clean up previous subscription
    if (this.unsubscribe) {
      this.unsubscribe();
    }

    this.cacheUserId = userId;

    const q = query(
      collection(db, this.collectionName),
      where('userId', '==', userId)
    );

    this.unsubscribe = onSnapshot(q, (snapshot) => {
      this.cachedItemIds = new Set(snapshot.docs.map(d => d.data().itemId));
      onChange?.(this.cachedItemIds);
    }, (error) => {
      console.error('Wishlist listener error:', error);
    });
  }

  /**
   * Stop listening
   */
  unsubscribeAll(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.cachedItemIds.clear();
    this.cacheUserId = null;
  }

  /**
   * Check if an item is in the user's wishlist (from cache)
   */
  isFavorite(itemId: string): boolean {
    return this.cachedItemIds.has(itemId);
  }

  /**
   * Get all favorited item IDs (from cache)
   */
  getFavoriteIds(): Set<string> {
    return new Set(this.cachedItemIds);
  }

  /**
   * Add an item to the wishlist
   */
  async addToWishlist(userId: string, itemId: string): Promise<void> {
    const docId = `${userId}_${itemId}`;
    await setDoc(doc(db, this.collectionName, docId), {
      userId,
      itemId,
      addedAt: new Date().toISOString(),
    });
    this.cachedItemIds.add(itemId);
  }

  /**
   * Remove an item from the wishlist
   */
  async removeFromWishlist(userId: string, itemId: string): Promise<void> {
    const docId = `${userId}_${itemId}`;
    await deleteDoc(doc(db, this.collectionName, docId));
    this.cachedItemIds.delete(itemId);
  }

  /**
   * Toggle wishlist status and return the new state
   */
  async toggleWishlist(userId: string, itemId: string): Promise<boolean> {
    if (this.isFavorite(itemId)) {
      await this.removeFromWishlist(userId, itemId);
      return false;
    } else {
      await this.addToWishlist(userId, itemId);
      return true;
    }
  }

  /**
   * Get full wishlist items for a user (for the wishlist screen)
   */
  async getWishlistItems(userId: string): Promise<WishlistItem[]> {
    const q = query(
      collection(db, this.collectionName),
      where('userId', '==', userId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data() as WishlistItem);
  }
}

const WishlistService = new WishlistServiceClass();
export default WishlistService;