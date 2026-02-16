// src/screens/MeetingLocationScreen.tsx — Propose & confirm meeting location for rental handoff
import React, { useState, useEffect, useContext, useRef } from 'react';
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
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { RentalService, Rental } from '../services/RentalService';
import NotificationService from '../services/NotificationService';
import { AuthContext } from '../contexts/AuthContext';
import { RootStackParamList } from '../types/navigation';

const Colors = {
  primary: '#F5C542',
  secondary: '#2E86AB',
  success: '#46A758',
  warning: '#F59E0B',
  background: '#F8F9FA',
  text: '#212529',
  white: '#FFFFFF',
  border: '#E9ECEF',
  danger: '#DC3545',
  muted: '#6C757D',
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type MeetingLocationNavigationProp = StackNavigationProp<RootStackParamList, 'MeetingLocation'>;
type MeetingLocationRouteProp = RouteProp<RootStackParamList, 'MeetingLocation'>;

interface Props {
  navigation: MeetingLocationNavigationProp;
  route: MeetingLocationRouteProp;
}

export interface MeetingLocationData {
  latitude: number;
  longitude: number;
  address: string;
  notes?: string;
  proposedBy: string;       // userId
  proposedByName: string;   // display name
  status: 'proposed' | 'accepted';
  proposedAt: string;
  acceptedAt?: string;
  acceptedBy?: string;
}

export default function MeetingLocationScreen({ navigation, route }: Props) {
  const { rentalId } = route.params;
  const { user } = useContext(AuthContext);

  const mapRef = useRef<MapView>(null);
  const [rental, setRental] = useState<Rental | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);

  // Map state
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Existing location state
  const [existingLocation, setExistingLocation] = useState<MeetingLocationData | null>(null);
  const [isViewOnly, setIsViewOnly] = useState(false);

  const isOwner = user?.id === rental?.ownerId;

  // Default region (will center on item location or user location)
  const [region, setRegion] = useState<Region>({
    latitude: 39.1377,   // Default to Gaithersburg, MD area
    longitude: -77.2014,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  });

  useEffect(() => {
    loadRental();
  }, [rentalId]);

  const loadRental = async () => {
    try {
      setLoading(true);
      const rentalData = await RentalService.getRentalById(rentalId);
      if (!rentalData) {
        Alert.alert('Error', 'Rental not found');
        navigation.goBack();
        return;
      }
      setRental(rentalData);

      // Check if there's already a proposed/accepted location
      const loc = (rentalData as any).meetingLocation as MeetingLocationData | undefined;
      if (loc) {
        setExistingLocation(loc);
        setPin({ latitude: loc.latitude, longitude: loc.longitude });
        setAddress(loc.address);
        setNotes(loc.notes || '');
        setRegion({
          latitude: loc.latitude,
          longitude: loc.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });

        // If location is accepted, or if current user proposed it and it's pending, show view-only
        if (loc.status === 'accepted') {
          setIsViewOnly(true);
        } else if (loc.status === 'proposed' && loc.proposedBy === user?.id) {
          // User already proposed, waiting for other party
          setIsViewOnly(true);
        }
      } else {
        // Try to center on user's current location
        getUserLocation();
      }
    } catch (error) {
      console.error('Error loading rental:', error);
      Alert.alert('Error', 'Failed to load rental');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  // ─── Location helpers ────────────────────────────────────────────
  const getUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const newRegion = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
      setRegion(newRegion);
    } catch (error) {
      console.log('Could not get user location:', error);
    }
  };

  const useCurrentLocation = async () => {
    try {
      setLocationLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Location access is needed to use this feature.');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const coords = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };

      setPin(coords);

      // Reverse geocode
      const addresses = await Location.reverseGeocodeAsync(coords);
      if (addresses && addresses.length > 0) {
        const addr = addresses[0];
        const formatted = [
          addr.streetNumber,
          addr.street,
          addr.city,
          addr.region,
          addr.postalCode,
        ].filter(Boolean).join(', ');
        setAddress(formatted || 'Current location');
      }

      const newRegion = {
        ...coords,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      };
      setRegion(newRegion);
      mapRef.current?.animateToRegion(newRegion, 500);
    } catch (error) {
      Alert.alert('Error', 'Failed to get your location');
    } finally {
      setLocationLoading(false);
    }
  };

  const searchAddress = async () => {
    if (!searchQuery.trim()) return;

    try {
      setLocationLoading(true);
      const results = await Location.geocodeAsync(searchQuery);

      if (results && results.length > 0) {
        const coords = {
          latitude: results[0].latitude,
          longitude: results[0].longitude,
        };
        setPin(coords);
        setAddress(searchQuery);

        const newRegion = {
          ...coords,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        };
        setRegion(newRegion);
        mapRef.current?.animateToRegion(newRegion, 500);
      } else {
        Alert.alert('Not Found', 'Could not find that address. Try being more specific.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to search for address');
    } finally {
      setLocationLoading(false);
    }
  };

  const handleMapPress = async (e: any) => {
    if (isViewOnly) return;

    const coords = e.nativeEvent.coordinate;
    setPin(coords);

    // Reverse geocode the tapped location
    try {
      const addresses = await Location.reverseGeocodeAsync(coords);
      if (addresses && addresses.length > 0) {
        const addr = addresses[0];
        const formatted = [
          addr.streetNumber,
          addr.street,
          addr.city,
          addr.region,
          addr.postalCode,
        ].filter(Boolean).join(', ');
        setAddress(formatted || 'Selected location');
      } else {
        setAddress('Selected location');
      }
    } catch {
      setAddress('Selected location');
    }
  };

  // ─── Propose / Accept / Change ───────────────────────────────────
  const handlePropose = async () => {
    if (!pin || !user || !rental) return;

    Alert.alert(
      'Propose Meeting Location',
      `Suggest this location for the handoff?\n\n${address}${notes ? `\n\nNote: ${notes}` : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Propose',
          onPress: async () => {
            try {
              setSubmitting(true);

              const locationData: MeetingLocationData = {
                latitude: pin.latitude,
                longitude: pin.longitude,
                address,
                notes: notes || undefined,
                proposedBy: user.id,
                proposedByName: `${user.firstName} ${user.lastName}`,
                status: 'proposed',
                proposedAt: new Date().toISOString(),
              };

              const rentalRef = doc(db, 'rentals', rental.id!);
              await updateDoc(rentalRef, {
                meetingLocation: locationData,
                updatedAt: Timestamp.now(),
              });

              // Notify the other party
              const otherUserId = isOwner ? rental.renterId : rental.ownerId;
              await NotificationService.sendNotificationToUser(
                otherUserId,
                '📍 Meeting Location Proposed',
                `${user.firstName} suggested a meeting spot for "${rental.itemName}": ${address}`,
                {
                  type: 'meeting_location_proposed',
                  rentalId: rental.id!,
                  screen: 'MeetingLocation',
                }
              );

              Alert.alert(
                'Location Proposed',
                'The other party has been notified. They can accept or suggest a different spot.',
                [{ text: 'OK', onPress: () => navigation.goBack() }]
              );
            } catch (error: any) {
              console.error('Error proposing location:', error);
              Alert.alert('Error', error.message || 'Failed to propose location');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const handleAccept = async () => {
    if (!existingLocation || !user || !rental) return;

    Alert.alert(
      'Accept Meeting Location',
      `Confirm this as the handoff location?\n\n${existingLocation.address}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            try {
              setSubmitting(true);

              const rentalRef = doc(db, 'rentals', rental.id!);
              await updateDoc(rentalRef, {
                'meetingLocation.status': 'accepted',
                'meetingLocation.acceptedAt': new Date().toISOString(),
                'meetingLocation.acceptedBy': user.id,
                updatedAt: Timestamp.now(),
              });

              // Notify proposer
              await NotificationService.sendNotificationToUser(
                existingLocation.proposedBy,
                '✅ Meeting Location Accepted',
                `${user.firstName} accepted the meeting spot for "${rental.itemName}": ${existingLocation.address}`,
                {
                  type: 'meeting_location_accepted',
                  rentalId: rental.id!,
                  screen: 'Rentals',
                }
              );

              Alert.alert(
                'Location Confirmed',
                'The meeting location has been confirmed for this rental.',
                [{ text: 'OK', onPress: () => navigation.goBack() }]
              );
            } catch (error: any) {
              console.error('Error accepting location:', error);
              Alert.alert('Error', error.message || 'Failed to accept location');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const handleSuggestDifferent = () => {
    // Reset to editing mode so user can pick a new spot
    setIsViewOnly(false);
    setExistingLocation(null);
    setPin(null);
    setAddress('');
    setNotes('');
  };

  // ─── Render ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!rental || !user) return null;

  const isPendingOtherParty = existingLocation?.status === 'proposed' && existingLocation?.proposedBy === user.id;
  const needsMyAcceptance = existingLocation?.status === 'proposed' && existingLocation?.proposedBy !== user.id;
  const isAccepted = existingLocation?.status === 'accepted';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Meeting Location</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Status banner */}
          {isAccepted && (
            <View style={[styles.statusBanner, { backgroundColor: Colors.success + '15' }]}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
              <Text style={[styles.statusBannerText, { color: Colors.success }]}>
                Meeting location confirmed
              </Text>
            </View>
          )}

          {isPendingOtherParty && (
            <View style={[styles.statusBanner, { backgroundColor: Colors.warning + '15' }]}>
              <Ionicons name="time" size={20} color={Colors.warning} />
              <Text style={[styles.statusBannerText, { color: Colors.warning }]}>
                Waiting for {isOwner ? rental.renterName : rental.ownerName} to accept your proposed location
              </Text>
            </View>
          )}

          {needsMyAcceptance && (
            <View style={[styles.statusBanner, { backgroundColor: Colors.secondary + '15' }]}>
              <Ionicons name="location" size={20} color={Colors.secondary} />
              <Text style={[styles.statusBannerText, { color: Colors.secondary }]}>
                {existingLocation?.proposedByName} proposed this meeting spot. Accept or suggest a different one.
              </Text>
            </View>
          )}

          {/* Map */}
          <View style={styles.mapContainer}>
            <MapView
              ref={mapRef}
              style={styles.map}
              region={region}
              onRegionChangeComplete={setRegion}
              onPress={handleMapPress}
              showsUserLocation
              showsMyLocationButton={false}
            >
              {pin && (
                <Marker
                  coordinate={pin}
                  draggable={!isViewOnly}
                  onDragEnd={(e) => handleMapPress(e)}
                  title="Meeting Point"
                  description={address}
                />
              )}
            </MapView>

            {/* Map overlay buttons */}
            {!isViewOnly && (
              <TouchableOpacity
                style={styles.myLocationButton}
                onPress={useCurrentLocation}
                disabled={locationLoading}
              >
                {locationLoading ? (
                  <ActivityIndicator size="small" color={Colors.secondary} />
                ) : (
                  <Ionicons name="locate" size={22} color={Colors.secondary} />
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Search bar (only in edit mode) */}
          {!isViewOnly && (
            <View style={styles.searchRow}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search for an address..."
                placeholderTextColor={Colors.muted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={searchAddress}
                returnKeyType="search"
              />
              <TouchableOpacity
                style={styles.searchButton}
                onPress={searchAddress}
                disabled={locationLoading}
              >
                <Ionicons name="search" size={20} color={Colors.white} />
              </TouchableOpacity>
            </View>
          )}

          {/* Tap hint */}
          {!isViewOnly && !pin && (
            <View style={styles.hintCard}>
              <Ionicons name="finger-print" size={20} color={Colors.muted} />
              <Text style={styles.hintText}>
                Tap the map to drop a pin, search for an address, or use your current location
              </Text>
            </View>
          )}

          {/* Selected address display */}
          {(pin || existingLocation) && (
            <View style={styles.addressCard}>
              <View style={styles.addressHeader}>
                <Ionicons name="location" size={20} color={Colors.secondary} />
                <Text style={styles.addressLabel}>Meeting Point</Text>
              </View>
              <Text style={styles.addressText}>{address || 'Selected location'}</Text>

              {/* Notes */}
              {isViewOnly && existingLocation?.notes ? (
                <View style={styles.notesDisplay}>
                  <Text style={styles.notesLabel}>Notes:</Text>
                  <Text style={styles.notesText}>{existingLocation.notes}</Text>
                </View>
              ) : !isViewOnly ? (
                <TextInput
                  style={styles.notesInput}
                  placeholder="Add a note (e.g., Meet at the front entrance)"
                  placeholderTextColor={Colors.muted}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={2}
                />
              ) : null}
            </View>
          )}

          {/* Action buttons */}
          {!isViewOnly && pin && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.proposeBtn, submitting && { opacity: 0.6 }]}
              onPress={handlePropose}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <>
                  <Ionicons name="send" size={20} color={Colors.white} />
                  <Text style={styles.actionBtnText}>Propose This Location</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {needsMyAcceptance && (
            <View style={styles.acceptRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.acceptBtn, { flex: 1 }, submitting && { opacity: 0.6 }]}
                onPress={handleAccept}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color={Colors.white} />
                    <Text style={styles.actionBtnText}>Accept</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.suggestDiffBtn, { flex: 1 }]}
                onPress={handleSuggestDifferent}
              >
                <Ionicons name="swap-horizontal" size={20} color={Colors.white} />
                <Text style={styles.actionBtnText}>Suggest Different</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: Colors.muted,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  // Status banner
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  statusBannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  // Map
  mapContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  map: {
    width: '100%',
    height: 260,
  },
  myLocationButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: Colors.white,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  // Search
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
  },
  searchButton: {
    backgroundColor: Colors.secondary,
    width: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Hint
  hintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 10,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  hintText: {
    flex: 1,
    fontSize: 14,
    color: Colors.muted,
    lineHeight: 20,
  },
  // Address card
  addressCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  addressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  addressLabel: {
    fontSize: 15,
    fontWeight: 'bold',
    color: Colors.text,
  },
  addressText: {
    fontSize: 15,
    color: Colors.text,
    lineHeight: 22,
    marginBottom: 8,
  },
  notesInput: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 50,
    textAlignVertical: 'top',
  },
  notesDisplay: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 12,
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.muted,
    marginBottom: 4,
  },
  notesText: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
  // Action buttons
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  proposeBtn: {
    backgroundColor: Colors.secondary,
    marginBottom: 12,
  },
  acceptBtn: {
    backgroundColor: Colors.success,
  },
  suggestDiffBtn: {
    backgroundColor: Colors.muted,
  },
  actionBtnText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  acceptRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
});