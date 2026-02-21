// src/screens/DisputeDetailsScreen.tsx
// Enhanced Dispute Resolution System with messaging, proposals, and escalation
import React, { useState, useEffect, useContext, useRef } from 'react';
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
  TextInput,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import DisputeService, {
  Dispute,
  DisputeActivity,
  ResolutionProposal,
} from '../services/DisputeService';
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
  muted: '#6C757D',
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
  const scrollRef = useRef<ScrollView>(null);

  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<number | null>(null);
  const [selectedPhotoList, setSelectedPhotoList] = useState<any[]>([]);

  // Action panel state
  const [activePanel, setActivePanel] = useState<'none' | 'respond' | 'message' | 'propose' | 'escalate'>('none');
  const [responseText, setResponseText] = useState('');
  const [messageText, setMessageText] = useState('');
  const [proposalType, setProposalType] = useState<ResolutionProposal['type']>('partial_refund');
  const [proposalAmount, setProposalAmount] = useState('');
  const [proposalDescription, setProposalDescription] = useState('');
  const [escalationReason, setEscalationReason] = useState('');

  useEffect(() => {
    loadDispute();
  }, []);

  const loadDispute = async () => {
    try {
      setLoading(true);
      const disputeDoc = await getDoc(doc(db, 'disputes', params.disputeId));
      if (disputeDoc.exists()) {
        setDispute({ id: disputeDoc.id, ...disputeDoc.data() } as Dispute);
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
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // ─── Actions ──────────────────────────────────────────────────────

  const handleSubmitResponse = async () => {
    if (!responseText.trim() || !user || !dispute) return;
    setSubmitting(true);
    try {
      const result = await DisputeService.submitCounterResponse(
        dispute.id,
        user.id,
        `${user.firstName} ${user.lastName}`,
        responseText.trim()
      );
      if (result.success) {
        Alert.alert('Response Submitted', 'Your response has been recorded.');
        setResponseText('');
        setActivePanel('none');
        await loadDispute();
      } else {
        Alert.alert('Error', result.error || 'Failed to submit response');
      }
    } catch (error) {
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() || !user || !dispute) return;
    setSubmitting(true);
    try {
      const result = await DisputeService.addDisputeMessage(
        dispute.id,
        user.id,
        `${user.firstName} ${user.lastName}`,
        messageText.trim()
      );
      if (result.success) {
        setMessageText('');
        setActivePanel('none');
        await loadDispute();
      } else {
        Alert.alert('Error', result.error || 'Failed to send message');
      }
    } catch (error) {
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const handleProposeResolution = async () => {
    if (!proposalDescription.trim() || !user || !dispute) return;
    const amount = proposalAmount ? parseFloat(proposalAmount) : undefined;
    if (proposalAmount && (isNaN(amount!) || amount! <= 0)) {
      Alert.alert('Invalid Amount', 'Please enter a valid dollar amount.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await DisputeService.proposeResolution(
        dispute.id,
        user.id,
        `${user.firstName} ${user.lastName}`,
        proposalType,
        proposalDescription.trim(),
        amount
      );
      if (result.success) {
        Alert.alert('Proposal Sent', 'The other party will be notified to review your proposal.');
        setProposalDescription('');
        setProposalAmount('');
        setActivePanel('none');
        await loadDispute();
      } else {
        Alert.alert('Error', result.error || 'Failed to send proposal');
      }
    } catch (error) {
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRespondToProposal = (proposal: ResolutionProposal, accept: boolean) => {
    if (!user || !dispute) return;

    if (accept) {
      Alert.alert(
        'Accept Resolution',
        `Accept this proposal?\n\n${DisputeService.getResolutionTypeLabel(proposal.type)}${proposal.amount ? ` — $${proposal.amount.toFixed(2)}` : ''}\n\n${proposal.description}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Accept',
            onPress: async () => {
              setSubmitting(true);
              const result = await DisputeService.respondToProposal(
                dispute.id,
                proposal.id,
                user.id,
                `${user.firstName} ${user.lastName}`,
                true
              );
              if (result.success) {
                Alert.alert('Resolution Accepted', 'The dispute has been resolved by mutual agreement.');
                await loadDispute();
              }
              setSubmitting(false);
            },
          },
        ]
      );
    } else {
      Alert.alert(
        'Reject Resolution',
        'Are you sure you want to reject this proposal?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reject',
            style: 'destructive',
            onPress: async () => {
              setSubmitting(true);
              const result = await DisputeService.respondToProposal(
                dispute.id,
                proposal.id,
                user.id,
                `${user.firstName} ${user.lastName}`,
                false,
                'Proposal rejected'
              );
              if (result.success) {
                Alert.alert('Proposal Rejected', 'The other party will be notified.');
                await loadDispute();
              }
              setSubmitting(false);
            },
          },
        ]
      );
    }
  };

  const handleEscalate = async () => {
    if (!escalationReason.trim() || !user || !dispute) return;
    setSubmitting(true);
    try {
      const result = await DisputeService.escalateDispute(
        dispute.id,
        user.id,
        `${user.firstName} ${user.lastName}`,
        escalationReason.trim()
      );
      if (result.success) {
        Alert.alert('Dispute Escalated', 'An admin will review this dispute and make a decision.');
        setEscalationReason('');
        setActivePanel('none');
        await loadDispute();
      } else {
        Alert.alert('Error', result.error || 'Failed to escalate');
      }
    } catch (error) {
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render helpers ───────────────────────────────────────────────

  const getActivityIcon = (type: DisputeActivity['type']): string => {
    switch (type) {
      case 'created': return 'flag';
      case 'response': return 'chatbox-ellipses';
      case 'message': return 'chatbubble';
      case 'status_change': return 'swap-horizontal';
      case 'resolution_proposed': return 'hand-left';
      case 'resolution_accepted': return 'checkmark-circle';
      case 'resolution_rejected': return 'close-circle';
      case 'escalated': return 'arrow-up-circle';
      case 'admin_note': return 'shield';
      case 'refund_issued': return 'cash';
      default: return 'ellipse';
    }
  };

  const getActivityColor = (type: DisputeActivity['type']): string => {
    switch (type) {
      case 'created': return Colors.danger;
      case 'response': return Colors.secondary;
      case 'message': return Colors.muted;
      case 'resolution_proposed': return Colors.secondary;
      case 'resolution_accepted': return Colors.success;
      case 'resolution_rejected': return Colors.danger;
      case 'escalated': return Colors.warning;
      case 'admin_note': return Colors.primary;
      default: return Colors.muted;
    }
  };

  // ─── Render ───────────────────────────────────────────────────────

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

  if (!dispute || !user) return null;

  const isReporter = dispute.reporterId === user.id;
  const isAccused = dispute.accusedId === user.id;
  const isActive = !['resolved', 'closed'].includes(dispute.status);
  const hasResponded = !!dispute.counterResponse;
  const canRespond = isAccused && !hasResponded && isActive;
  const pendingProposal = (dispute.resolutionProposals || []).find(
    (p) => p.status === 'pending' && p.proposedBy !== user.id
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dispute Details</Text>
        <TouchableOpacity onPress={loadDispute}>
          <Ionicons name="refresh" size={22} color={Colors.secondary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Status Banner */}
          <View style={[styles.statusBanner, { backgroundColor: DisputeService.getDisputeStatusColor(dispute.status) }]}>
            <Ionicons name="information-circle" size={24} color={Colors.white} />
            <View style={styles.statusBannerContent}>
              <Text style={styles.statusBannerTitle}>
                {DisputeService.getDisputeStatusLabel(dispute.status)}
              </Text>
              <Text style={styles.statusBannerText}>
                {dispute.status === 'open' && 'Dispute submitted. Awaiting review.'}
                {dispute.status === 'awaiting_response' && (isAccused ? 'Please submit your response to this dispute.' : 'Waiting for the other party to respond.')}
                {dispute.status === 'investigating' && 'Both sides have been heard. Propose a resolution or escalate.'}
                {dispute.status === 'proposed_resolution' && (pendingProposal ? 'A resolution has been proposed for your review.' : 'Waiting for the other party to review your proposal.')}
                {dispute.status === 'resolved' && 'This dispute has been resolved.'}
                {dispute.status === 'closed' && 'This dispute has been closed.'}
                {dispute.status === 'escalated' && 'This dispute has been escalated to admin review.'}
              </Text>
            </View>
          </View>

          {/* Dispute Info Card */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Dispute Information</Text>
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Item</Text>
                <Text style={styles.infoValue}>{dispute.itemName}</Text>
              </View>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Type</Text>
                <Text style={styles.infoValue}>{DisputeService.getDisputeTypeLabel(dispute.type)}</Text>
              </View>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Filed</Text>
                <Text style={styles.infoValue}>{formatDate(dispute.createdAt)}</Text>
              </View>
              {dispute.estimatedCost != null && (
                <>
                  <View style={styles.infoDivider} />
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Est. Cost</Text>
                    <Text style={[styles.infoValue, { color: Colors.danger, fontWeight: '700' }]}>
                      ${dispute.estimatedCost.toFixed(2)}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>

          {/* Parties */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Parties Involved</Text>
            <View style={styles.partiesCard}>
              <View style={[styles.partyRow, isReporter && styles.highlightedParty]}>
                <Ionicons name="flag" size={18} color={Colors.danger} />
                <View style={styles.partyInfo}>
                  <Text style={styles.partyName}>{dispute.reporterName}{isReporter ? ' (You)' : ''}</Text>
                  <Text style={styles.partyRole}>{dispute.reporterRole === 'owner' ? 'Item Owner' : 'Renter'}</Text>
                </View>
              </View>
              <View style={styles.partiesDivider} />
              <View style={[styles.partyRow, isAccused && styles.highlightedParty]}>
                <Ionicons name="person" size={18} color={Colors.secondary} />
                <View style={styles.partyInfo}>
                  <Text style={styles.partyName}>{dispute.accusedName}{isAccused ? ' (You)' : ''}</Text>
                  <Text style={styles.partyRole}>{dispute.reporterRole === 'owner' ? 'Renter' : 'Item Owner'}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Original Description */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Original Complaint</Text>
            <View style={styles.messageCard}>
              <View style={styles.messageHeader}>
                <Text style={styles.messageSender}>{dispute.reporterName}</Text>
                <Text style={styles.messageTime}>{formatDate(dispute.createdAt)}</Text>
              </View>
              <Text style={styles.messageText}>{dispute.description}</Text>
            </View>
          </View>

          {/* Evidence Photos */}
          {dispute.damagePhotos.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Evidence Photos ({dispute.damagePhotos.length})</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.photosRow}>
                  {dispute.damagePhotos.map((photo, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.photoThumb}
                      onPress={() => {
                        setSelectedPhotoList(dispute.damagePhotos);
                        setSelectedPhoto(index);
                      }}
                    >
                      <Image source={{ uri: photo.url || photo.uri }} style={styles.photoImage} />
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          {/* Counter Response (if exists) */}
          {dispute.counterResponse && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Response from {dispute.accusedName}</Text>
              <View style={[styles.messageCard, { borderLeftColor: Colors.secondary, borderLeftWidth: 3 }]}>
                <View style={styles.messageHeader}>
                  <Text style={styles.messageSender}>{dispute.accusedName}</Text>
                  <Text style={styles.messageTime}>{dispute.counterResponseAt ? formatDate(dispute.counterResponseAt) : ''}</Text>
                </View>
                <Text style={styles.messageText}>{dispute.counterResponse}</Text>
              </View>
            </View>
          )}

          {/* Pending Resolution Proposal */}
          {pendingProposal && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Resolution Proposal</Text>
              <View style={styles.proposalCard}>
                <View style={styles.proposalHeader}>
                  <Ionicons name="hand-left" size={20} color={Colors.secondary} />
                  <Text style={styles.proposalTitle}>
                    {pendingProposal.proposedByName} proposes:
                  </Text>
                </View>
                <View style={styles.proposalBadge}>
                  <Text style={styles.proposalType}>
                    {DisputeService.getResolutionTypeLabel(pendingProposal.type)}
                  </Text>
                  {pendingProposal.amount != null && (
                    <Text style={styles.proposalAmount}>${pendingProposal.amount.toFixed(2)}</Text>
                  )}
                </View>
                <Text style={styles.proposalDesc}>{pendingProposal.description}</Text>
                <View style={styles.proposalActions}>
                  <TouchableOpacity
                    style={[styles.proposalBtn, { backgroundColor: Colors.success }]}
                    onPress={() => handleRespondToProposal(pendingProposal, true)}
                    disabled={submitting}
                  >
                    <Ionicons name="checkmark" size={18} color={Colors.white} />
                    <Text style={styles.proposalBtnText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.proposalBtn, { backgroundColor: Colors.danger }]}
                    onPress={() => handleRespondToProposal(pendingProposal, false)}
                    disabled={submitting}
                  >
                    <Ionicons name="close" size={18} color={Colors.white} />
                    <Text style={styles.proposalBtnText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* Activity Timeline */}
          {(dispute.activities || []).length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Activity Timeline</Text>
              <View style={styles.timeline}>
                {(dispute.activities || []).map((activity, index) => (
                  <View key={activity.id} style={styles.timelineItem}>
                    <View style={styles.timelineDot}>
                      <View style={[styles.dot, { backgroundColor: getActivityColor(activity.type) }]}>
                        <Ionicons
                          name={getActivityIcon(activity.type) as any}
                          size={12}
                          color={Colors.white}
                        />
                      </View>
                      {index < (dispute.activities || []).length - 1 && (
                        <View style={styles.timelineLine} />
                      )}
                    </View>
                    <View style={styles.timelineContent}>
                      <View style={styles.timelineHeader}>
                        <Text style={styles.timelineName}>{activity.userName}</Text>
                        <Text style={styles.timelineTime}>{formatDate(activity.createdAt)}</Text>
                      </View>
                      <Text style={styles.timelineText}>{activity.content}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Resolution Info (if resolved) */}
          {dispute.status === 'resolved' && dispute.resolutionNotes && (
            <View style={styles.section}>
              <View style={styles.resolvedCard}>
                <Ionicons name="checkmark-circle" size={28} color={Colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.resolvedTitle}>Dispute Resolved</Text>
                  {dispute.resolvedAt && (
                    <Text style={styles.resolvedDate}>{formatDate(dispute.resolvedAt)}</Text>
                  )}
                  <Text style={styles.resolvedNotes}>{dispute.resolutionNotes}</Text>
                </View>
              </View>
            </View>
          )}

          {/* Action Panels */}
          {activePanel === 'respond' && (
            <View style={styles.actionPanel}>
              <Text style={styles.actionPanelTitle}>Your Response</Text>
              <Text style={styles.actionPanelHint}>Provide your side of the story. Be specific and factual.</Text>
              <TextInput
                style={styles.textArea}
                placeholder="Describe your perspective..."
                placeholderTextColor={Colors.muted}
                value={responseText}
                onChangeText={setResponseText}
                multiline
                numberOfLines={4}
              />
              <View style={styles.actionPanelButtons}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setActivePanel('none')}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitBtn, !responseText.trim() && { opacity: 0.5 }]}
                  onPress={handleSubmitResponse}
                  disabled={!responseText.trim() || submitting}
                >
                  {submitting ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.submitBtnText}>Submit Response</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {activePanel === 'message' && (
            <View style={styles.actionPanel}>
              <Text style={styles.actionPanelTitle}>Send Message</Text>
              <TextInput
                style={styles.textArea}
                placeholder="Type your message..."
                placeholderTextColor={Colors.muted}
                value={messageText}
                onChangeText={setMessageText}
                multiline
                numberOfLines={3}
              />
              <View style={styles.actionPanelButtons}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setActivePanel('none')}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitBtn, !messageText.trim() && { opacity: 0.5 }]}
                  onPress={handleSendMessage}
                  disabled={!messageText.trim() || submitting}
                >
                  {submitting ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.submitBtnText}>Send</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {activePanel === 'propose' && (
            <View style={styles.actionPanel}>
              <Text style={styles.actionPanelTitle}>Propose Resolution</Text>
              <Text style={styles.inputLabel}>Resolution Type</Text>
              <View style={styles.typeRow}>
                {(['partial_refund', 'full_refund', 'repair_cost', 'no_action', 'other'] as ResolutionProposal['type'][]).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeChip, proposalType === t && styles.typeChipActive]}
                    onPress={() => setProposalType(t)}
                  >
                    <Text style={[styles.typeChipText, proposalType === t && styles.typeChipTextActive]}>
                      {DisputeService.getResolutionTypeLabel(t)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {['partial_refund', 'full_refund', 'repair_cost'].includes(proposalType) && (
                <>
                  <Text style={styles.inputLabel}>Amount ($)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0.00"
                    placeholderTextColor={Colors.muted}
                    value={proposalAmount}
                    onChangeText={setProposalAmount}
                    keyboardType="decimal-pad"
                  />
                </>
              )}
              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={styles.textArea}
                placeholder="Explain your proposed resolution..."
                placeholderTextColor={Colors.muted}
                value={proposalDescription}
                onChangeText={setProposalDescription}
                multiline
                numberOfLines={3}
              />
              <View style={styles.actionPanelButtons}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setActivePanel('none')}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitBtn, !proposalDescription.trim() && { opacity: 0.5 }]}
                  onPress={handleProposeResolution}
                  disabled={!proposalDescription.trim() || submitting}
                >
                  {submitting ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.submitBtnText}>Send Proposal</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {activePanel === 'escalate' && (
            <View style={styles.actionPanel}>
              <Text style={styles.actionPanelTitle}>Escalate to Admin</Text>
              <Text style={styles.actionPanelHint}>An admin will review this dispute and make a final decision. This should be used when you cannot reach an agreement.</Text>
              <TextInput
                style={styles.textArea}
                placeholder="Why are you escalating this dispute?"
                placeholderTextColor={Colors.muted}
                value={escalationReason}
                onChangeText={setEscalationReason}
                multiline
                numberOfLines={3}
              />
              <View style={styles.actionPanelButtons}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setActivePanel('none')}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitBtn, { backgroundColor: Colors.warning }, !escalationReason.trim() && { opacity: 0.5 }]}
                  onPress={handleEscalate}
                  disabled={!escalationReason.trim() || submitting}
                >
                  {submitting ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.submitBtnText}>Escalate</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={{ height: 30 }} />
        </ScrollView>

        {/* Bottom Action Bar */}
        {isActive && activePanel === 'none' && (
          <View style={styles.bottomBar}>
            {canRespond && (
              <TouchableOpacity style={[styles.bottomBtn, { backgroundColor: Colors.secondary }]} onPress={() => setActivePanel('respond')}>
                <Ionicons name="chatbox-ellipses" size={18} color={Colors.white} />
                <Text style={styles.bottomBtnText}>Respond</Text>
              </TouchableOpacity>
            )}
            {(hasResponded || isReporter) && isActive && (
              <TouchableOpacity style={[styles.bottomBtn, { backgroundColor: Colors.muted }]} onPress={() => setActivePanel('message')}>
                <Ionicons name="chatbubble" size={18} color={Colors.white} />
                <Text style={styles.bottomBtnText}>Message</Text>
              </TouchableOpacity>
            )}
            {isActive && dispute.status !== 'escalated' && (
              <TouchableOpacity style={[styles.bottomBtn, { backgroundColor: Colors.success }]} onPress={() => setActivePanel('propose')}>
                <Ionicons name="hand-left" size={18} color={Colors.white} />
                <Text style={styles.bottomBtnText}>Propose</Text>
              </TouchableOpacity>
            )}
            {isActive && dispute.status !== 'escalated' && (
              <TouchableOpacity style={[styles.bottomBtn, { backgroundColor: Colors.warning }]} onPress={() => setActivePanel('escalate')}>
                <Ionicons name="arrow-up-circle" size={18} color={Colors.white} />
                <Text style={styles.bottomBtnText}>Escalate</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Photo Modal */}
      {selectedPhoto !== null && selectedPhotoList.length > 0 && (
        <View style={styles.photoModal}>
          <View style={styles.photoModalHeader}>
            <TouchableOpacity onPress={() => setSelectedPhoto(null)}>
              <Ionicons name="close" size={32} color={Colors.white} />
            </TouchableOpacity>
            <Text style={styles.photoModalTitle}>
              Photo {selectedPhoto + 1} of {selectedPhotoList.length}
            </Text>
            <View style={{ width: 32 }} />
          </View>
          <Image
            source={{ uri: selectedPhotoList[selectedPhoto]?.url || selectedPhotoList[selectedPhoto]?.uri }}
            style={styles.photoModalImage}
            resizeMode="contain"
          />
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 16, color: Colors.muted },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.text },

  content: { flex: 1, padding: 16 },

  statusBanner: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  statusBannerContent: { flex: 1 },
  statusBannerTitle: { fontSize: 16, fontWeight: '700', color: Colors.white },
  statusBannerText: { fontSize: 13, color: 'rgba(255,255,255,0.9)', marginTop: 2 },

  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 8 },

  infoCard: { backgroundColor: Colors.white, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  infoLabel: { fontSize: 14, color: Colors.muted },
  infoValue: { fontSize: 14, fontWeight: '600', color: Colors.text, flex: 1, textAlign: 'right' },
  infoDivider: { height: 1, backgroundColor: Colors.border },

  partiesCard: { backgroundColor: Colors.white, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border },
  partyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  highlightedParty: { backgroundColor: Colors.primary + '10', borderRadius: 8, padding: 8, margin: -4 },
  partyInfo: { flex: 1 },
  partyName: { fontSize: 14, fontWeight: '600', color: Colors.text },
  partyRole: { fontSize: 12, color: Colors.muted },
  partiesDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 4 },

  messageCard: { backgroundColor: Colors.white, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border },
  messageHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  messageSender: { fontSize: 13, fontWeight: '700', color: Colors.text },
  messageTime: { fontSize: 11, color: Colors.muted },
  messageText: { fontSize: 14, color: Colors.text, lineHeight: 20 },

  photosRow: { flexDirection: 'row', gap: 8 },
  photoThumb: { width: 100, height: 100, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  photoImage: { width: '100%', height: '100%' },

  proposalCard: { backgroundColor: Colors.white, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.secondary + '40' },
  proposalHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  proposalTitle: { fontSize: 14, fontWeight: '600', color: Colors.text },
  proposalBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.secondary + '10', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start', marginBottom: 8 },
  proposalType: { fontSize: 13, fontWeight: '700', color: Colors.secondary },
  proposalAmount: { fontSize: 15, fontWeight: '800', color: Colors.secondary },
  proposalDesc: { fontSize: 14, color: Colors.text, lineHeight: 20, marginBottom: 12 },
  proposalActions: { flexDirection: 'row', gap: 10 },
  proposalBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10, gap: 6 },
  proposalBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },

  timeline: { gap: 0 },
  timelineItem: { flexDirection: 'row', minHeight: 50 },
  timelineDot: { alignItems: 'center', width: 30 },
  dot: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  timelineLine: { width: 2, flex: 1, backgroundColor: Colors.border, marginVertical: 2 },
  timelineContent: { flex: 1, paddingLeft: 10, paddingBottom: 16 },
  timelineHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  timelineName: { fontSize: 12, fontWeight: '700', color: Colors.text },
  timelineTime: { fontSize: 10, color: Colors.muted },
  timelineText: { fontSize: 13, color: Colors.muted, lineHeight: 18 },

  resolvedCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: Colors.success + '10',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.success + '30',
  },
  resolvedTitle: { fontSize: 16, fontWeight: '700', color: Colors.success },
  resolvedDate: { fontSize: 12, color: Colors.muted, marginTop: 2 },
  resolvedNotes: { fontSize: 14, color: Colors.text, lineHeight: 20, marginTop: 6 },

  actionPanel: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  actionPanelTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  actionPanelHint: { fontSize: 12, color: Colors.muted, marginBottom: 12, lineHeight: 18 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 4, marginTop: 8 },
  input: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
  },
  textArea: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  typeChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  typeChipActive: { backgroundColor: Colors.secondary + '15', borderColor: Colors.secondary },
  typeChipText: { fontSize: 12, color: Colors.muted },
  typeChipTextActive: { color: Colors.secondary, fontWeight: '600' },
  actionPanelButtons: { flexDirection: 'row', gap: 10, marginTop: 12 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: Colors.background, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: Colors.muted },
  submitBtn: { flex: 2, paddingVertical: 12, borderRadius: 10, backgroundColor: Colors.secondary, alignItems: 'center' },
  submitBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  bottomBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  bottomBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 4,
  },
  bottomBtnText: { fontSize: 12, fontWeight: '700', color: Colors.white },

  photoModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
  },
  photoModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
  },
  photoModalTitle: { fontSize: 16, fontWeight: '600', color: Colors.white },
  photoModalImage: { width: width, height: width, alignSelf: 'center' },
});
