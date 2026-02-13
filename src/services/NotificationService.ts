// src/services/NotificationService.ts
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { doc, setDoc, getDoc, collection, addDoc, query, where, orderBy, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';




export interface NotificationData {
  type: 'rental_request' | 'rental_approved' | 'rental_declined' | 'rental_active' | 'rental_completed' | 'message_received' | 'payment_received' | 'payout_received' | 'dispute_update' | 'dispute_created' | 'dispute_submitted' | 'dispute_investigating'| 'dispute_resolved'| 'dispute_closed'| 'dispute_admin_update';
  rentalId?: string;
  messageId?: string;
  screen?: string;
  userId?: string;
  [key: string]: any;
}

export interface StoredNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  data: NotificationData;
  read: boolean;
  createdAt: string;
}

class NotificationService {
  private static instance: NotificationService;
  private pushToken: string | null = null;

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Initialize notification service and request permissions
   */
  async initialize(userId: string): Promise<void> {
    try {
      // Request permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return;
      }

      // Get push token
      const token = await this.getPushToken();
      
      if (token) {
        this.pushToken = token;
        // Save token to Firebase
        await this.savePushToken(userId, token);
      }

      // Configure notification channel for Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#F5C542',
        });
      }
    } catch (error) {
      console.error('Error initializing notifications:', error);
    }
  }

  /**
   * Get Expo push token
   */
  private async getPushToken(): Promise<string | null> {
  try {
    if (!Device.isDevice) {
      console.log('📱 Push notifications require a physical device');
      return null;
    }

    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    
    if (!projectId) {
      console.log('ℹ️  No project ID found - Push notifications disabled (local notifications still work)');
      return null;
    }

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    console.log('✅ Push token obtained:', token.data);
    return token.data;
  } catch (error) {
    console.log('⚠️  Could not get push token (this is OK for development):', error);
    return null;
  }
}

  /**
   * Save push token to Firebase
   */
  private async savePushToken(userId: string, token: string): Promise<void> {
    try {
      const userRef = doc(db, 'users', userId);
      await setDoc(userRef, {
        pushToken: token,
        pushTokenUpdatedAt: new Date().toISOString(),
      }, { merge: true });
      console.log('Push token saved to Firebase');
    } catch (error) {
      console.error('Error saving push token:', error);
    }
  }

  /**
   * Send local notification (appears on device)
   */
  async sendLocalNotification(
    title: string,
    body: string,
    data: NotificationData
  ): Promise<void> {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null, // Show immediately
      });
    } catch (error) {
      console.error('Error sending local notification:', error);
    }
  }

  /**
   * Store notification in Firebase for notification center
   */
  async storeNotification(
    userId: string,
    title: string,
    body: string,
    data: NotificationData
  ): Promise<void> {
    try {
      const notificationRef = collection(db, 'notifications');
      await addDoc(notificationRef, {
        userId,
        title,
        body,
        data,
        read: false,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error storing notification:', error);
    }
  }

  /**
   * Get user's push token from Firebase
   */
  async getUserPushToken(userId: string): Promise<string | null> {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        return userSnap.data().pushToken || null;
      }
      return null;
    } catch (error) {
      console.error('Error getting user push token:', error);
      return null;
    }
  }

  /**
   * Send push notification via Expo Push API
   * Expo's push API is open - no API key required
   */
  private async sendExpoPushNotification(
    pushToken: string,
    title: string,
    body: string,
    data: NotificationData
  ): Promise<boolean> {
    try {
      const message = {
        to: pushToken,
        sound: 'default',
        title,
        body,
        data,
        priority: 'high' as const,
      };

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      const result = await response.json();

      if (result.data?.status === 'error') {
        console.error('Expo push error:', result.data.message);
        return false;
      }

      console.log('✅ Push notification sent successfully');
      return true;
    } catch (error) {
      console.error('Error sending push notification:', error);
      return false;
    }
  }

  /**
   * Send notification to specific user
   * Stores in Firestore AND sends a real push notification
   */
  async sendNotificationToUser(
    userId: string,
    title: string,
    body: string,
    data: NotificationData
  ): Promise<void> {
    try {
      // Store notification for in-app notification center
      await this.storeNotification(userId, title, body, data);

      // Send actual push notification if user has a push token
      const pushToken = await this.getUserPushToken(userId);
      if (pushToken) {
        await this.sendExpoPushNotification(pushToken, title, body, data);
      } else {
        console.log(`No push token for user ${userId} - notification stored only`);
      }
    } catch (error) {
      console.error('Error sending notification to user:', error);
    }
  }

  /**
   * Get user's notifications
   */
  async getUserNotifications(userId: string): Promise<StoredNotification[]> {
    try {
      const notificationsRef = collection(db, 'notifications');
      const q = query(
        notificationsRef,
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);

      const notifications: StoredNotification[] = [];
      querySnapshot.forEach((doc) => {
        notifications.push({
          id: doc.id,
          ...doc.data(),
        } as StoredNotification);
      });

      return notifications;
    } catch (error) {
      console.error('Error fetching notifications:', error);
      return [];
    }
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const notificationsRef = collection(db, 'notifications');
      const q = query(
        notificationsRef,
        where('userId', '==', userId),
        where('read', '==', false)
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.size;
    } catch (error) {
      console.error('Error getting unread count:', error);
      return 0;
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    try {
      const notificationRef = doc(db, 'notifications', notificationId);
      await updateDoc(notificationRef, {
        read: true,
        readAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId: string): Promise<void> {
    try {
      const notifications = await this.getUserNotifications(userId);
      const unreadNotifications = notifications.filter(n => !n.read);

      for (const notification of unreadNotifications) {
        await this.markAsRead(notification.id);
      }
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId: string): Promise<void> {
    try {
      const notificationRef = doc(db, 'notifications', notificationId);
      await updateDoc(notificationRef, {
        deleted: true,
        deletedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  }

  /**
   * Get notification icon based on type
   */
  getNotificationIcon(type: NotificationData['type']): string {
  const icons: Record<NotificationData['type'], string> = {
    rental_request: '📬',
    rental_approved: '✅',
    rental_declined: '❌',
    rental_active: '🚀',
    rental_completed: '✨',
    message_received: '💬',
    payment_received: '💳',
    payout_received: '💸',
    dispute_update: '⚠️',
    dispute_created: '⚠️',
    dispute_submitted: '📋',
    dispute_investigating: '🔍',
    dispute_resolved: '✅',
    dispute_closed: '✔️',
    dispute_admin_update: '👤',
  };
  return icons[type] || '🔔';
} 

  /**
   * Get notification color based on type
   */
  getNotificationColor(type: NotificationData['type']): string {
  const colors: Record<NotificationData['type'], string> = {
    rental_request: '#2E86AB',
    rental_approved: '#10B981',
    rental_declined: '#EF4444',
    rental_active: '#3B82F6',
    rental_completed: '#6B7280',
    message_received: '#F5C542',
    payment_received: '#10B981',
    payout_received: '#10B981',
    dispute_update: '#F76707',
    dispute_created: '#F76707',
    dispute_submitted: '#F59E0B',
    dispute_investigating: '#F76707',
    dispute_resolved: '#10B981',
    dispute_closed: '#6B7280',
    dispute_admin_update: '#8B5CF6',
  };
  return colors[type] || '#6C757D';
}

  /**
   * Setup notification listeners
   */
  setupNotificationListeners(
    onNotificationReceived?: (notification: Notifications.Notification) => void,
    onNotificationTapped?: (response: Notifications.NotificationResponse) => void
  ) {
    // Notification received while app is foregrounded
    const receivedListener = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification received:', notification);
      if (onNotificationReceived) {
        onNotificationReceived(notification);
      }
    });

    // Notification tapped
    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('Notification tapped:', response);
      if (onNotificationTapped) {
        onNotificationTapped(response);
      }
    });

    return {
      receivedListener,
      responseListener,
      remove: () => {
        receivedListener.remove();
        responseListener.remove();
      },
    };
  }

  /**
   * Clear all notifications from notification tray
   */
  async clearAllNotifications(): Promise<void> {
    await Notifications.dismissAllNotificationsAsync();
  }

  /**
   * Set badge count
   */
  async setBadgeCount(count: number): Promise<void> {
    await Notifications.setBadgeCountAsync(count);
  }
}

export default NotificationService.getInstance();
