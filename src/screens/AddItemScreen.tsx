// src/screens/AddItemScreen.tsx - With Location Features
// UPDATED: Added identity verification gate while preserving all original functionality
import React, { useState, useContext, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import ItemService from '../services/ItemService';
import { AuthContext } from '../contexts/AuthContext';
import {
  VerificationService,
  VerificationStatus,
} from '../services/VerificationService';
import { RootStackParamList } from '../types/navigation';

const Colors = {
  primary: '#F5C542',
  secondary: '#2E86AB',
  success: '#46A758',
  background: '#F8F9FA',
  text: '#212529',
  white: '#FFFFFF',
  border: '#E9ECEF',
  warning: '#FF9800',
};

type AddItemScreenNavigationProp = StackNavigationProp<RootStackParamList>;

interface ItemData {
  title: string;
  description: string;
  category: string;
  pricePerDay: string;
  image: string | null;
  location: {
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

const categories = [
  'Electronics',
  'Camera & Photo',
  'Sports & Outdoors',
  'Tools & Equipment',
  'Musical Instruments',
  'Party & Events',
  'Other',
];

// ============================================================================
// VERIFICATION REQUIRED COMPONENT (NEW)
// ============================================================================

interface VerificationRequiredProps {
  onVerify: () => void;
}

const VerificationRequired: React.FC<VerificationRequiredProps> = ({ onVerify }) => (
  <View style={styles.verificationRequiredContainer}>
    <View style={styles.verificationRequiredContent}>
      <View style={styles.verificationIcon}>
        <Ionicons name="shield-outline" size={64} color={Colors.warning} />
      </View>
      <Text style={styles.verificationRequiredTitle}>
        Identity Verification Required
      </Text>
      <Text style={styles.verificationRequiredDescription}>
        To protect our community, you need to verify your identity before
        listing items for rent.
      </Text>
      <View style={styles.benefitsContainer}>
        <Text style={styles.benefitsTitle}>Verification helps ensure safety:</Text>
        <View style={styles.benefitItem}>
          <Ionicons name="shield-checkmark" size={20} color={Colors.success} />
          <Text style={styles.benefitText}>Builds trust with potential renters</Text>
        </View>
        <View style={styles.benefitItem}>
          <Ionicons name="shield-checkmark" size={20} color={Colors.success} />
          <Text style={styles.benefitText}>Protects against fraud and disputes</Text>
        </View>
        <View style={styles.benefitItem}>
          <Ionicons name="shield-checkmark" size={20} color={Colors.success} />
          <Text style={styles.benefitText}>Unlocks all platform features</Text>
        </View>
      </View>
      <View style={styles.requirementsCard}>
        <Text style={styles.requirementsTitle}>What you'll need:</Text>
        <View style={styles.requirementItem}>
          <Ionicons name="card-outline" size={18} color={Colors.text} />
          <Text style={styles.requirementText}>
            Government-issued ID (driver's license, passport, or national ID)
          </Text>
        </View>
        <View style={styles.requirementItem}>
          <Ionicons name="camera-outline" size={18} color={Colors.text} />
          <Text style={styles.requirementText}>Camera access for selfie verification</Text>
        </View>
        <View style={styles.requirementItem}>
          <Ionicons name="time-outline" size={18} color={Colors.text} />
          <Text style={styles.requirementText}>About 2-3 minutes</Text>
        </View>
      </View>
      <TouchableOpacity style={styles.verifyIdentityButton} onPress={onVerify}>
        <Ionicons name="shield-checkmark" size={20} color={Colors.text} />
        <Text style={styles.verifyIdentityButtonText}>Verify My Identity</Text>
      </TouchableOpacity>
      <Text style={styles.securityNote}>
        🔒 Your information is securely processed by Stripe and never stored on our servers.
      </Text>
    </View>
  </View>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AddItemScreen({ route }: any) {
  const navigation = useNavigation<AddItemScreenNavigationProp>();
  const { user } = useContext(AuthContext);
  
  // Check if we're editing an existing item
  const editItemId = route?.params?.editItemId;
  const isEditing = !!editItemId;

  // NEW: Verification state
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus | null>(null);
  const [checkingVerification, setCheckingVerification] = useState(true);

  // ORIGINAL: Form state (unchanged)
  const [itemData, setItemData] = useState<ItemData>({
    title: '',
    description: '',
    category: '',
    pricePerDay: '',
    image: null,
    location: {
      address: '',
      city: '',
      state: '',
      zipCode: '',
      coordinates: null,
    },
  });
 const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [loadingItem, setLoadingItem] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [locationMethod, setLocationMethod] = useState<'auto' | 'manual'>('manual');

  // ==========================================================================
  // NEW: VERIFICATION CHECK
  // ==========================================================================

  useEffect(() => {
    checkVerificationStatus();
  }, [user]);

  const checkVerificationStatus = async () => {
    if (!user) {
      setCheckingVerification(false);
      return;
    }
    setCheckingVerification(true);
    try {
      const status = await VerificationService.getUserVerificationStatus(user.id);
      setVerificationStatus(status);
    } catch (error) {
      console.error('Error checking verification status:', error);
    } finally {
      setCheckingVerification(false);
    }
  };

 const handleVerifyIdentity = () => {
    navigation.navigate('VerifyIdentity');
  };

  // ==========================================================================
  // EDIT MODE: Load existing item data
  // ==========================================================================
  
  useEffect(() => {
    if (editItemId) {
      loadExistingItem();
    }
  }, [editItemId]);

  const loadExistingItem = async () => {
    try {
      setLoadingItem(true);
      const existingItem = await ItemService.getItemById(editItemId);
      if (existingItem) {
        setItemData({
          title: existingItem.title,
          description: existingItem.description,
          category: existingItem.category,
          pricePerDay: existingItem.pricePerDay.toString(),
          image: existingItem.image,
          location: existingItem.location || {
            address: '',
            city: '',
            state: '',
            zipCode: '',
            coordinates: null,
          },
        });
      } else {
        Alert.alert('Error', 'Item not found');
        navigation.goBack();
      }
    } catch (error) {
      console.error('Error loading item:', error);
      Alert.alert('Error', 'Failed to load item');
      navigation.goBack();
    } finally {
      setLoadingItem(false);
    }
  };

  // ==========================================================================
  // ORIGINAL: All form handlers (unchanged)
  // ==========================================================================

  // ==========================================================================
  // ORIGINAL: All form handlers (unchanged)
  // ==========================================================================

  const updateField = (field: keyof ItemData, value: any) => {
    setItemData(prev => ({ ...prev, [field]: value }));
  };

  const updateLocationField = (field: keyof ItemData['location'], value: any) => {
    setItemData(prev => ({
      ...prev,
      location: { ...prev.location, [field]: value }
    }));
  };

  const getCurrentLocation = async () => {
    try {
      setLocationLoading(true);

      // Request permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Location permission is required to use this feature. Please enable it in settings.'
        );
        return;
      }

      // Get current position
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      // Reverse geocode to get address
      const addresses = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (addresses && addresses.length > 0) {
        const addr = addresses[0];
        setItemData(prev => ({
          ...prev,
          location: {
            address: `${addr.street || ''} ${addr.streetNumber || ''}`.trim(),
            city: addr.city || '',
            state: addr.region || '',
            zipCode: addr.postalCode || '',
            coordinates: {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            },
          },
        }));
        Alert.alert('Success', 'Location detected successfully!');
      }
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert('Error', 'Failed to get current location. Please enter manually.');
    } finally {
      setLocationLoading(false);
    }
  };

  const geocodeAddress = async () => {
    const { address, city, state, zipCode } = itemData.location;
    
    if (!address || !city || !state) {
      Alert.alert('Error', 'Please fill in address, city, and state');
      return;
    }

    try {
      setLocationLoading(true);
      const fullAddress = `${address}, ${city}, ${state} ${zipCode}`;
      
      const geocoded = await Location.geocodeAsync(fullAddress);
      
      if (geocoded && geocoded.length > 0) {
        updateLocationField('coordinates', {
          latitude: geocoded[0].latitude,
          longitude: geocoded[0].longitude,
        });
        Alert.alert('Success', 'Address verified and coordinates set!');
      } else {
        Alert.alert('Error', 'Could not find coordinates for this address. Please check the address.');
      }
    } catch (error) {
      console.error('Error geocoding address:', error);
      Alert.alert('Error', 'Failed to verify address. Please try again.');
    } finally {
      setLocationLoading(false);
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled) {
        updateField('image', result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const takePhoto = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled) {
        updateField('image', result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const showImageOptions = () => {
    Alert.alert(
      'Add Photo',
      'Choose how you want to add a photo',
      [
        { text: 'Camera', onPress: takePhoto },
        { text: 'Photo Library', onPress: pickImage },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const validateForm = (): boolean => {
    if (!itemData.title.trim()) {
      Alert.alert('Error', 'Please enter an item title');
      return false;
    }
    if (!itemData.description.trim()) {
      Alert.alert('Error', 'Please enter a description');
      return false;
    }
    if (!itemData.category) {
      Alert.alert('Error', 'Please select a category');
      return false;
    }
    if (!itemData.pricePerDay || isNaN(Number(itemData.pricePerDay))) {
      Alert.alert('Error', 'Please enter a valid price per day');
      return false;
    }
    if (!itemData.image) {
      Alert.alert('Error', 'Please add at least one photo');
      return false;
    }
    if (!itemData.location.city || !itemData.location.state) {
      Alert.alert('Error', 'Please provide at least city and state');
      return false;
    }
    if (!itemData.location.coordinates) {
      Alert.alert(
        'No Coordinates',
        'Location coordinates are not set. Would you like to verify the address?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Verify Address', onPress: geocodeAddress },
        ]
      );
      return false;
    }
    return true;
  };

 const handleSubmit = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to add an item');
      return;
    }

    // Double-check verification status before submitting (skip for editing)
    if (!isEditing && !verificationStatus?.identityVerified) {
      Alert.alert(
        'Verification Required',
        'You must verify your identity before listing items.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Verify Now', onPress: handleVerifyIdentity },
        ]
      );
      return;
    }

    if (!validateForm()) return;

    setLoading(true);
    
    try {
      if (isEditing) {
        // UPDATE existing item
        const result = await ItemService.updateItem(editItemId, {
          title: itemData.title.trim(),
          description: itemData.description.trim(),
          category: itemData.category,
          pricePerDay: parseFloat(itemData.pricePerDay),
          image: itemData.image!,
          isAvailable: true,
          location: itemData.location,
        });

        if (result.success) {
          Alert.alert(
            'Success!',
            'Your item has been updated successfully',
            [{ text: 'OK', onPress: () => navigation.goBack() }]
          );
        } else {
          Alert.alert('Error', result.error || 'Failed to update item');
        }
      } else {
        // CREATE new item
        const result = await ItemService.addItem({
          title: itemData.title.trim(),
          description: itemData.description.trim(),
          category: itemData.category,
          pricePerDay: parseFloat(itemData.pricePerDay),
          image: itemData.image!,
          ownerId: user.id,
          ownerName: `${user.firstName} ${user.lastName}`,
          isAvailable: true,
          location: itemData.location,
        });

        if (result.success) {
          Alert.alert(
            'Success!',
            'Your item has been listed successfully',
            [
              {
                text: 'OK',
                onPress: () => {
                  // Reset form
                  setItemData({
                    title: '',
                    description: '',
                    category: '',
                    pricePerDay: '',
                    image: null,
                    location: {
                      address: '',
                      city: '',
                      state: '',
                      zipCode: '',
                      coordinates: null,
                    },
                  });
                }
              }
            ]
          );
        } else {
          Alert.alert('Error', result.error || 'Failed to list item');
        }
      }
    } catch (error) {
      console.error('Error saving item:', error);
      Alert.alert('Error', 'Failed to save item. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================

  // NEW: Show loading while checking verification
  // Show loading while checking verification or loading item for edit
  if (checkingVerification || loadingItem) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.title}>{isEditing ? 'Edit Item' : 'List Your Item'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // NEW: Show verification required screen if not verified
  if (!verificationStatus?.identityVerified) {
    return (
      <SafeAreaView style={styles.container}>
        <VerificationRequired onVerify={handleVerifyIdentity} />
      </SafeAreaView>
    );
  }

  // ORIGINAL: Main form UI (with minor addition of verified banner)
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* NEW: Verified status banner */}
          <View style={styles.verifiedBanner}>
            <Ionicons name="shield-checkmark" size={18} color={Colors.success} />
            <Text style={styles.verifiedBannerText}>Identity Verified</Text>
          </View>

          {/* ORIGINAL: All content below is unchanged */}
          <Text style={styles.title}>List Your Item</Text>
          <Text style={styles.subtitle}>
            {isEditing 
              ? 'Update your item details below' 
              : 'Share your items with the community and earn money'}
          </Text>

          {/* Photo Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Photos</Text>
            <TouchableOpacity style={styles.photoContainer} onPress={showImageOptions}>
              {itemData.image ? (
                <Image source={{ uri: itemData.image }} style={styles.photo} />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="camera" size={40} color={Colors.text} />
                  <Text style={styles.photoText}>Add Photo</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Basic Info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Basic Information</Text>
            
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Item Title *</Text>
              <TextInput
                style={styles.input}
                value={itemData.title}
                onChangeText={(value) => updateField('title', value)}
                placeholder="e.g. Canon EOS R5 Camera"
                maxLength={50}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Description *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={itemData.description}
                onChangeText={(value) => updateField('description', value)}
                placeholder="Describe your item, its condition, and any included accessories..."
                multiline
                numberOfLines={4}
                maxLength={500}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Category *</Text>
              <TouchableOpacity 
                style={styles.categorySelector}
                onPress={() => setShowCategories(!showCategories)}
              >
                <Text style={[styles.categoryText, !itemData.category && styles.placeholder]}>
                  {itemData.category || 'Select a category'}
                </Text>
                <Ionicons name="chevron-down" size={20} color={Colors.text} />
              </TouchableOpacity>
              
              {showCategories && (
                <View style={styles.categoryList}>
                  {categories.map((category) => (
                    <TouchableOpacity
                      key={category}
                      style={styles.categoryItem}
                      onPress={() => {
                        updateField('category', category);
                        setShowCategories(false);
                      }}
                    >
                      <Text style={styles.categoryItemText}>{category}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>

          {/* Location Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Location</Text>
            
            <View style={styles.locationMethodSelector}>
              <TouchableOpacity
                style={[
                  styles.methodButton,
                  locationMethod === 'auto' && styles.methodButtonActive
                ]}
                onPress={() => setLocationMethod('auto')}
              >
                <Ionicons 
                  name="location" 
                  size={20} 
                  color={locationMethod === 'auto' ? Colors.white : Colors.text} 
                />
                <Text style={[
                  styles.methodButtonText,
                  locationMethod === 'auto' && styles.methodButtonTextActive
                ]}>
                  Use Current Location
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.methodButton,
                  locationMethod === 'manual' && styles.methodButtonActive
                ]}
                onPress={() => setLocationMethod('manual')}
              >
                <Ionicons 
                  name="create" 
                  size={20} 
                  color={locationMethod === 'manual' ? Colors.white : Colors.text} 
                />
                <Text style={[
                  styles.methodButtonText,
                  locationMethod === 'manual' && styles.methodButtonTextActive
                ]}>
                  Enter Manually
                </Text>
              </TouchableOpacity>
            </View>

            {locationMethod === 'auto' ? (
              <TouchableOpacity 
                style={styles.detectButton}
                onPress={getCurrentLocation}
                disabled={locationLoading}
              >
                {locationLoading ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <>
                    <Ionicons name="navigate" size={20} color={Colors.white} />
                    <Text style={styles.detectButtonText}>Detect My Location</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <>
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Street Address</Text>
                  <TextInput
                    style={styles.input}
                    value={itemData.location.address}
                    onChangeText={(value) => updateLocationField('address', value)}
                    placeholder="123 Main Street"
                  />
                </View>

                <View style={styles.row}>
                  <View style={[styles.inputContainer, styles.flex1]}>
                    <Text style={styles.label}>City *</Text>
                    <TextInput
                      style={styles.input}
                      value={itemData.location.city}
                      onChangeText={(value) => updateLocationField('city', value)}
                      placeholder="City"
                    />
                  </View>

                  <View style={[styles.inputContainer, styles.flex1, styles.ml8]}>
                    <Text style={styles.label}>State *</Text>
                    <TextInput
                      style={styles.input}
                      value={itemData.location.state}
                      onChangeText={(value) => updateLocationField('state', value)}
                      placeholder="State"
                      maxLength={2}
                      autoCapitalize="characters"
                    />
                  </View>
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Zip Code</Text>
                  <TextInput
                    style={styles.input}
                    value={itemData.location.zipCode}
                    onChangeText={(value) => updateLocationField('zipCode', value)}
                    placeholder="12345"
                    keyboardType="numeric"
                    maxLength={5}
                  />
                </View>

                <TouchableOpacity 
                  style={styles.verifyButton}
                  onPress={geocodeAddress}
                  disabled={locationLoading}
                >
                  {locationLoading ? (
                    <ActivityIndicator color={Colors.secondary} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={20} color={Colors.secondary} />
                      <Text style={styles.verifyButtonText}>Verify Address</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}

            {itemData.location.coordinates && (
              <View style={styles.coordinatesDisplay}>
                <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                <Text style={styles.coordinatesText}>
                  Location verified: {itemData.location.city}, {itemData.location.state}
                </Text>
              </View>
            )}
          </View>

          {/* Pricing */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pricing</Text>
            
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Price per Day *</Text>
              <View style={styles.priceInputContainer}>
                <Text style={styles.dollarSign}>$</Text>
                <TextInput
                  style={styles.priceInput}
                  value={itemData.pricePerDay}
                  onChangeText={(value) => updateField('pricePerDay', value)}
                  placeholder="0.00"
                  keyboardType="numeric"
                />
              </View>
            </View>
          </View>

          <TouchableOpacity 
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            <Text style={styles.submitButtonText}>
              {loading 
                ? (isEditing ? 'Updating...' : 'Listing...') 
                : (isEditing ? 'Update Item' : 'List Item')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  // ORIGINAL STYLES (unchanged)
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.text,
    opacity: 0.7,
    marginBottom: 30,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 16,
  },
  photoContainer: {
    height: 200,
    borderRadius: 8,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    flex: 1,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoText: {
    marginTop: 8,
    fontSize: 16,
    color: Colors.text,
    opacity: 0.7,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.text,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  categorySelector: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryText: {
    fontSize: 16,
    color: Colors.text,
  },
  placeholder: {
    opacity: 0.5,
  },
  categoryList: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    marginTop: 4,
  },
  categoryItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  categoryItemText: {
    fontSize: 16,
    color: Colors.text,
  },
  locationMethodSelector: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  methodButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    gap: 8,
  },
  methodButtonActive: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },
  methodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  methodButtonTextActive: {
    color: Colors.white,
  },
  detectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success,
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  detectButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  row: {
    flexDirection: 'row',
  },
  flex1: {
    flex: 1,
  },
  ml8: {
    marginLeft: 8,
  },
  verifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.secondary,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  verifyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.secondary,
  },
  coordinatesDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.success + '20',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    gap: 8,
  },
  coordinatesText: {
    flex: 1,
    fontSize: 14,
    color: Colors.success,
    fontWeight: '600',
  },
  priceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
  },
  dollarSign: {
    fontSize: 16,
    color: Colors.text,
    marginRight: 8,
  },
  priceInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.text,
  },
  submitButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },

  // NEW STYLES (for verification gate)
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: Colors.text,
    opacity: 0.7,
  },
  verifiedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success + '20',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 20,
    gap: 8,
  },
  verifiedBannerText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.success,
  },
  verificationRequiredContainer: {
    flex: 1,
    padding: 20,
  },
  verificationRequiredContent: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 40,
  },
  verificationIcon: {
    marginBottom: 24,
  },
  verificationRequiredTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  verificationRequiredDescription: {
    fontSize: 16,
    color: Colors.text,
    opacity: 0.7,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  benefitsContainer: {
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  benefitsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  benefitText: {
    fontSize: 15,
    color: Colors.text,
    flex: 1,
  },
  requirementsCard: {
    width: '100%',
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  requirementsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
  },
  requirementItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 10,
  },
  requirementText: {
    fontSize: 14,
    color: Colors.text,
    opacity: 0.8,
    flex: 1,
    lineHeight: 20,
  },
  verifyIdentityButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: '100%',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  verifyIdentityButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  securityNote: {
    fontSize: 12,
    color: Colors.text,
    opacity: 0.6,
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 18,
  },
});