// src/screens/WishlistScreen.tsx — View saved/favorited items
import React, { useState, useEffect, useContext, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { AuthContext } from '../contexts/AuthContext';
import WishlistService from '../services/WishlistService';
import ItemService, { RentalItem } from '../services/ItemService';

const Colors = {
  primary: '#F5C542',
  secondary: '#2E86AB',
  danger: '#EF4444',
  background: '#F8F9FA',
  text: '#212529',
  white: '#FFFFFF',
  border: '#E9ECEF',
};

export default function WishlistScreen({ navigation }: any) {
  const { user } = useContext(AuthContext);
  const [items, setItems] = useState<RentalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadWishlist = async () => {
    if (!user?.id) return;
    try {
      const wishlistEntries = await WishlistService.getWishlistItems(user.id);
      const itemIds = wishlistEntries.map(w => w.itemId);

      if (itemIds.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      // Fetch full item details for each wishlist entry
      const allItems = await ItemService.getAllItems();
      const wishlistItems = allItems.filter(item => itemIds.includes(item.id));

      // Sort by when they were added (most recent first)
      const addedAtMap = new Map(wishlistEntries.map(w => [w.itemId, w.addedAt]));
      wishlistItems.sort((a, b) => {
        const aDate = addedAtMap.get(a.id) || '';
        const bDate = addedAtMap.get(b.id) || '';
        return bDate.localeCompare(aDate);
      });

      setItems(wishlistItems);
    } catch (error) {
      console.error('Error loading wishlist:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadWishlist();
    }, [user?.id])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadWishlist();
    setRefreshing(false);
  };

  const handleRemove = async (itemId: string) => {
    if (!user?.id) return;
    try {
      await WishlistService.removeFromWishlist(user.id, itemId);
      setItems(prev => prev.filter(i => i.id !== itemId));
    } catch (error) {
      console.error('Error removing from wishlist:', error);
    }
  };

  const renderItem = ({ item }: { item: RentalItem }) => (
    <TouchableOpacity
      style={styles.itemCard}
      onPress={() => navigation.navigate('ItemDetails', { itemId: item.id })}
    >
      <Image source={{ uri: item.image }} style={styles.itemImage} />
      <View style={styles.itemInfo}>
        <Text style={styles.itemTitle}>{item.title}</Text>
        <Text style={styles.itemCategory}>{item.category}</Text>
        <Text style={styles.itemPrice}>${item.pricePerDay}/day</Text>
        <Text style={styles.itemOwner}>by {item.ownerName}</Text>
      </View>
      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => handleRemove(item.id)}
      >
        <Ionicons name="heart" size={24} color={Colors.danger} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="heart-outline" size={64} color={Colors.border} />
      <Text style={styles.emptyTitle}>No Saved Items</Text>
      <Text style={styles.emptyText}>
        Tap the heart icon on any item to save it here for later.
      </Text>
      <TouchableOpacity
        style={styles.browseButton}
        onPress={() => navigation.navigate('Home')}
      >
        <Text style={styles.browseButtonText}>Browse Items</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Saved Items</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Saved Items ({items.length})</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={items.length === 0 ? styles.emptyList : styles.list}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.text },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16 },
  emptyList: { flex: 1 },
  itemCard: {
    flexDirection: 'row', backgroundColor: Colors.white, borderRadius: 12,
    marginBottom: 12, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, shadowRadius: 3, elevation: 2,
  },
  itemImage: { width: 100, height: 100 },
  itemInfo: { flex: 1, padding: 12, justifyContent: 'center' },
  itemTitle: { fontSize: 16, fontWeight: '600', color: Colors.text, marginBottom: 2 },
  itemCategory: { fontSize: 12, color: Colors.secondary, marginBottom: 4 },
  itemPrice: { fontSize: 15, fontWeight: 'bold', color: Colors.primary },
  itemOwner: { fontSize: 12, color: '#999', marginTop: 2 },
  removeButton: { justifyContent: 'center', paddingHorizontal: 16 },
  emptyContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40,
  },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: Colors.text, marginTop: 16 },
  emptyText: { fontSize: 14, color: '#999', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  browseButton: {
    marginTop: 20, backgroundColor: Colors.primary, borderRadius: 10,
    paddingHorizontal: 24, paddingVertical: 12,
  },
  browseButtonText: { fontSize: 16, fontWeight: 'bold', color: Colors.text },
});