// src/services/DisputeService.ts - WITH NOTIFICATIONS
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc,
  addDoc, 
  updateDoc,
  query, 
  where,
  orderBy 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import NotificationService from './NotificationService';

export type DisputeType = 'damage' | 'not_as_described' | 'late_return' | 'payment_issue' | 'other';
export type DisputeStatus = 'open' | 'awaiting_response' | 'investigating' | 'proposed_resolution' | 'resolved' | 'closed' | 'escalated';
export type DisputeResolvedBy = 'admin' | 'mutual_agreement' | 'refund_issued' | 'no_action';

export interface DamagePhoto {
  uri: string;
  url?: string;
  description: string;
  timestamp: string;
}

export interface DisputeActivity {
  id: string;
  type: 'created' | 'response' | 'message' | 'status_change' | 'resolution_proposed' | 'resolution_accepted' | 'resolution_rejected' | 'escalated' | 'admin_note' | 'refund_issued';
  userId: string;
  userName: string;
  content: string;
  photos?: DamagePhoto[];
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface ResolutionProposal {
  id: string;
  proposedBy: string;
  proposedByName: string;
  type: 'full_refund' | 'partial_refund' | 'replacement' | 'repair_cost' | 'no_action' | 'other';
  amount?: number;
  description: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  respondedAt?: string;
  respondedBy?: string;
  rejectionReason?: string;
  createdAt: string;
}

export interface Dispute {
  id: string;
  rentalId: string;
  itemId: string;
  itemName: string;
  reporterId: string;
  reporterName: string;
  reporterRole: 'renter' | 'owner';
  accusedId: string;
  accusedName: string;
  type: DisputeType;
  status: DisputeStatus;
  description: string;
  damagePhotos: DamagePhoto[];
  estimatedCost?: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolvedBy?: DisputeResolvedBy;
  resolutionNotes?: string;
  adminNotes?: string;

  // New resolution fields
  counterResponse?: string;
  counterResponsePhotos?: DamagePhoto[];
  counterResponseAt?: string;
  activities?: DisputeActivity[];
  resolutionProposals?: ResolutionProposal[];
  escalatedAt?: string;
  escalationReason?: string;
}

export interface UserReport {
  id: string;
  reporterId: string;
  reporterName: string;
  reportedUserId: string;
  reportedUserName: string;
  reason: 'harassment' | 'fraud' | 'inappropriate_content' | 'spam' | 'other';
  description: string;
  evidence?: string[];
  status: 'pending' | 'reviewed' | 'action_taken' | 'dismissed';
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  actionTaken?: string;
}

class DisputeService {
  private static instance: DisputeService;

  static getInstance(): DisputeService {
    if (!DisputeService.instance) {
      DisputeService.instance = new DisputeService();
    }
    return DisputeService.instance;
  }

  // Upload damage photos
  async uploadDamagePhoto(imageUri: string, disputeId: string): Promise<string> {
    try {
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const storageRef = ref(storage, `disputes/${disputeId}/${Date.now()}.jpg`);
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      return downloadURL;
    } catch (error) {
      console.error('Error uploading damage photo:', error);
      throw error;
    }
  }

  // Create a damage report/dispute WITH NOTIFICATIONS
  async createDispute(
    disputeData: Omit<Dispute, 'id' | 'createdAt' | 'updatedAt' | 'status'>
  ): Promise<{ success: boolean; dispute?: Dispute; error?: string }> {
    try {
      // Build dispute object, excluding undefined fields
      const newDispute: any = {
        rentalId: disputeData.rentalId,
        itemId: disputeData.itemId,
        itemName: disputeData.itemName,
        reporterId: disputeData.reporterId,
        reporterName: disputeData.reporterName,
        reporterRole: disputeData.reporterRole,
        accusedId: disputeData.accusedId,
        accusedName: disputeData.accusedName,
        type: disputeData.type,
        description: disputeData.description,
        damagePhotos: disputeData.damagePhotos,
        status: 'awaiting_response',
        activities: [{
          id: `act_${Date.now()}`,
          type: 'created',
          userId: disputeData.reporterId,
          userName: disputeData.reporterName,
          content: `Dispute filed: ${disputeData.description}`,
          photos: disputeData.damagePhotos.length > 0 ? disputeData.damagePhotos : undefined,
          createdAt: new Date().toISOString(),
        }],
        resolutionProposals: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Only add estimatedCost if it's defined
      if (disputeData.estimatedCost !== undefined) {
        newDispute.estimatedCost = disputeData.estimatedCost;
      }

      const docRef = await addDoc(collection(db, 'disputes'), newDispute);

      // LAYER 3 FRAUD PROTECTION: Freeze payout if rental is in 48h dispute window
      try {
        const rentalRef = doc(db, 'rentals', disputeData.rentalId);
        const rentalSnap = await getDoc(rentalRef);
        if (rentalSnap.exists()) {
          const rentalData = rentalSnap.data();
          if (rentalData.status === 'completed_pending_payout') {
            await updateDoc(rentalRef, {
              payoutFrozen: true,
            });
            console.log(`Payout frozen for rental ${disputeData.rentalId} due to dispute ${docRef.id}`);
          }
        }
      } catch (freezeError) {
        console.error('Error freezing payout:', freezeError);
        // Don't fail the dispute creation if freeze fails
      }

      // Upload damage photos if any
      if (disputeData.damagePhotos.length > 0) {
        const photosWithUrls = await Promise.all(
          disputeData.damagePhotos.map(async (photo) => {
            if (photo.uri && !photo.uri.startsWith('http')) {
              const url = await this.uploadDamagePhoto(photo.uri, docRef.id);
              return { ...photo, url };
            }
            return photo;
          })
        );

        await updateDoc(doc(db, 'disputes', docRef.id), {
          damagePhotos: photosWithUrls,
        });
      }

      // SEND NOTIFICATIONS
      try {
        // Notify the accused party
        await NotificationService.sendNotificationToUser(
          disputeData.accusedId,
          '⚠️ Dispute Reported',
          `${disputeData.reporterName} has reported a dispute regarding ${disputeData.itemName}`,
          {
            type: 'dispute_created',
            disputeId: docRef.id,
            rentalId: disputeData.rentalId,
            screen: 'DisputeDetails',
          }
        );

        // Notify the reporter (confirmation)
        await NotificationService.sendNotificationToUser(
          disputeData.reporterId,
          '📋 Dispute Submitted',
          `Your dispute regarding ${disputeData.itemName} has been submitted and is under review`,
          {
            type: 'dispute_submitted',
            disputeId: docRef.id,
            rentalId: disputeData.rentalId,
            screen: 'DisputeDetails',
          }
        );
      } catch (notifError) {
        console.error('Error sending dispute notifications:', notifError);
        // Don't fail the dispute creation if notifications fail
      }

      return {
        success: true,
        dispute: {
          id: docRef.id,
          ...newDispute,
          damagePhotos: disputeData.damagePhotos.length > 0 ? 
            (await updateDoc(doc(db, 'disputes', docRef.id), {}), disputeData.damagePhotos) : 
            disputeData.damagePhotos,
        } as Dispute,
      };
    } catch (error) {
      console.error('Error creating dispute:', error);
      return { success: false, error: 'Failed to create dispute' };
    }
  }

  // Get disputes for a specific rental
  async getDisputesByRental(rentalId: string): Promise<Dispute[]> {
    try {
      const disputesRef = collection(db, 'disputes');
      const q = query(disputesRef, where('rentalId', '==', rentalId));
      const querySnapshot = await getDocs(q);

      const disputes: Dispute[] = [];
      querySnapshot.forEach((doc) => {
        disputes.push({
          id: doc.id,
          ...doc.data(),
        } as Dispute);
      });

      return disputes;
    } catch (error) {
      console.error('Error fetching disputes:', error);
      return [];
    }
  }

  // Get disputes by user (as reporter or accused)
  async getDisputesByUser(userId: string): Promise<Dispute[]> {
    try {
      const disputesRef = collection(db, 'disputes');
      
      // Get disputes where user is reporter
      const reporterQuery = query(disputesRef, where('reporterId', '==', userId));
      const reporterSnapshot = await getDocs(reporterQuery);
      
      // Get disputes where user is accused
      const accusedQuery = query(disputesRef, where('accusedId', '==', userId));
      const accusedSnapshot = await getDocs(accusedQuery);

      const disputes: Dispute[] = [];
      
      reporterSnapshot.forEach((doc) => {
        disputes.push({
          id: doc.id,
          ...doc.data(),
        } as Dispute);
      });

      accusedSnapshot.forEach((doc) => {
        disputes.push({
          id: doc.id,
          ...doc.data(),
        } as Dispute);
      });

      // Remove duplicates and sort by date
      const uniqueDisputes = Array.from(
        new Map(disputes.map(d => [d.id, d])).values()
      ).sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      return uniqueDisputes;
    } catch (error) {
      console.error('Error fetching user disputes:', error);
      return [];
    }
  }

  // Get all disputes (for admin)
  async getAllDisputes(): Promise<Dispute[]> {
    try {
      const disputesRef = collection(db, 'disputes');
      const q = query(disputesRef, orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);

      const disputes: Dispute[] = [];
      querySnapshot.forEach((doc) => {
        disputes.push({
          id: doc.id,
          ...doc.data(),
        } as Dispute);
      });

      return disputes;
    } catch (error) {
      console.error('Error fetching all disputes:', error);
      return [];
    }
  }

  // Update dispute status WITH NOTIFICATIONS
  async updateDisputeStatus(
    disputeId: string,
    status: DisputeStatus,
    resolvedBy?: DisputeResolvedBy,
    resolutionNotes?: string,
    adminNotes?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const updateData: any = {
        status,
        updatedAt: new Date().toISOString(),
      };

      if (status === 'resolved' || status === 'closed') {
        updateData.resolvedAt = new Date().toISOString();
        if (resolvedBy) updateData.resolvedBy = resolvedBy;
        if (resolutionNotes) updateData.resolutionNotes = resolutionNotes;
      }

      if (adminNotes) {
        updateData.adminNotes = adminNotes;
      }

      await updateDoc(doc(db, 'disputes', disputeId), updateData);

      // SEND NOTIFICATIONS based on status
      try {
        const disputeDoc = await getDoc(doc(db, 'disputes', disputeId));
        if (disputeDoc.exists()) {
          const dispute = disputeDoc.data() as Dispute;

          if (status === 'investigating') {
            // Notify both parties
            await NotificationService.sendNotificationToUser(
              dispute.reporterId,
              '🔍 Dispute Under Investigation',
              `Your dispute regarding ${dispute.itemName} is now being investigated`,
              {
                type: 'dispute_investigating',
                disputeId: disputeId,
                screen: 'DisputeDetails',
              }
            );

            await NotificationService.sendNotificationToUser(
              dispute.accusedId,
              '🔍 Dispute Under Investigation',
              `The dispute regarding ${dispute.itemName} is now being investigated`,
              {
                type: 'dispute_investigating',
                disputeId: disputeId,
                screen: 'DisputeDetails',
              }
            );
          } else if (status === 'resolved') {
            // Notify both parties of resolution
            await NotificationService.sendNotificationToUser(
              dispute.reporterId,
              '✅ Dispute Resolved',
              `Your dispute regarding ${dispute.itemName} has been resolved`,
              {
                type: 'dispute_resolved',
                disputeId: disputeId,
                screen: 'DisputeDetails',
              }
            );

            await NotificationService.sendNotificationToUser(
              dispute.accusedId,
              '✅ Dispute Resolved',
              `The dispute regarding ${dispute.itemName} has been resolved`,
              {
                type: 'dispute_resolved',
                disputeId: disputeId,
                screen: 'DisputeDetails',
              }
            );
          } else if (status === 'closed') {
            // Notify both parties dispute is closed
            await NotificationService.sendNotificationToUser(
              dispute.reporterId,
              '🔒 Dispute Closed',
              `Your dispute regarding ${dispute.itemName} has been closed`,
              {
                type: 'dispute_closed',
                disputeId: disputeId,
                screen: 'DisputeDetails',
              }
            );

            await NotificationService.sendNotificationToUser(
              dispute.accusedId,
              '🔒 Dispute Closed',
              `The dispute regarding ${dispute.itemName} has been closed`,
              {
                type: 'dispute_closed',
                disputeId: disputeId,
                screen: 'DisputeDetails',
              }
            );
          }
        }
      } catch (notifError) {
        console.error('Error sending status update notifications:', notifError);
        // Don't fail the update if notifications fail
      }

      return { success: true };
    } catch (error) {
      console.error('Error updating dispute:', error);
      return { success: false, error: 'Failed to update dispute' };
    }
  }

  // Add admin comment/update WITH NOTIFICATION
  async addAdminUpdate(
    disputeId: string,
    comment: string,
    adminName: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const disputeDoc = await getDoc(doc(db, 'disputes', disputeId));

      if (!disputeDoc.exists()) {
        return { success: false, error: 'Dispute not found' };
      }

      const dispute = disputeDoc.data() as Dispute;

      // Add comment to dispute
      await updateDoc(doc(db, 'disputes', disputeId), {
        lastAdminUpdate: comment,
        lastAdminUpdateBy: adminName,
        lastAdminUpdateAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // SEND NOTIFICATIONS to both parties
      try {
        await NotificationService.sendNotificationToUser(
          dispute.reporterId,
          '💬 Admin Update',
          `Admin has added an update to your dispute regarding ${dispute.itemName}`,
          {
            type: 'dispute_admin_update',
            disputeId: disputeId,
            screen: 'DisputeDetails',
          }
        );

        await NotificationService.sendNotificationToUser(
          dispute.accusedId,
          '💬 Admin Update',
          `Admin has added an update to the dispute regarding ${dispute.itemName}`,
          {
            type: 'dispute_admin_update',
            disputeId: disputeId,
            screen: 'DisputeDetails',
          }
        );
      } catch (notifError) {
        console.error('Error sending admin update notifications:', notifError);
      }

      return { success: true };
    } catch (error) {
      console.error('Error adding admin update:', error);
      return { success: false, error: 'Failed to add admin update' };
    }
  }

  // Create user report
  async reportUser(
    reportData: Omit<UserReport, 'id' | 'createdAt' | 'status'>
  ): Promise<{ success: boolean; report?: UserReport; error?: string }> {
    try {
      const newReport: Omit<UserReport, 'id'> = {
        ...reportData,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, 'userReports'), newReport);

      return {
        success: true,
        report: {
          id: docRef.id,
          ...newReport,
        } as UserReport,
      };
    } catch (error) {
      console.error('Error reporting user:', error);
      return { success: false, error: 'Failed to submit report' };
    }
  }

  // Get all user reports (admin)
  async getAllUserReports(): Promise<UserReport[]> {
    try {
      const reportsRef = collection(db, 'userReports');
      const q = query(reportsRef, orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);

      const reports: UserReport[] = [];
      querySnapshot.forEach((doc) => {
        reports.push({
          id: doc.id,
          ...doc.data(),
        } as UserReport);
      });

      return reports;
    } catch (error) {
      console.error('Error fetching user reports:', error);
      return [];
    }
  }

  // Update user report status (admin)
  async updateUserReport(
    reportId: string,
    status: UserReport['status'],
    actionTaken?: string,
    reviewedBy?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const updateData: any = {
        status,
        reviewedAt: new Date().toISOString(),
      };

      if (actionTaken) updateData.actionTaken = actionTaken;
      if (reviewedBy) updateData.reviewedBy = reviewedBy;

      await updateDoc(doc(db, 'userReports', reportId), updateData);

      return { success: true };
    } catch (error) {
      console.error('Error updating user report:', error);
      return { success: false, error: 'Failed to update report' };
    }
  }

  // ============================================================================
  // DISPUTE RESOLUTION METHODS
  // ============================================================================

  // Submit a counter-response (accused party's side of the story)
  async submitCounterResponse(
    disputeId: string,
    userId: string,
    userName: string,
    response: string,
    photos: DamagePhoto[] = []
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const disputeRef = doc(db, 'disputes', disputeId);
      const disputeDoc = await getDoc(disputeRef);
      if (!disputeDoc.exists()) return { success: false, error: 'Dispute not found' };

      const dispute = disputeDoc.data() as Dispute;

      // Only the accused can respond
      if (dispute.accusedId !== userId) {
        return { success: false, error: 'Only the accused party can submit a response' };
      }

      // Upload photos
      let photosWithUrls = photos;
      if (photos.length > 0) {
        photosWithUrls = await Promise.all(
          photos.map(async (photo) => {
            if (photo.uri && !photo.uri.startsWith('http')) {
              const url = await this.uploadDamagePhoto(photo.uri, disputeId);
              return { ...photo, url };
            }
            return photo;
          })
        );
      }

      // Add activity log entry
      const activity: DisputeActivity = {
        id: `act_${Date.now()}`,
        type: 'response',
        userId,
        userName,
        content: response,
        photos: photosWithUrls.length > 0 ? photosWithUrls : undefined,
        createdAt: new Date().toISOString(),
      };

      const existingActivities = dispute.activities || [];

      await updateDoc(disputeRef, {
        counterResponse: response,
        counterResponsePhotos: photosWithUrls,
        counterResponseAt: new Date().toISOString(),
        status: 'investigating',
        activities: [...existingActivities, activity],
        updatedAt: new Date().toISOString(),
      });

      // Notify reporter
      await NotificationService.sendNotificationToUser(
        dispute.reporterId,
        '💬 Response Received',
        `${userName} has responded to your dispute regarding "${dispute.itemName}"`,
        { type: 'dispute_response', disputeId, screen: 'DisputeDetails' }
      );

      return { success: true };
    } catch (error) {
      console.error('Error submitting counter response:', error);
      return { success: false, error: 'Failed to submit response' };
    }
  }

  // Add a message to the dispute (either party or admin)
  async addDisputeMessage(
    disputeId: string,
    userId: string,
    userName: string,
    message: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const disputeRef = doc(db, 'disputes', disputeId);
      const disputeDoc = await getDoc(disputeRef);
      if (!disputeDoc.exists()) return { success: false, error: 'Dispute not found' };

      const dispute = disputeDoc.data() as Dispute;

      // Only involved parties can message
      if (dispute.reporterId !== userId && dispute.accusedId !== userId) {
        return { success: false, error: 'Only involved parties can add messages' };
      }

      const activity: DisputeActivity = {
        id: `act_${Date.now()}`,
        type: 'message',
        userId,
        userName,
        content: message,
        createdAt: new Date().toISOString(),
      };

      const existingActivities = dispute.activities || [];

      await updateDoc(disputeRef, {
        activities: [...existingActivities, activity],
        updatedAt: new Date().toISOString(),
      });

      // Notify the other party
      const otherUserId = dispute.reporterId === userId ? dispute.accusedId : dispute.reporterId;
      await NotificationService.sendNotificationToUser(
        otherUserId,
        '💬 New Dispute Message',
        `${userName} sent a message regarding the dispute for "${dispute.itemName}"`,
        { type: 'dispute_message', disputeId, screen: 'DisputeDetails' }
      );

      return { success: true };
    } catch (error) {
      console.error('Error adding dispute message:', error);
      return { success: false, error: 'Failed to send message' };
    }
  }

  // Propose a resolution (either party)
  async proposeResolution(
    disputeId: string,
    userId: string,
    userName: string,
    type: ResolutionProposal['type'],
    description: string,
    amount?: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const disputeRef = doc(db, 'disputes', disputeId);
      const disputeDoc = await getDoc(disputeRef);
      if (!disputeDoc.exists()) return { success: false, error: 'Dispute not found' };

      const dispute = disputeDoc.data() as Dispute;

      if (dispute.reporterId !== userId && dispute.accusedId !== userId) {
        return { success: false, error: 'Only involved parties can propose resolutions' };
      }

      const proposal: ResolutionProposal = {
        id: `prop_${Date.now()}`,
        proposedBy: userId,
        proposedByName: userName,
        type,
        amount,
        description,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      const activity: DisputeActivity = {
        id: `act_${Date.now()}`,
        type: 'resolution_proposed',
        userId,
        userName,
        content: `Proposed resolution: ${this.getResolutionTypeLabel(type)}${amount ? ` — $${amount.toFixed(2)}` : ''} — ${description}`,
        metadata: { proposalId: proposal.id, type, amount },
        createdAt: new Date().toISOString(),
      };

      const existingProposals = dispute.resolutionProposals || [];
      const existingActivities = dispute.activities || [];

      await updateDoc(disputeRef, {
        resolutionProposals: [...existingProposals, proposal],
        activities: [...existingActivities, activity],
        status: 'proposed_resolution',
        updatedAt: new Date().toISOString(),
      });

      // Notify the other party
      const otherUserId = dispute.reporterId === userId ? dispute.accusedId : dispute.reporterId;
      await NotificationService.sendNotificationToUser(
        otherUserId,
        '🤝 Resolution Proposed',
        `${userName} proposed a resolution for the dispute regarding "${dispute.itemName}"`,
        { type: 'dispute_resolution_proposed', disputeId, screen: 'DisputeDetails' }
      );

      return { success: true };
    } catch (error) {
      console.error('Error proposing resolution:', error);
      return { success: false, error: 'Failed to propose resolution' };
    }
  }

  // Respond to a resolution proposal
  async respondToProposal(
    disputeId: string,
    proposalId: string,
    userId: string,
    userName: string,
    accept: boolean,
    rejectionReason?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const disputeRef = doc(db, 'disputes', disputeId);
      const disputeDoc = await getDoc(disputeRef);
      if (!disputeDoc.exists()) return { success: false, error: 'Dispute not found' };

      const dispute = disputeDoc.data() as Dispute;
      const proposals = dispute.resolutionProposals || [];
      const proposalIndex = proposals.findIndex((p: ResolutionProposal) => p.id === proposalId);

      if (proposalIndex === -1) return { success: false, error: 'Proposal not found' };

      const proposal = proposals[proposalIndex];

      // Can't respond to your own proposal
      if (proposal.proposedBy === userId) {
        return { success: false, error: 'You cannot respond to your own proposal' };
      }

     // Update the proposal
      const updatedProposal: any = {
        ...proposal,
        status: accept ? 'accepted' : 'rejected',
        respondedAt: new Date().toISOString(),
        respondedBy: userId,
      };
      if (!accept && rejectionReason) {
        updatedProposal.rejectionReason = rejectionReason;
      }
      proposals[proposalIndex] = updatedProposal;

      const activity: DisputeActivity = {
        id: `act_${Date.now()}`,
        type: accept ? 'resolution_accepted' : 'resolution_rejected',
        userId,
        userName,
        content: accept
          ? `Accepted the proposed resolution: ${this.getResolutionTypeLabel(proposal.type)}`
          : `Rejected the proposed resolution${rejectionReason ? `: ${rejectionReason}` : ''}`,
        metadata: { proposalId, accepted: accept },
        createdAt: new Date().toISOString(),
      };

      const existingActivities = dispute.activities || [];

      const updateData: any = {
        resolutionProposals: proposals,
        activities: [...existingActivities, activity],
        updatedAt: new Date().toISOString(),
      };

      if (accept) {
        updateData.status = 'resolved';
        updateData.resolvedAt = new Date().toISOString();
        updateData.resolvedBy = 'mutual_agreement';
        updateData.resolutionNotes = `${proposal.proposedByName}'s proposal accepted: ${this.getResolutionTypeLabel(proposal.type)}${proposal.amount ? ` — $${proposal.amount.toFixed(2)}` : ''} — ${proposal.description}`;
      } else {
        updateData.status = 'investigating';
      }

      await updateDoc(disputeRef, updateData);

      // Notify the proposer
      await NotificationService.sendNotificationToUser(
        proposal.proposedBy,
        accept ? '✅ Resolution Accepted' : '❌ Resolution Rejected',
        accept
          ? `${userName} accepted your resolution for "${dispute.itemName}"`
          : `${userName} rejected your resolution for "${dispute.itemName}"${rejectionReason ? `: ${rejectionReason}` : ''}`,
        { type: accept ? 'dispute_resolved' : 'dispute_resolution_rejected', disputeId, screen: 'DisputeDetails' }
      );

      return { success: true };
    } catch (error) {
      console.error('Error responding to proposal:', error);
      return { success: false, error: 'Failed to respond to proposal' };
    }
  }

  // Escalate dispute to admin
  async escalateDispute(
    disputeId: string,
    userId: string,
    userName: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const disputeRef = doc(db, 'disputes', disputeId);
      const disputeDoc = await getDoc(disputeRef);
      if (!disputeDoc.exists()) return { success: false, error: 'Dispute not found' };

      const dispute = disputeDoc.data() as Dispute;

      const activity: DisputeActivity = {
        id: `act_${Date.now()}`,
        type: 'escalated',
        userId,
        userName,
        content: `Escalated to admin: ${reason}`,
        createdAt: new Date().toISOString(),
      };

      const existingActivities = dispute.activities || [];

      await updateDoc(disputeRef, {
        status: 'escalated',
        escalatedAt: new Date().toISOString(),
        escalationReason: reason,
        activities: [...existingActivities, activity],
        updatedAt: new Date().toISOString(),
      });

      // Notify both parties
      const otherUserId = dispute.reporterId === userId ? dispute.accusedId : dispute.reporterId;
      await NotificationService.sendNotificationToUser(
        otherUserId,
        '⬆️ Dispute Escalated',
        `The dispute regarding "${dispute.itemName}" has been escalated to admin review`,
        { type: 'dispute_escalated', disputeId, screen: 'DisputeDetails' }
      );

      return { success: true };
    } catch (error) {
      console.error('Error escalating dispute:', error);
      return { success: false, error: 'Failed to escalate dispute' };
    }
  }

  // Get resolution type label
  getResolutionTypeLabel(type: ResolutionProposal['type']): string {
    const labels = {
      full_refund: 'Full Refund',
      partial_refund: 'Partial Refund',
      replacement: 'Replacement',
      repair_cost: 'Repair Cost Coverage',
      no_action: 'No Action Needed',
      other: 'Other',
    };
    return labels[type] || type;
  }

  // Get dispute type label
  getDisputeTypeLabel(type: DisputeType): string {
    const labels = {
      damage: 'Item Damage',
      not_as_described: 'Not As Described',
      late_return: 'Late Return',
      payment_issue: 'Payment Issue',
      other: 'Other',
    };
    return labels[type];
  }

  // Get dispute status color
  getDisputeStatusColor(status: DisputeStatus): string {
    const colors: Record<string, string> = {
      open: '#EF4444',
      awaiting_response: '#F59E0B',
      investigating: '#F59E0B',
      proposed_resolution: '#2E86AB',
      resolved: '#10B981',
      closed: '#6B7280',
      escalated: '#DC3545',
    };
    return colors[status] || '#6B7280';
  }

  // Get dispute status label
  getDisputeStatusLabel(status: DisputeStatus): string {
    const labels: Record<string, string> = {
      open: 'Open',
      awaiting_response: 'Awaiting Response',
      investigating: 'Under Investigation',
      proposed_resolution: 'Resolution Proposed',
      resolved: 'Resolved',
      closed: 'Closed',
      escalated: 'Escalated to Admin',
    };
    return labels[status] || status;
  }
}

export default DisputeService.getInstance();