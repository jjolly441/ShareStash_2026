// src/screens/HandoffScreen.tsx — Pick-up & Return Flow with Photo Evidence
import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebase';
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

type HandoffScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Handoff'>;
type HandoffScreenRouteProp = RouteProp<RootStackParamList, 'Handoff'>;

interface Props {
  navigation: HandoffScreenNavigationProp;
  route: HandoffScreenRouteProp;
}

type HandoffMode = 'pickup' | 'return';

export default function HandoffScreen({ navigation, route }: Props) {
  const { user } = useContext(AuthContext);
  const { rentalId, mode } = route.params;

  const [rental, setRental] = useState<Rental | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const isOwner = user?.id === rental?.ownerId;
  const isRenter = user?.id === rental?.renterId;

  useEffect(() => {
    loadRental();
  }, [rentalId]);

  const loadRental = async () => {
    try {
      setLoading(true);
      const rentalData = await RentalService.getRentalById(rentalId);
      if (rentalData) {
        setRental(rentalData);
        // Check if this user already submitted a photo for this step
        checkExistingPhoto(rentalData);
      } else {
        Alert.alert('Error', 'Rental not found');
        navigation.goBack();
      }
    } catch (error) {
      console.error('Error loading rental:', error);
      Alert.alert('Error', 'Failed to load rental details');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const checkExistingPhoto = (rentalData: Rental) => {
    if (mode === 'pickup') {
      if (isOwner && rentalData.pickupPhotoOwner) {
        setPhotoUri(rentalData.pickupPhotoOwner);
        setSubmitted(true);
      } else if (isRenter && rentalData.pickupPhotoRenter) {
        setPhotoUri(rentalData.pickupPhotoRenter);
        setSubmitted(true);
      }
    } else {
      if (isOwner && rentalData.returnPhotoOwner) {
        setPhotoUri(rentalData.returnPhotoOwner);
        setSubmitted(true);
      } else if (isRenter && rentalData.returnPhotoRenter) {
        setPhotoUri(rentalData.returnPhotoRenter);
        setSubmitted(true);
      }
    }
  };

  // ─── Photo capture ───────────────────────────────────────────────
  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera access is needed to take a photo of the item.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });
      if (!result.canceled) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open camera');
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
        setPhotoUri(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const showPhotoOptions = () => {
    Alert.alert(
      'Add Photo',
      'Take a photo of the item\'s current condition',
      [
        { text: 'Camera', onPress: takePhoto },
        { text: 'Photo Library', onPress: pickImage },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  // ─── Upload & submit ─────────────────────────────────────────────
  const uploadPhoto = async (uri: string): Promise<string> => {
    const response = await fetch(uri);
    const blob = await response.blob();
    const role = isOwner ? 'owner' : 'renter';
    const storageRef = ref(
      storage,
      `handoffs/${rentalId}/${mode}_${role}_${Date.now()}.jpg`
    );
    await uploadBytes(storageRef, blob);
    return getDownloadURL(storageRef);
  };

  const handleSubmit = async () => {
    if (!photoUri || !rental || !user) return;

    Alert.alert(
      'Submit Photo',
      `Are you sure you want to submit this ${mode === 'pickup' ? 'pick-up' : 'return'} photo? This confirms the item's condition.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          onPress: async () => {
            try {
              setUploading(true);
              // Upload to Firebase Storage
              const downloadURL = await uploadPhoto(photoUri);

              // Build update field name
              const fieldKey =
                mode === 'pickup'
                  ? isOwner
                    ? 'pickupPhotoOwner'
                    : 'pickupPhotoRenter'
                  : isOwner
                  ? 'returnPhotoOwner'
                  : 'returnPhotoRenter';

              // Save to rental document
              await RentalService.updateHandoffPhoto(rentalId, fieldKey, downloadURL);

              // Notify the other party
              const otherUserId = isOwner ? rental.renterId : rental.ownerId;
              const roleName = isOwner ? rental.ownerName : rental.renterName;
              const stepLabel = mode === 'pickup' ? 'pick-up' : 'return';

              await NotificationService.sendNotificationToUser(
                otherUserId,
                `📸 ${stepLabel.charAt(0).toUpperCase() + stepLabel.slice(1)} Photo Submitted`,
                `${roleName} has submitted a ${stepLabel} condition photo for "${rental.itemName}".`,
                {
                  type: 'handoff_photo',
                  rentalId: rentalId,
                  screen: 'Handoff',
                }
              );

              setSubmitted(true);
              setUploading(false);

              // Reload to see updated state
              await loadRental();

              Alert.alert(
                'Success',
                `Your ${stepLabel} photo has been submitted. ${getNextStepMessage()}`,
              );
            } catch (error: any) {
              console.error('Error submitting handoff photo:', error);
              setUploading(false);
              Alert.alert('Error', error.message || 'Failed to submit photo');
            }
          },
        },
      ]
    );
  };

  // ─── Helper text ─────────────────────────────────────────────────
  const getNextStepMessage = (): string => {
    if (mode === 'pickup') {
      const otherParty = isOwner ? 'renter' : 'owner';
      return `The ${otherParty} will also need to submit their photo.`;
    }
    return 'Both parties should submit return photos to complete the handoff.';
  };

  const getStepTitle = (): string => {
    if (mode === 'pickup') return 'Pick-Up Handoff';
    return 'Return Handoff';
  };

  const getInstructions = (): string => {
    if (mode === 'pickup') {
      return 'Take a clear photo of the item before the renter takes it. This documents the item\'s condition at pick-up and serves as evidence if any disputes arise.';
    }
    return 'Take a clear photo of the item upon return. This documents the item\'s condition and serves as evidence for dispute resolution.';
  };

  // ─── Status helpers ──────────────────────────────────────────────
  const getOtherPartyPhotoStatus = (): { hasPhoto: boolean; label: string } => {
    if (!rental) return { hasPhoto: false, label: '' };

    if (mode === 'pickup') {
      if (isOwner) {
        return {
          hasPhoto: !!rental.pickupPhotoRenter,
          label: `Renter (${rental.renterName})`,
        };
      }
      return {
        hasPhoto: !!rental.pickupPhotoOwner,
        label: `Owner (${rental.ownerName})`,
      };
    }
    // return
    if (isOwner) {
      return {
        hasPhoto: !!rental.returnPhotoRenter,
        label: `Renter (${rental.renterName})`,
      };
    }
    return {
      hasPhoto: !!rental.returnPhotoOwner,
      label: `Owner (${rental.ownerName})`,
    };
  };

  const bothPhotosSubmitted = (): boolean => {
    if (!rental) return false;
    if (mode === 'pickup') {
      return !!rental.pickupPhotoOwner && !!rental.pickupPhotoRenter;
    }
    return !!rental.returnPhotoOwner && !!rental.returnPhotoRenter;
  };

  // ─── Render ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading handoff details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!rental || !user) return null;

  const otherParty = getOtherPartyPhotoStatus();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{getStepTitle()}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Item info card */}
        <View style={styles.itemCard}>
          {rental.itemImage && (
            <Image source={{ uri: rental.itemImage }} style={styles.itemImage} />
          )}
          <View style={styles.itemInfo}>
            <Text style={styles.itemName}>{rental.itemName}</Text>
            <Text style={styles.rentalParties}>
              {isOwner ? `Renter: ${rental.renterName}` : `Owner: ${rental.ownerName}`}
            </Text>
            {rental.confirmationNumber && (
              <Text style={styles.confirmationText}>
                {rental.confirmationNumber}
              </Text>
            )}
          </View>
        </View>

        {/* Meeting location (if set) */}
        {(rental as any).meetingLocation?.status === 'accepted' && (
          <View style={styles.locationCard}>
            <View style={styles.locationHeader}>
              <Ionicons name="location" size={20} color={Colors.secondary} />
              <Text style={styles.locationTitle}>Meeting Point</Text>
            </View>
            <Text style={styles.locationAddress}>
              {(rental as any).meetingLocation.address}
            </Text>
            {(rental as any).meetingLocation.notes && (
              <Text style={styles.locationNotes}>
                {(rental as any).meetingLocation.notes}
              </Text>
            )}
          </View>
        )}

        {/* Instructions */}
        <View style={styles.instructionCard}>
          <Ionicons name="information-circle" size={22} color={Colors.secondary} />
          <Text style={styles.instructionText}>{getInstructions()}</Text>
        </View>

        {/* Status tracker */}
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>Photo Status</Text>

          {/* Your status */}
          <View style={styles.statusRow}>
            <Ionicons
              name={submitted ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={submitted ? Colors.success : Colors.muted}
            />
            <Text style={[styles.statusLabel, submitted && styles.statusComplete]}>
              You ({isOwner ? 'Owner' : 'Renter'})
            </Text>
            <Text style={[styles.statusValue, submitted && { color: Colors.success }]}>
              {submitted ? 'Submitted' : 'Pending'}
            </Text>
          </View>

          {/* Other party status */}
          <View style={styles.statusRow}>
            <Ionicons
              name={otherParty.hasPhoto ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={otherParty.hasPhoto ? Colors.success : Colors.muted}
            />
            <Text style={[styles.statusLabel, otherParty.hasPhoto && styles.statusComplete]}>
              {otherParty.label}
            </Text>
            <Text style={[styles.statusValue, otherParty.hasPhoto && { color: Colors.success }]}>
              {otherParty.hasPhoto ? 'Submitted' : 'Pending'}
            </Text>
          </View>

          {bothPhotosSubmitted() && (
            <View style={styles.allDoneBanner}>
              <Ionicons name="checkmark-done-circle" size={20} color={Colors.success} />
              <Text style={styles.allDoneText}>
                Both parties have submitted photos. {mode === 'pickup' ? 'The rental is ready to go!' : 'Return handoff is documented.'}
              </Text>
            </View>
          )}
        </View>

        {/* Photo capture / display */}
        <View style={styles.photoSection}>
          <Text style={styles.photoTitle}>
            {submitted ? 'Your Submitted Photo' : 'Take a Photo'}
          </Text>

          {photoUri ? (
            <View>
              <Image source={{ uri: photoUri }} style={styles.photoPreview} />
              {!submitted && (
                <TouchableOpacity style={styles.retakeButton} onPress={showPhotoOptions}>
                  <Ionicons name="camera-reverse" size={20} color={Colors.white} />
                  <Text style={styles.retakeText}>Retake Photo</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <TouchableOpacity style={styles.addPhotoButton} onPress={showPhotoOptions}>
              <Ionicons name="camera" size={48} color={Colors.muted} />
              <Text style={styles.addPhotoText}>Tap to take a photo</Text>
              <Text style={styles.addPhotoSubtext}>
                Capture the item's condition clearly
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Submit button */}
        {!submitted && photoUri && (
          <TouchableOpacity
            style={[styles.submitButton, uploading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <>
                <Ionicons name="cloud-upload" size={22} color={Colors.white} />
                <Text style={styles.submitButtonText}>
                  Submit {mode === 'pickup' ? 'Pick-Up' : 'Return'} Photo
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Tip card */}
        <View style={styles.tipCard}>
          <Text style={styles.tipTitle}>Tips for a Good Photo</Text>
          <View style={styles.tipRow}>
            <Ionicons name="sunny" size={16} color={Colors.warning} />
            <Text style={styles.tipText}>Use good lighting</Text>
          </View>
          <View style={styles.tipRow}>
            <Ionicons name="scan" size={16} color={Colors.warning} />
            <Text style={styles.tipText}>Show the full item clearly</Text>
          </View>
          <View style={styles.tipRow}>
            <Ionicons name="alert-circle" size={16} color={Colors.warning} />
            <Text style={styles.tipText}>Capture any existing damage or wear</Text>
          </View>
          <View style={styles.tipRow}>
            <Ionicons name="images" size={16} color={Colors.warning} />
            <Text style={styles.tipText}>Include close-ups of important details</Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
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
  // Item card
  itemCard: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  itemImage: {
    width: 90,
    height: 90,
  },
  itemInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  itemName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  rentalParties: {
    fontSize: 14,
    color: Colors.muted,
    marginBottom: 2,
  },
  confirmationText: {
    fontSize: 12,
    color: Colors.secondary,
    fontWeight: '600',
  },
  // Meeting location
  locationCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  locationTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: Colors.text,
  },
  locationAddress: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
  locationNotes: {
    fontSize: 13,
    color: Colors.muted,
    marginTop: 6,
    fontStyle: 'italic',
  },
  // Instructions
  instructionCard: {
    flexDirection: 'row',
    backgroundColor: Colors.secondary + '10',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    gap: 10,
    alignItems: 'flex-start',
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
  // Status tracker
  statusCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  statusLabel: {
    flex: 1,
    fontSize: 14,
    color: Colors.muted,
  },
  statusComplete: {
    color: Colors.text,
    fontWeight: '600',
  },
  statusValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.muted,
  },
  allDoneBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.success + '15',
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
    gap: 8,
  },
  allDoneText: {
    flex: 1,
    fontSize: 13,
    color: Colors.success,
    fontWeight: '600',
  },
  // Photo section
  photoSection: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  photoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 12,
  },
  addPhotoButton: {
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.muted,
    marginTop: 10,
  },
  addPhotoSubtext: {
    fontSize: 13,
    color: Colors.muted,
    marginTop: 4,
  },
  photoPreview: {
    width: '100%',
    height: 250,
    borderRadius: 10,
    backgroundColor: Colors.background,
  },
  retakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.muted,
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 10,
    gap: 6,
  },
  retakeText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  // Submit button
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success,
    borderRadius: 12,
    paddingVertical: 16,
    marginBottom: 16,
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: 'bold',
  },
  // Tips
  tipCard: {
    backgroundColor: Colors.warning + '10',
    borderRadius: 12,
    padding: 16,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 10,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  tipText: {
    fontSize: 13,
    color: Colors.text,
  },
});
