// src/services/ItemService.ts - Firebase version with Location Features
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  query, 
  where,
  orderBy,
  Timestamp 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';

export interface RentalItem {
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
  location?: {
    address: string;
    city: string;
    state: string;
    zipCode: string;
    coordinates: {
      latitude: number;
      longitude: number;
    } | null;
  };
}

class ItemService {
  private static instance: ItemService;

  static getInstance(): ItemService {
    if (!ItemService.instance) {
      ItemService.instance = new ItemService();
    }
    return ItemService.instance;
  }

  async uploadImage(imageUri: string, itemId: string): Promise<string> {
    try {
      // Convert image URI to blob
      const response = await fetch(imageUri);
      const blob = await response.blob();

      // Create storage reference
      const storageRef = ref(storage, `items/${itemId}_${Date.now()}.jpg`);

      // Upload image
      await uploadBytes(storageRef, blob);

      // Get download URL
      const downloadURL = await getDownloadURL(storageRef);
      return downloadURL;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  }

  async getAllItems(): Promise<RentalItem[]> {
    try {
      const itemsRef = collection(db, 'items');
      const querySnapshot = await getDocs(itemsRef);
      
      const items: RentalItem[] = [];
      querySnapshot.forEach((doc) => {
        items.push({
          id: doc.id,
          ...doc.data()
        } as RentalItem);
      });

      return items;
    } catch (error) {
      console.error('Error fetching items:', error);
      return [];
    }
  }

  async getAvailableItems(): Promise<RentalItem[]> {
    try {
      const itemsRef = collection(db, 'items');
      const q = query(itemsRef, where('isAvailable', '==', true));
      const querySnapshot = await getDocs(q);
      
      const items: RentalItem[] = [];
      querySnapshot.forEach((doc) => {
        items.push({
          id: doc.id,
          ...doc.data()
        } as RentalItem);
      });

      return items;
    } catch (error) {
      console.error('Error fetching available items:', error);
      return [];
    }
  }

  async getItemsByCategory(category: string): Promise<RentalItem[]> {
    try {
      const itemsRef = collection(db, 'items');
      const q = query(
        itemsRef, 
        where('category', '==', category),
        where('isAvailable', '==', true)
      );
      const querySnapshot = await getDocs(q);
      
      const items: RentalItem[] = [];
      querySnapshot.forEach((doc) => {
        items.push({
          id: doc.id,
          ...doc.data()
        } as RentalItem);
      });

      return items;
    } catch (error) {
      console.error('Error fetching items by category:', error);
      return [];
    }
  }

  async searchItems(query: string): Promise<RentalItem[]> {
    try {
      // Note: Firestore doesn't have full-text search
      // This gets all items and filters client-side
      // For production, consider Algolia or ElasticSearch
      const allItems = await this.getAvailableItems();
      const lowerQuery = query.toLowerCase();
      
      return allItems.filter(item =>
        item.title.toLowerCase().includes(lowerQuery) ||
        item.description.toLowerCase().includes(lowerQuery) ||
        item.category.toLowerCase().includes(lowerQuery)
      );
    } catch (error) {
      console.error('Error searching items:', error);
      return [];
    }
  }

  async addItem(itemData: Omit<RentalItem, 'id' | 'createdAt'>): Promise<{ success: boolean; item?: RentalItem; error?: string }> {
    try {
      // First, upload image if it's a local URI
      let imageUrl = itemData.image;
      if (itemData.image && !itemData.image.startsWith('http')) {
        const tempId = Date.now().toString();
        imageUrl = await this.uploadImage(itemData.image, tempId);
      }

      // Create item document
      const newItem = {
        ...itemData,
        image: imageUrl,
        createdAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, 'items'), newItem);
      
      return { 
        success: true, 
        item: {
          id: docRef.id,
          ...newItem
        } as RentalItem
      };
    } catch (error) {
      console.error('Error adding item:', error);
      return { success: false, error: 'Failed to add item' };
    }
  }

  async getItemById(id: string): Promise<RentalItem | null> {
    try {
      const docRef = doc(db, 'items', id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return {
          id: docSnap.id,
          ...docSnap.data()
        } as RentalItem;
      }
      return null;
    } catch (error) {
      console.error('Error fetching item:', error);
      return null;
    }
  }

  async getUserItems(userId: string): Promise<RentalItem[]> {
    try {
      const itemsRef = collection(db, 'items');
      const q = query(itemsRef, where('ownerId', '==', userId));
      const querySnapshot = await getDocs(q);
      
      const items: RentalItem[] = [];
      querySnapshot.forEach((doc) => {
        items.push({
          id: doc.id,
          ...doc.data()
        } as RentalItem);
      });

      return items;
    } catch (error) {
      console.error('Error fetching user items:', error);
      return [];
    }
  }

  getCategories(): string[] {
    return [
      'Electronics',
      'Camera & Photo',
      'Sports & Outdoors',
      'Tools & Equipment',
      'Musical Instruments',
      'Party & Events',
      'Other',
    ];
  }

  // Calculate distance between two coordinates in miles
  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 3959; // Earth's radius in miles
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    return Math.round(distance * 10) / 10; // Round to 1 decimal
  }

  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  // Get items within a certain radius
  async getItemsNearLocation(
    latitude: number,
    longitude: number,
    radiusMiles: number = 25
  ): Promise<(RentalItem & { distance: number })[]> {
    try {
      const allItems = await this.getAvailableItems();
      
      const itemsWithDistance = allItems
        .filter(item => item.location?.coordinates)
        .map(item => ({
          ...item,
          distance: this.calculateDistance(
            latitude,
            longitude,
            item.location!.coordinates!.latitude,
            item.location!.coordinates!.longitude
          )
        }))
        .filter(item => item.distance <= radiusMiles)
        .sort((a, b) => a.distance - b.distance);

      return itemsWithDistance;
    } catch (error) {
      console.error('Error fetching items near location:', error);
      return [];
    }
  }

  // Get items with distance info (without filtering)
  async getItemsWithDistance(
    latitude: number,
    longitude: number
  ): Promise<(RentalItem & { distance?: number })[]> {
    try {
      const allItems = await this.getAvailableItems();
      
      return allItems.map(item => {
        if (item.location?.coordinates) {
          return {
            ...item,
            distance: this.calculateDistance(
              latitude,
              longitude,
              item.location.coordinates.latitude,
              item.location.coordinates.longitude
            )
          };
        }
        return item;
      });
    } catch (error) {
      console.error('Error fetching items with distance:', error);
      return [];
    }
  }
}

export default ItemService.getInstance();