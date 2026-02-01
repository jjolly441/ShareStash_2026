// src/services/MessageService.ts - WITH NOTIFICATIONS
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
  updateDoc,
  doc,
  getDoc,
  getDocs,
  limit,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import NotificationService from './NotificationService';

export interface Message {
  id?: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: Timestamp;
  read?: boolean;
}

export interface Conversation {
  id?: string;
  participantIds: string[];
  participantNames: string[];
  itemId?: string;
  itemName?: string;
  lastMessage?: string;
  lastMessageAt?: Timestamp;
  lastMessageSenderId?: string;
  createdAt: Timestamp;
}

class MessageServiceClass {
  /**
   * Create a new conversation
   */
  async createConversation(
    participantIds: string[],
    participantNames: string[],
    itemId?: string,
    itemName?: string,
    initialMessage?: string,
    senderId?: string,
    senderName?: string
  ): Promise<{ success: boolean; conversationId?: string; error?: string }> {
    try {
      // Check if conversation already exists
      const existingConv = await this.findConversation(participantIds, itemId);
      
      if (existingConv) {
        // Send initial message if provided
        if (initialMessage && senderId && senderName) {
          await this.sendMessage(existingConv.id!, senderId, senderName, initialMessage);
        }
        return { success: true, conversationId: existingConv.id };
      }

      // Create new conversation
      const conversationsRef = collection(db, 'conversations');
      const newConv = await addDoc(conversationsRef, {
        participantIds,
        participantNames,
        itemId: itemId || null,
        itemName: itemName || null,
        lastMessage: initialMessage || '',
        lastMessageAt: Timestamp.now(),
        lastMessageSenderId: senderId || null,
        createdAt: Timestamp.now(),
      });

      // Send initial message if provided
      if (initialMessage && senderId && senderName) {
        await this.sendMessage(newConv.id, senderId, senderName, initialMessage);
      }

      return { success: true, conversationId: newConv.id };
    } catch (error) {
      console.error('Error creating conversation:', error);
      return { success: false, error: 'Failed to create conversation' };
    }
  }

  /**
   * Find existing conversation
   */
  async findConversation(
    participantIds: string[],
    itemId?: string
  ): Promise<Conversation | null> {
    try {
      const conversationsRef = collection(db, 'conversations');
      const q = query(
        conversationsRef,
        where('participantIds', 'array-contains', participantIds[0])
      );

      const snapshot = await getDocs(q);
      
      for (const doc of snapshot.docs) {
        const conv = doc.data() as Conversation;
        const hasAllParticipants = participantIds.every(id => 
          conv.participantIds.includes(id)
        );
        
        if (hasAllParticipants) {
          if (itemId && conv.itemId === itemId) {
            return { id: doc.id, ...conv };
          } else if (!itemId && !conv.itemId) {
            return { id: doc.id, ...conv };
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error finding conversation:', error);
      return null;
    }
  }

  /**
   * Send a message with notification
   */
  async sendMessage(
    conversationId: string,
    senderId: string,
    senderName: string,
    text: string
  ): Promise<boolean> {
    try {
      // Add message to messages collection
      const messagesRef = collection(db, 'messages');
      await addDoc(messagesRef, {
        conversationId,
        senderId,
        senderName,
        text,
        createdAt: Timestamp.now(),
        read: false,
      });

      // Update conversation's last message
      const conversationRef = doc(db, 'conversations', conversationId);
      await updateDoc(conversationRef, {
        lastMessage: text,
        lastMessageAt: Timestamp.now(),
        lastMessageSenderId: senderId,
      });

      // Get conversation details to find recipient
      const conversationSnap = await getDoc(conversationRef);
      if (conversationSnap.exists()) {
        const conversation = conversationSnap.data() as Conversation;
        
        // Find recipient (the participant who is not the sender)
        const recipientId = conversation.participantIds.find(id => id !== senderId);
        
        if (recipientId) {
          // Send notification to recipient
          const messagePreview = text.length > 50 ? text.substring(0, 50) + '...' : text;
          
          await NotificationService.sendNotificationToUser(
            recipientId,
            '💬 New Message',
            `${senderName}: ${messagePreview}`,
            {
              type: 'message_received',
              conversationId: conversationId,
              senderId: senderId,
              senderName: senderName,
              screen: 'Chat',
            }
          );
        }
      }

      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      return false;
    }
  }

  /**
   * Subscribe to messages in a conversation
   */
  subscribeToMessages(
    conversationId: string,
    callback: (messages: Message[]) => void
  ): () => void {
    const messagesRef = collection(db, 'messages');
    const q = query(
      messagesRef,
      where('conversationId', '==', conversationId),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messages: Message[] = [];
      snapshot.forEach((doc) => {
        messages.push({ id: doc.id, ...doc.data() } as Message);
      });
      callback(messages);
    });

    return unsubscribe;
  }

  /**
   * Get messages for a conversation (one-time fetch)
   */
  async getMessages(conversationId: string): Promise<Message[]> {
    try {
      const messagesRef = collection(db, 'messages');
      const q = query(
        messagesRef,
        where('conversationId', '==', conversationId),
        orderBy('createdAt', 'asc')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
    } catch (error) {
      console.error('Error getting messages:', error);
      return [];
    }
  }

  /**
   * Get user's conversations
   */
  async getUserConversations(userId: string): Promise<Conversation[]> {
    try {
      const conversationsRef = collection(db, 'conversations');
      const q = query(
        conversationsRef,
        where('participantIds', 'array-contains', userId),
        orderBy('lastMessageAt', 'desc')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Conversation));
    } catch (error) {
      console.error('Error getting conversations:', error);
      return [];
    }
  }

  /**
   * Alias for getUserConversations (for backwards compatibility)
   */
  async getConversations(userId: string): Promise<Conversation[]> {
    return this.getUserConversations(userId);
  }

  /**
   * Subscribe to user's conversations
   */
  subscribeToUserConversations(
    userId: string,
    callback: (conversations: Conversation[]) => void
  ): () => void {
    const conversationsRef = collection(db, 'conversations');
    const q = query(
      conversationsRef,
      where('participantIds', 'array-contains', userId),
      orderBy('lastMessageAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const conversations: Conversation[] = [];
      snapshot.forEach((doc) => {
        conversations.push({ id: doc.id, ...doc.data() } as Conversation);
      });
      callback(conversations);
    });

    return unsubscribe;
  }

  /**
   * Mark messages as read
   */
  async markMessagesAsRead(conversationId: string, userId: string): Promise<void> {
    try {
      const messagesRef = collection(db, 'messages');
      const q = query(
        messagesRef,
        where('conversationId', '==', conversationId),
        where('senderId', '!=', userId),
        where('read', '==', false)
      );

      const snapshot = await getDocs(q);
      
      const updatePromises = snapshot.docs.map(doc => 
        updateDoc(doc.ref, { read: true })
      );

      await Promise.all(updatePromises);
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  }

  /**
   * Get unread message count for user
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      // Get all user's conversations
      const conversations = await this.getUserConversations(userId);
      let totalUnread = 0;

      // For each conversation, count unread messages
      for (const conv of conversations) {
        if (conv.id) {
          const messagesRef = collection(db, 'messages');
          const q = query(
            messagesRef,
            where('conversationId', '==', conv.id),
            where('senderId', '!=', userId),
            where('read', '==', false)
          );

          const snapshot = await getDocs(q);
          totalUnread += snapshot.size;
        }
      }

      return totalUnread;
    } catch (error) {
      console.error('Error getting unread count:', error);
      return 0;
    }
  }
}

const MessageService = new MessageServiceClass();
export default MessageService;