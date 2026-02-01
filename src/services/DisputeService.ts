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
export type DisputeStatus = 'open' | 'investigating' | 'resolved' | 'closed';
export type DisputeResolvedBy = 'admin' | 'mutual_agreement' | 'refund_issued' | 'no_action';

export interface DamagePhoto {
  uri: string;
  url?: string;
  description: string;
  timestamp: string;
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
        status: 'open',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Only add estimatedCost if it's defined
      if (disputeData.estimatedCost !== undefined) {
        newDispute.estimatedCost = disputeData.estimatedCost;
      }

      const docRef = await addDoc(collection(db, 'disputes'), newDispute);

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
    const colors = {
      open: '#EF4444',
      investigating: '#F59E0B',
      resolved: '#10B981',
      closed: '#6B7280',
    };
    return colors[status];
  }
}

export default DisputeService.getInstance();