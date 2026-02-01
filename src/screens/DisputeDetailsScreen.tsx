// src/screens/DisputeDetailsScreen.tsx
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
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import DisputeService, { Dispute } from '../services/DisputeService';
import { AuthContext } from '../contexts/AuthContext';

const Colors = {
  primary: '#F5C542',
  secondary: '#2E86AB',
  success: '#46A758',
  warning: '#F59E0B',
  danger: '#EF4444',
  background: '#F8F9FA',
  text: '#212529',
  white: '#FFFFFF',
  border: '#E9ECEF',
};

const { width } = Dimensions.get('window');

interface RouteParams {
  disputeId: string;
}

export default function DisputeDetailsScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useContext(AuthContext);
  const params = route.params as RouteParams;

  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<number | null>(null);

  useEffect(() => {
    loadDispute();
  }, []);

  const loadDispute = async () => {
    try {
      const disputeDoc = await getDoc(doc(db, 'disputes', params.disputeId));
      if (disputeDoc.exists()) {
        setDispute({
          id: disputeDoc.id,
          ...disputeDoc.data(),
        } as Dispute);
      } else {
        Alert.alert('Error', 'Dispute not found');
        navigation.goBack();
      }
    } catch (error) {
      console.error('Error loading dispute:', error);
      Alert.alert('Error', 'Failed to load dispute details');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.secondary} />
          <Text style={styles.loadingText}>Loading dispute...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!dispute) {
    return null;
  }

  const isReporter = dispute.reporterId === user?.id;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dispute Details</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Status Banner */}
        <View style={[
          styles.statusBanner,
          { backgroundColor: DisputeService.getDisputeStatusColor(dispute.status) }
        ]}>
          <Ionicons name="information-circle" size={24} color={Colors.white} />
          <View style={styles.statusBannerContent}>
            <Text style={styles.statusBannerTitle}>
              Status: {dispute.status.charAt(0).toUpperCase() + dispute.status.slice(1)}
            </Text>
            <Text style={styles.statusBannerText}>
              {dispute.status === 'open' && 'Your dispute has been submitted and is awaiting review'}
              {dispute.status === 'investigating' && 'Our team is investigating this dispute'}
              {dispute.status === 'resolved' && 'This dispute has been resolved'}
              {dispute.status === 'closed' && 'This dispute has been closed'}
            </Text>
          </View>
        </View>

        {/* Basic Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dispute Information</Text>
          
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Item:</Text>
              <Text style={styles.infoValue}>{dispute.itemName}</Text>
            </View>

            <View style={styles.infoDivider} />

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Type:</Text>
              <Text style={styles.infoValue}>
                {DisputeService.getDisputeTypeLabel(dispute.type)}
              </Text>
            </View>

            <View style={styles.infoDivider} />

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Submitted:</Text>
              <Text style={styles.infoValue}>{formatDate(dispute.createdAt)}</Text>
            </View>

            {dispute.estimatedCost && (
              <>
                <View style={styles.infoDivider} />
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Estimated Cost:</Text>
                  <Text style={[styles.infoValue, styles.costValue]}>
                    ${dispute.estimatedCost.toFixed(2)}
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Parties Involved */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Parties Involved</Text>
          
          <View style={styles.partiesCard}>
            <View style={[styles.partyRow, isReporter && styles.highlightedParty]}>
              <Ionicons name="flag" size={20} color={Colors.danger} />
              <View style={styles.partyInfo}>
                <Text style={styles.partyLabel}>Reporter{isReporter && ' (You)'}</Text>
                <Text style={styles.partyName}>{dispute.reporterName}</Text>
                <Text style={styles.partyRole}>
                  {dispute.reporterRole === 'owner' ? 'Item Owner' : 'Renter'}
                </Text>
              </View>
            </View>

            <View style={styles.partiesDivider} />

            <View style={[styles.partyRow, !isReporter && styles.highlightedParty]}>
              <Ionicons name="person" size={20} color={Colors.secondary} />
              <View style={styles.partyInfo}>
                <Text style={styles.partyLabel}>Accused{!isReporter && ' (You)'}</Text>
                <Text style={styles.partyName}>{dispute.accusedName}</Text>
                <Text style={styles.partyRole}>
                  {dispute.reporterRole === 'owner' ? 'Renter' : 'Item Owner'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <View style={styles.descriptionCard}>
            <Text style={styles.descriptionText}>{dispute.description}</Text>
          </View>
        </View>

        {/* Evidence Photos */}
        {dispute.damagePhotos.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Evidence Photos ({dispute.damagePhotos.length})
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.photosContainer}>
                {dispute.damagePhotos.map((photo, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.photoWrapper}
                    onPress={() => setSelectedPhoto(index)}
                  >
                    <Image 
                      source={{ uri: photo.url || photo.uri }} 
                      style={styles.photoThumbnail} 
                    />
                    {photo.description && (
                      <Text style={styles.photoCaption} numberOfLines={2}>
                        {photo.description}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Resolution (if resolved) */}
        {dispute.status === 'resolved' && dispute.resolutionNotes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Resolution</Text>
            <View style={styles.resolutionCard}>
              <View style={styles.resolutionHeader}>
                <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
                <Text style={styles.resolutionTitle}>Dispute Resolved</Text>
              </View>
              {dispute.resolvedAt && (
                <Text style={styles.resolutionDate}>
                  Resolved on {formatDate(dispute.resolvedAt)}
                </Text>
              )}
              <Text style={styles.resolutionText}>{dispute.resolutionNotes}</Text>
            </View>
          </View>
        )}

        {/* Admin Notes (if any) */}
        {dispute.adminNotes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Admin Notes</Text>
            <View style={styles.adminNotesCard}>
              <Ionicons name="shield-checkmark" size={20} color={Colors.secondary} />
              <Text style={styles.adminNotesText}>{dispute.adminNotes}</Text>
            </View>
          </View>
        )}

        {/* Help Text */}
        <View style={styles.helpCard}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.secondary} />
          <Text style={styles.helpText}>
            {dispute.status === 'open' && 
              'Your dispute has been submitted. Our team will review it and contact you soon.'}
            {dispute.status === 'investigating' && 
              'Our team is currently investigating this dispute. We may reach out for additional information.'}
            {dispute.status === 'resolved' && 
              'This dispute has been resolved. If you have any questions, please contact support.'}
            {dispute.status === 'closed' && 
              'This dispute has been closed. No further action will be taken.'}
          </Text>
        </View>
      </ScrollView>

      {/* Photo Modal */}
      {selectedPhoto !== null && (
        <View style={styles.photoModal}>
          <View style={styles.photoModalHeader}>
            <TouchableOpacity onPress={() => setSelectedPhoto(null)}>
              <Ionicons name="close" size={32} color={Colors.white} />
            </TouchableOpacity>
            <Text style={styles.photoModalTitle}>
              Photo {selectedPhoto + 1} of {dispute.damagePhotos.length}
            </Text>
            <View style={{ width: 32 }} />
          </View>
          <Image
            source={{ uri: dispute.damagePhotos[selectedPhoto].url || dispute.damagePhotos[selectedPhoto].uri }}
            style={styles.photoModalImage}
            resizeMode="contain"
          />
          {dispute.damagePhotos[selectedPhoto].description && (
            <View style={styles.photoModalCaption}>
              <Text style={styles.photoModalCaptionText}>
                {dispute.damagePhotos[selectedPhoto].description}
              </Text>
            </View>
          )}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.text,
  },
  content: {
    flex: 1,
  },
  statusBanner: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
    gap: 12,
  },
  statusBannerContent: {
    flex: 1,
  },
  statusBannerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.white,
    marginBottom: 4,
  },
  statusBannerText: {
    fontSize: 14,
    color: Colors.white,
    opacity: 0.9,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 14,
    color: Colors.text,
    opacity: 0.7,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
    textAlign: 'right',
  },
  costValue: {
    color: Colors.danger,
    fontSize: 16,
  },
  infoDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 12,
  },
  partiesCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  partyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  highlightedParty: {
    backgroundColor: Colors.primary + '10',
    padding: 12,
    borderRadius: 8,
    marginHorizontal: -12,
  },
  partyInfo: {
    flex: 1,
  },
  partyLabel: {
    fontSize: 12,
    color: Colors.text,
    opacity: 0.7,
    marginBottom: 4,
  },
  partyName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 2,
  },
  partyRole: {
    fontSize: 14,
    color: Colors.secondary,
  },
  partiesDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 16,
  },
  descriptionCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  descriptionText: {
    fontSize: 15,
    color: Colors.text,
    lineHeight: 22,
  },
  photosContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingRight: 16,
  },
  photoWrapper: {
    width: 200,
  },
  photoThumbnail: {
    width: 200,
    height: 200,
    borderRadius: 12,
    backgroundColor: Colors.border,
  },
  photoCaption: {
    fontSize: 12,
    color: Colors.text,
    marginTop: 8,
    lineHeight: 16,
  },
  resolutionCard: {
    backgroundColor: Colors.success + '10',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.success + '40',
  },
  resolutionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  resolutionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.success,
  },
  resolutionDate: {
    fontSize: 14,
    color: Colors.text,
    opacity: 0.7,
    marginBottom: 12,
  },
  resolutionText: {
    fontSize: 15,
    color: Colors.text,
    lineHeight: 22,
  },
  adminNotesCard: {
    flexDirection: 'row',
    backgroundColor: Colors.secondary + '10',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.secondary + '40',
  },
  adminNotesText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
  helpCard: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    margin: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  helpText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
  photoModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  photoModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 48,
  },
  photoModalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  photoModalImage: {
    flex: 1,
    width: '100%',
  },
  photoModalCaption: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 16,
  },
  photoModalCaptionText: {
    fontSize: 14,
    color: Colors.white,
    lineHeight: 20,
  },
});