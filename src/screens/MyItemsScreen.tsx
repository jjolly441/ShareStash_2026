// src/screens/MyItemsScreen.tsx
// Screen to display and manage user's own item listings
import React, { useState, useEffect, useContext, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import ItemService, { RentalItem } from '../services/ItemService';
import { AuthContext } from '../contexts/AuthContext';
import { RootStackParamList } from '../types/navigation';

const Colors = {
  primary: '#F5C542',
  secondary: '#2E86AB',
  success: '#46A758',
  danger: '#DC3545',
  background: '#F8F9FA',
  text: '#212529',
  white: '#FFFFFF',
  border: '#E9ECEF',
};

type MyItemsScreenNavigationProp = StackNavigationProp<RootStackParamList>;

interface Props {
  navigation: MyItemsScreenNavigationProp;
}

export default function MyItemsScreen({ navigation }: Props) {
  const { user } = useContext(AuthContext);
  const [items, setItems] = useState<RentalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Load items when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [user])
  );

  const loadItems = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const userItems = await ItemService.getUserItems(user.id);
      // Sort by most recent first
      userItems.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setItems(userItems);
    } catch (error) {
      console.error('Error loading items:', error);
      Alert.alert('Error', 'Failed to load your items');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadItems();
    setRefreshing(false);
  };

  const handleToggleAvailability = async (item: RentalItem) => {
    const newStatus = !item.isAvailable;
    const statusText = newStatus ? 'available' : 'unavailable';
    
    Alert.alert(
      'Update Availability',
      `Mark "${item.title}" as ${statusText}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              const result = await ItemService.toggleItemAvailability(item.id, newStatus);
              if (result.success) {
                // Update local state
                setItems(prev => prev.map(i => 
                  i.id === item.id ? { ...i, isAvailable: newStatus } : i
                ));
              } else {
                Alert.alert('Error', result.error || 'Failed to update availability');
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to update availability');
            }
          },
        },
      ]
    );
  };

  const handleDeleteItem = (item: RentalItem) => {
    Alert.alert(
      'Delete Item',
      `Are you sure you want to delete "${item.title}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await ItemService.deleteItem(item.id);
              if (result.success) {
                setItems(prev => prev.filter(i => i.id !== item.id));
                Alert.alert('Success', 'Item deleted successfully');
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
  };

  const renderItem = ({ item }: { item: RentalItem }) => (
    <TouchableOpacity
      style={styles.itemCard}
      onPress={() => navigation.navigate('ItemDetails', { itemId: item.id })}
    >
      <Image source={{ uri: item.image }} style={styles.itemImage} />
      
      <View style={styles.itemInfo}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
          <View style={[
            styles.statusBadge,
            item.isAvailable ? styles.availableBadge : styles.unavailableBadge
          ]}>
            <Text style={[
              styles.statusText,
              item.isAvailable ? styles.availableText : styles.unavailableText
            ]}>
              {item.isAvailable ? 'Available' : 'Unavailable'}
            </Text>
          </View>
        </View>
        
        <Text style={styles.itemCategory}>{item.category}</Text>
        <Text style={styles.itemPrice}>${item.pricePerDay}/day</Text>
        
        <View style={styles.itemActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('AddItem', { editItemId: item.id })}
          >
            <Ionicons name="pencil-outline" size={18} color={Colors.secondary} />
            <Text style={styles.actionText}>Edit</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleToggleAvailability(item)}
          >
            <Ionicons 
              name={item.isAvailable ? 'eye-off-outline' : 'eye-outline'} 
              size={18} 
              color={Colors.text} 
            />
            <Text style={styles.actionText}>
              {item.isAvailable ? 'Hide' : 'Show'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleDeleteItem(item)}
          >
            <Ionicons name="trash-outline" size={18} color={Colors.danger} />
            <Text style={[styles.actionText, { color: Colors.danger }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="cube-outline" size={64} color={Colors.border} />
      <Text style={styles.emptyTitle}>No Items Listed</Text>
      <Text style={styles.emptySubtitle}>
        You haven't listed any items for rent yet.
      </Text>
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => navigation.navigate('AddItem')}
      >
        <Ionicons name="add" size={20} color={Colors.text} />
        <Text style={styles.addButtonText}>List Your First Item</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading && items.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Items</Text>
          <View style={styles.headerSpacer} />
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Items ({items.length})</Text>
        <TouchableOpacity 
          style={styles.addIconButton}
          onPress={() => navigation.navigate('AddItem')}
        >
          <Ionicons name="add-circle-outline" size={28} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
        ListEmptyComponent={renderEmptyState}
      />
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
  headerSpacer: {
    width: 32,
  },
  addIconButton: {
    padding: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  itemCard: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  itemImage: {
    width: 100,
    height: 120,
    backgroundColor: Colors.border,
  },
  itemInfo: {
    flex: 1,
    padding: 12,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  availableBadge: {
    backgroundColor: Colors.success + '20',
  },
  unavailableBadge: {
    backgroundColor: Colors.danger + '20',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  availableText: {
    color: Colors.success,
  },
  unavailableText: {
    color: Colors.danger,
  },
  itemCategory: {
    fontSize: 13,
    color: Colors.secondary,
    marginBottom: 4,
  },
  itemPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  itemActions: {
    flexDirection: 'row',
    gap: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
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
    opacity: 0.6,
    textAlign: 'center',
    marginBottom: 24,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
});
