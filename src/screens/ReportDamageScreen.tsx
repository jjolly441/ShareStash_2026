// src/screens/ReportDamageScreen.tsx - FIXED
import React, { useState, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute } from '@react-navigation/native';
import DisputeService, { DisputeType, DamagePhoto } from '../services/DisputeService';
import { AuthContext } from '../contexts/AuthContext';

const Colors = {
  primary: '#F5C542',
  secondary: '#2E86AB',
  success: '#46A758',
  danger: '#EF4444',
  warning: '#F59E0B',
  background: '#F8F9FA',
  text: '#212529',
  white: '#FFFFFF',
  border: '#E9ECEF',
};

interface RouteParams {
  rentalId: string;
  itemId: string;
  itemName: string; // CHANGED from itemTitle
  ownerId: string;
  ownerName: string;
  renterId: string;
  renterName: string;
  userRole: 'renter' | 'owner';
}

export default function ReportDamageScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useContext(AuthContext);
  const params = route.params as RouteParams;

  const [disputeType, setDisputeType] = useState<DisputeType>('damage');
  const [description, setDescription] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [damagePhotos, setDamagePhotos] = useState<DamagePhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [showTypeSelector, setShowTypeSelector] = useState(false);

  const disputeTypes: { value: DisputeType; label: string; icon: string }[] = [
    { value: 'damage', label: 'Item Damage', icon: 'warning' },
    { value: 'not_as_described', label: 'Not As Described', icon: 'alert-circle' },
    { value: 'late_return', label: 'Late Return', icon: 'time' },
    { value: 'payment_issue', label: 'Payment Issue', icon: 'card' },
    { value: 'other', label: 'Other Issue', icon: 'help-circle' },
  ];

  const addPhoto = async (source: 'camera' | 'library') => {
    try {
      let result;
      
      if (source === 'camera') {
        result = await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          quality: 0.8,
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          quality: 0.8,
          allowsMultipleSelection: true,
        });
      }

      if (!result.canceled) {
        const newPhotos = result.assets.map(asset => ({
          uri: asset.uri,
          description: '',
          timestamp: new Date().toISOString(),
        }));
        setDamagePhotos([...damagePhotos, ...newPhotos]);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to add photo');
    }
  };

  const showPhotoOptions = () => {
    Alert.alert(
      'Add Photo',
      'Choose how you want to add photos',
      [
        { text: 'Camera', onPress: () => addPhoto('camera') },
        { text: 'Photo Library', onPress: () => addPhoto('library') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const removePhoto = (index: number) => {
    const updated = damagePhotos.filter((_, i) => i !== index);
    setDamagePhotos(updated);
  };

  const updatePhotoDescription = (index: number, description: string) => {
    const updated = [...damagePhotos];
    updated[index].description = description;
    setDamagePhotos(updated);
  };

  const validateForm = (): boolean => {
    if (!description.trim()) {
      Alert.alert('Error', 'Please provide a detailed description of the issue');
      return false;
    }
    if (disputeType === 'damage' && damagePhotos.length === 0) {
      Alert.alert('Error', 'Please add at least one photo of the damage');
      return false;
    }
    if (disputeType === 'damage' && !estimatedCost) {
      Alert.alert(
        'Estimated Cost',
        'Please provide an estimated repair/replacement cost',
        [{ text: 'OK' }]
      );
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    Alert.alert(
      'Submit Dispute',
      'Are you sure you want to submit this dispute? This will notify the other party and our admin team.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          style: 'default',
          onPress: async () => {
            setLoading(true);

            try {
              const accusedId = params.userRole === 'owner' ? params.renterId : params.ownerId;
              const accusedName = params.userRole === 'owner' ? params.renterName : params.ownerName;

              const result = await DisputeService.createDispute({
                rentalId: params.rentalId,
                itemId: params.itemId,
                itemName: params.itemName, // CHANGED from itemTitle
                reporterId: user!.id,
                reporterName: `${user!.firstName} ${user!.lastName}`,
                reporterRole: params.userRole,
                accusedId,
                accusedName,
                type: disputeType,
                description,
                damagePhotos,
                estimatedCost: estimatedCost ? parseFloat(estimatedCost) : undefined,
              });

              if (result.success) {
                Alert.alert(
                  'Dispute Submitted',
                  'Your dispute has been submitted. Our team will review it and contact you soon.',
                  [
                    {
                      text: 'OK',
                      onPress: () => navigation.goBack(),
                    },
                  ]
                );
              } else {
                Alert.alert('Error', result.error || 'Failed to submit dispute');
              }
            } catch (error) {
              console.error('Error submitting dispute:', error);
              Alert.alert('Error', 'Failed to submit dispute. Please try again.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const selectedType = disputeTypes.find(t => t.value === disputeType);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Report Issue</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Item Info */}
        <View style={styles.itemInfoCard}>
          <Ionicons name="cube" size={24} color={Colors.secondary} />
          <View style={styles.itemInfo}>
            <Text style={styles.itemTitle}>{params.itemName}</Text>
            <Text style={styles.itemSubtext}>
              {params.userRole === 'owner' ? `Rented to: ${params.renterName}` : `Owned by: ${params.ownerName}`}
            </Text>
          </View>
        </View>

        {/* Dispute Type Selector */}
        <View style={styles.section}>
          <Text style={styles.label}>Type of Issue *</Text>
          <TouchableOpacity
            style={styles.typeSelector}
            onPress={() => setShowTypeSelector(!showTypeSelector)}
          >
            <View style={styles.typeSelectorContent}>
              <Ionicons name={selectedType?.icon as any} size={24} color={Colors.text} />
              <Text style={styles.typeSelectorText}>{selectedType?.label}</Text>
            </View>
            <Ionicons name="chevron-down" size={24} color={Colors.text} />
          </TouchableOpacity>

          {showTypeSelector && (
            <View style={styles.typeList}>
              {disputeTypes.map((type) => (
                <TouchableOpacity
                  key={type.value}
                  style={styles.typeItem}
                  onPress={() => {
                    setDisputeType(type.value);
                    setShowTypeSelector(false);
                  }}
                >
                  <Ionicons name={type.icon as any} size={24} color={Colors.text} />
                  <Text style={styles.typeItemText}>{type.label}</Text>
                  {disputeType === type.value && (
                    <Ionicons name="checkmark" size={24} color={Colors.success} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.label}>Detailed Description *</Text>
          <TextInput
            style={styles.textArea}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe the issue in detail. Include dates, circumstances, and any relevant information..."
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />
        </View>

        {/* Estimated Cost (for damage) */}
        {disputeType === 'damage' && (
          <View style={styles.section}>
            <Text style={styles.label}>Estimated Repair/Replacement Cost *</Text>
            <View style={styles.costInput}>
              <Text style={styles.dollarSign}>$</Text>
              <TextInput
                style={styles.costInputField}
                value={estimatedCost}
                onChangeText={setEstimatedCost}
                placeholder="0.00"
                keyboardType="numeric"
              />
            </View>
            <Text style={styles.helperText}>
              Provide your best estimate. Include quotes if available.
            </Text>
          </View>
        )}

        {/* Photos */}
        <View style={styles.section}>
          <Text style={styles.label}>
            Evidence Photos {disputeType === 'damage' && '*'}
          </Text>
          <Text style={styles.helperText}>
            Add photos showing the issue. Include close-ups and context shots.
          </Text>

          <View style={styles.photoGrid}>
            {damagePhotos.map((photo, index) => (
              <View key={index} style={styles.photoContainer}>
                <Image source={{ uri: photo.uri }} style={styles.photo} />
                <TouchableOpacity
                  style={styles.removePhotoButton}
                  onPress={() => removePhoto(index)}
                >
                  <Ionicons name="close-circle" size={24} color={Colors.danger} />
                </TouchableOpacity>
                <TextInput
                  style={styles.photoDescription}
                  value={photo.description}
                  onChangeText={(text) => updatePhotoDescription(index, text)}
                  placeholder="Add description (optional)"
                  placeholderTextColor="#999"
                />
              </View>
            ))}

            <TouchableOpacity style={styles.addPhotoButton} onPress={showPhotoOptions}>
              <Ionicons name="camera" size={32} color={Colors.text} />
              <Text style={styles.addPhotoText}>Add Photo</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Warning */}
        <View style={styles.warningCard}>
          <Ionicons name="information-circle" size={24} color={Colors.warning} />
          <Text style={styles.warningText}>
            False or fraudulent reports may result in account suspension. Please only report genuine issues.
          </Text>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <>
              <Ionicons name="send" size={20} color={Colors.white} />
              <Text style={styles.submitButtonText}>Submit Dispute</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  itemInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  itemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  itemSubtext: {
    fontSize: 14,
    color: Colors.text,
    opacity: 0.7,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  typeSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeSelectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  typeSelectorText: {
    fontSize: 16,
    color: Colors.text,
  },
  typeList: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 8,
    overflow: 'hidden',
  },
  typeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  typeItemText: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
  },
  textArea: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.text,
    minHeight: 120,
  },
  costInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  dollarSign: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginRight: 8,
  },
  costInputField: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.text,
  },
  helperText: {
    fontSize: 14,
    color: Colors.text,
    opacity: 0.6,
    marginTop: 8,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  photoContainer: {
    width: '48%',
    aspectRatio: 1,
    position: 'relative',
  },
  photo: {
    width: '100%',
    height: '80%',
    borderRadius: 12,
    backgroundColor: Colors.border,
  },
  removePhotoButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: Colors.white,
    borderRadius: 12,
  },
  photoDescription: {
    fontSize: 12,
    color: Colors.text,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  addPhotoButton: {
    width: '48%',
    aspectRatio: 1,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addPhotoText: {
    fontSize: 14,
    color: Colors.text,
    marginTop: 8,
  },
  warningCard: {
    flexDirection: 'row',
    backgroundColor: '#FEF3C7',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    gap: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
  },
  submitButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.danger,
    padding: 16,
    borderRadius: 12,
    marginBottom: 32,
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
});