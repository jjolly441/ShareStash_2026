// src/screens/HomeScreen.tsx - With Map View, Distance Filtering, and Verification Banner
import React, { useState, useEffect, useContext, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  TextInput,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Slider from '../components/NativeSlider';
import { MapView, Marker } from '../components/NativeMap';
import * as Location from 'expo-location';
import { isWeb } from '../utils/platform';
import { StackNavigationProp } from '@react-navigation/stack';
import ItemService, { RentalItem } from '../services/ItemService';
import WishlistService from '../services/WishlistService';
import { useTranslation } from '../i18n/useTranslation';
import { AuthContext } from '../contexts/AuthContext';

// Verification Banner - encourages unverified users to verify
import VerificationBanner from '../components/VerificationBanner';

const Colors = {
  primary: '#F5C542',
  secondary: '#2E86AB',
  success: '#46A758',
  background: '#F8F9FA',
  text: '#212529',
  white: '#FFFFFF',
  border: '#E9ECEF',
};

type ViewMode = 'list' | 'map';

interface ItemWithDistance extends RentalItem {
  distance?: number;
}

type HomeScreenProps = {
  navigation: StackNavigationProp<any>;
};

export default function HomeScreen({ navigation }: HomeScreenProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ItemWithDistance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [radiusMiles, setRadiusMiles] = useState(25);
  const [locationPermission, setLocationPermission] = useState(false);
  const mapRef = useRef<MapView>(null);
  const { user } = useContext(AuthContext);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  const categories = ['All', ...ItemService.getCategories()];

  useEffect(() => {
    requestLocationPermission();
  }, []);

  // Subscribe to wishlist changes
  useEffect(() => {
    if (user?.id) {
      WishlistService.subscribe(user.id, (ids) => setFavoriteIds(new Set(ids)));
    }
    return () => WishlistService.unsubscribeAll();
  }, [user?.id]);

  useEffect(() => {
    loadItems();
  }, [userLocation, radiusMiles]);

  useEffect(() => {
    filterItems();
  }, [searchQuery, selectedCategory]);

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setLocationPermission(true);
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      } else {
        setLocationPermission(false);
        Alert.alert(
          'Location Permission',
          'Location access is needed to show items near you. You can still browse all items.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error requesting location permission:', error);
    }
  };

  const loadItems = async () => {
    try {
      let allItems: ItemWithDistance[] = [];
      
      if (userLocation) {
        // Get items with distance calculated
        allItems = await ItemService.getItemsNearLocation(
          userLocation.latitude,
          userLocation.longitude,
          radiusMiles
        );
      } else {
        // Get all items without distance
        allItems = await ItemService.getAvailableItems();
      }

      setItems(allItems);
    } catch (error) {
      Alert.alert('Error', 'Failed to load items');
    } finally {
      setLoading(false);
    }
  };

  const filterItems = async () => {
    try {
      let filteredItems: ItemWithDistance[] = [];

      if (userLocation) {
        const nearbyItems = await ItemService.getItemsNearLocation(
          userLocation.latitude,
          userLocation.longitude,
          radiusMiles
        );

        if (searchQuery.trim()) {
          const lowerQuery = searchQuery.toLowerCase();
          filteredItems = nearbyItems.filter(item =>
            item.title.toLowerCase().includes(lowerQuery) ||
            item.description.toLowerCase().includes(lowerQuery) ||
            item.category.toLowerCase().includes(lowerQuery)
          );
        } else if (selectedCategory === 'All') {
          filteredItems = nearbyItems;
        } else {
          filteredItems = nearbyItems.filter(item => item.category === selectedCategory);
        }
      } else {
        const allItems = await ItemService.getAvailableItems();

        if (searchQuery.trim()) {
          const lowerQuery = searchQuery.toLowerCase();
          filteredItems = allItems.filter(item =>
            item.title.toLowerCase().includes(lowerQuery) ||
            item.description.toLowerCase().includes(lowerQuery) ||
            item.category.toLowerCase().includes(lowerQuery)
          );
        } else if (selectedCategory === 'All') {
          filteredItems = allItems;
        } else {
          filteredItems = allItems.filter(item => item.category === selectedCategory);
        }
      }

      setItems(filteredItems);
    } catch (error) {
      console.error('Error filtering items:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadItems();
    setRefreshing(false);
  };

  const handleItemPress = (item: ItemWithDistance) => {
    navigation.navigate('ItemDetails', { itemId: item.id });
  };

  const fitMapToMarkers = () => {
    if (mapRef.current && items.length > 0) {
      const coordinates = items
        .filter(item => item.location?.coordinates)
        .map(item => ({
          latitude: item.location!.coordinates!.latitude,
          longitude: item.location!.coordinates!.longitude,
        }));

      if (coordinates.length > 0 && userLocation) {
        coordinates.push(userLocation);
        mapRef.current.fitToCoordinates(coordinates, {
          edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
          animated: true,
        });
      }
    }
  };

  useEffect(() => {
    if (viewMode === 'map' && items.length > 0) {
      setTimeout(fitMapToMarkers, 500);
    }
  }, [viewMode, items]);

  const renderCategoryButton = (category: string) => (
    <TouchableOpacity
      key={category}
      style={[
        styles.categoryButton,
        selectedCategory === category && styles.categoryButtonActive
      ]}
      onPress={() => setSelectedCategory(category)}
    >
      <Text style={[
        styles.categoryButtonText,
        selectedCategory === category && styles.categoryButtonTextActive
      ]}>
        {category}
      </Text>
    </TouchableOpacity>
  );

  const handleToggleFavorite = async (itemId: string) => {
    if (!user?.id) return;
    try {
      await WishlistService.toggleWishlist(user.id, itemId);
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const renderItem = ({ item }: { item: ItemWithDistance }) => {
    const isOwn = item.ownerId === user?.id;
    const isFav = favoriteIds.has(item.id);
    return (
    <TouchableOpacity style={styles.itemCard} onPress={() => handleItemPress(item)}>
      <View>
        <Image source={{ uri: item.image }} style={styles.itemImage} />
        {!isOwn && (
          <TouchableOpacity
            style={styles.heartButton}
            onPress={() => handleToggleFavorite(item.id)}
          >
            <Ionicons
              name={isFav ? 'heart' : 'heart-outline'}
              size={20}
              color={isFav ? '#EF4444' : Colors.white}
            />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.itemInfo}>
        <Text style={styles.itemTitle}>{item.title}</Text>
        <Text style={styles.itemCategory}>{item.category}</Text>
        <Text style={styles.itemDescription} numberOfLines={2}>
          {item.description}
        </Text>
        <View style={styles.itemFooter}>
          <View>
            <Text style={styles.itemPrice}>${item.pricePerDay}/day</Text>
            <Text style={styles.itemOwner}>by {item.ownerName}</Text>
            {item.distance !== undefined && (
              <View style={styles.distanceBadge}>
                <Ionicons name="location" size={12} color={Colors.secondary} />
                <Text style={styles.distanceText}>{t('home.miAway', { distance: item.distance })}</Text>
              </View>
            )}
            {(item.viewCount || 0) > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                <Ionicons name="eye-outline" size={11} color="#aaa" />
                <Text style={{ fontSize: 11, color: '#aaa', marginLeft: 3 }}>{item.viewCount}</Text>
              </View>
            )}
          </View>
          <View style={styles.availabilityBadge}>
            <Text style={styles.availabilityText}>{t('common.available')}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
  };

  // List header component that includes the Verification Banner
  const renderListHeader = () => (
    <View>
      {/* Verification Banner - shows for unverified users, dismissible */}
      <VerificationBanner 
        variant="card" 
        dismissible={true} 
        style={styles.verificationBanner}
      />
    </View>
  );

  const renderMapView = () => {
    // Maps not available on web
    if (isWeb) {
      return (
        <View style={styles.mapPlaceholder}>
          <Ionicons name="map-outline" size={64} color={Colors.text} />
          <Text style={styles.mapPlaceholderTitle}>Map View</Text>
          <Text style={styles.mapPlaceholderText}>
            Map view is available in the ShareStash mobile app
          </Text>
        </View>
      );
    }

    if (!userLocation) {
      return (
        <View style={styles.mapPlaceholder}>
          <Ionicons name="location-outline" size={64} color={Colors.text} />
          <Text style={styles.mapPlaceholderTitle}>Location Required</Text>
          <Text style={styles.mapPlaceholderText}>
            Enable location services to view items on the map
          </Text>
          <TouchableOpacity style={styles.enableButton} onPress={requestLocationPermission}>
            <Text style={styles.enableButtonText}>Enable Location</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={{
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
            latitudeDelta: 0.5,
            longitudeDelta: 0.5,
          }}
          showsUserLocation
          showsMyLocationButton
        >
          {items
            .filter(item => item.location?.coordinates)
            .map(item => (
              <Marker
                key={item.id}
                coordinate={{
                  latitude: item.location!.coordinates!.latitude,
                  longitude: item.location!.coordinates!.longitude,
                }}
                onPress={() => handleItemPress(item)}
              >
                <View style={styles.markerContainer}>
                  <View style={styles.marker}>
                    <Text style={styles.markerText}>${item.pricePerDay}</Text>
                  </View>
                  <View style={styles.markerArrow} />
                </View>
              </Marker>
            ))}
        </MapView>

        {/* Distance Filter Overlay */}
        <View style={styles.distanceFilterOverlay}>
          <View style={styles.distanceFilterCard}>
            <View style={styles.distanceFilterHeader}>
              <Ionicons name="location" size={20} color={Colors.secondary} />
              <Text style={styles.distanceFilterTitle}>
                Search Radius: {radiusMiles} miles
              </Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={5}
              maximumValue={100}
              step={5}
              value={radiusMiles}
              onValueChange={setRadiusMiles}
              minimumTrackTintColor={Colors.secondary}
              maximumTrackTintColor={Colors.border}
            />
            <View style={styles.sliderLabels}>
              <Text style={styles.sliderLabel}>5 mi</Text>
              <Text style={styles.sliderLabel}>100 mi</Text>
            </View>
          </View>
        </View>

        {/* Items Count Badge */}
        <View style={styles.itemsCountBadge}>
          <Text style={styles.itemsCountText}>{items.length} items nearby</Text>
        </View>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="search-outline" size={64} color={Colors.text} />
      <Text style={styles.emptyTitle}>{t('home.noItemsFound')}</Text>
      <Text style={styles.emptySubtitle}>
        {t('home.noItemsMessage')}
      </Text>
      {userLocation && items.length === 0 && (
        <TouchableOpacity 
          style={styles.increaseRadiusButton}
          onPress={() => setRadiusMiles(Math.min(radiusMiles + 25, 100))}
        >
          <Text style={styles.increaseRadiusText}>Increase Search Radius</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.title}>Browse Items</Text>
            <Text style={styles.subtitle}>
              {userLocation 
                ? `${items.length} items within ${radiusMiles} miles`
                : 'Find what you need in your community'}
            </Text>
          </View>
          
          {/* View Mode Toggle */}
          <View style={styles.viewModeToggle}>
            <TouchableOpacity
              style={[styles.viewModeButton, viewMode === 'list' && styles.viewModeButtonActive]}
              onPress={() => setViewMode('list')}
            >
              <Ionicons 
                name="list" 
                size={20} 
                color={viewMode === 'list' ? Colors.white : Colors.text} 
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewModeButton, viewMode === 'map' && styles.viewModeButtonActive]}
              onPress={() => setViewMode('map')}
            >
              <Ionicons 
                name="map" 
                size={20} 
                color={viewMode === 'map' ? Colors.white : Colors.text} 
              />
            </TouchableOpacity>
          </View>
        </View>
        
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={Colors.text} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('home.searchPlaceholder')}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={Colors.text} />
            </TouchableOpacity>
          )}
        </View>

        {/* Category Filter */}
        <FlatList
          data={categories}
          renderItem={({ item }) => renderCategoryButton(item)}
          keyExtractor={(item) => item}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryList}
        />
      </View>

      {/* Content Area */}
      {viewMode === 'list' ? (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          style={styles.itemsList}
          numColumns={isWeb && Dimensions.get('window').width >= 768 ? (Dimensions.get('window').width >= 1024 ? 3 : 2) : 1}
          key={isWeb ? (Dimensions.get('window').width >= 1024 ? '3col' : Dimensions.get('window').width >= 768 ? '2col' : '1col') : '1col'}
          columnWrapperStyle={isWeb && Dimensions.get('window').width >= 768 ? { gap: 12 } : undefined}
          contentContainerStyle={isWeb ? { maxWidth: 1200, alignSelf: 'center', width: '100%', paddingHorizontal: 16 } : undefined}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={!loading ? renderEmptyState : null}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        renderMapView()
      )}

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      )}
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
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.text,
    opacity: 0.7,
  },
  viewModeToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 2,
  },
  viewModeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  viewModeButtonActive: {
    backgroundColor: Colors.secondary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    color: Colors.text,
  },
  categoryList: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categoryButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  categoryButtonText: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
  },
  categoryButtonTextActive: {
    color: Colors.text,
    fontWeight: 'bold',
  },
  itemsList: {
    flex: 1,
    padding: 20,
  },
  // Verification Banner styling
  verificationBanner: {
    marginBottom: 16,
  },
  itemCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    flex: 1,
  },
  itemImage: {
    width: '100%',
    height: 200,
    backgroundColor: Colors.background,
  },
  heartButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemInfo: {
    padding: 16,
  },
  itemTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  itemCategory: {
    fontSize: 14,
    color: Colors.secondary,
    marginBottom: 8,
  },
  itemDescription: {
    fontSize: 14,
    color: Colors.text,
    opacity: 0.7,
    lineHeight: 20,
    marginBottom: 12,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  itemPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
  },
  itemOwner: {
    fontSize: 12,
    color: Colors.text,
    opacity: 0.6,
    marginTop: 2,
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  distanceText: {
    fontSize: 12,
    color: Colors.secondary,
    fontWeight: '600',
  },
  availabilityBadge: {
    backgroundColor: Colors.success,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  availabilityText: {
    fontSize: 12,
    color: Colors.white,
    fontWeight: '600',
  },
  mapContainer: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  mapPlaceholderTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  mapPlaceholderText: {
    fontSize: 16,
    color: Colors.text,
    opacity: 0.7,
    textAlign: 'center',
    marginBottom: 24,
  },
  enableButton: {
    backgroundColor: Colors.secondary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  enableButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  markerContainer: {
    alignItems: 'center',
  },
  marker: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  markerText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  markerArrow: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: Colors.primary,
    marginTop: -1,
  },
  distanceFilterOverlay: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
  },
  distanceFilterCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  distanceFilterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  distanceFilterTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderLabel: {
    fontSize: 12,
    color: Colors.text,
    opacity: 0.6,
  },
  itemsCountBadge: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  itemsCountText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
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
  increaseRadiusButton: {
    backgroundColor: Colors.secondary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  increaseRadiusText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

