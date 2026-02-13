// src/screens/MessagesScreen.tsx - FIXED
// FIX Issue #5: Use real-time subscription instead of one-time fetch
// so sender sees conversations they initiated and messages update in real-time
import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import MessageService, { Conversation } from '../services/MessageService';
import { AuthContext } from '../contexts/AuthContext';

const Colors = {
  primary: '#F5C542',
  secondary: '#2E86AB',
  background: '#F8F9FA',
  text: '#212529',
  white: '#FFFFFF',
  border: '#E9ECEF',
};

export default function MessagesScreen() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useContext(AuthContext);
  const navigation = useNavigation();

  useEffect(() => {
    if (!user) return;

    // FIX Issue #5: Use real-time subscription instead of one-time fetch
    // This ensures the sender sees conversations they initiated immediately,
    // and any new messages update the conversation list in real-time
    const unsubscribe = MessageService.subscribeToUserConversations(
      user.id,
      (convs) => {
        setConversations(convs);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const onRefresh = async () => {
    setRefreshing(true);
    // Force a one-time re-fetch to supplement the real-time listener
    if (user) {
      try {
        const convs = await MessageService.getUserConversations(user.id);
        setConversations(convs);
      } catch (error) {
        console.error('Error refreshing conversations:', error);
      }
    }
    setRefreshing(false);
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getOtherParticipantName = (conversation: Conversation) => {
    const otherIndex = conversation.participantIds.findIndex(id => id !== user?.id);
    return conversation.participantNames[otherIndex] || 'Unknown';
  };

  const getOtherParticipantId = (conversation: Conversation) => {
    return conversation.participantIds.find(id => id !== user?.id) || '';
  };

  const handleConversationPress = (conversation: Conversation) => {
    (navigation as any).navigate('Chat', { 
      conversationId: conversation.id,
      otherUserId: getOtherParticipantId(conversation),
      otherUserName: getOtherParticipantName(conversation),
    });
  };

  const renderConversation = ({ item }: { item: Conversation }) => (
    <TouchableOpacity 
      style={styles.conversationCard}
      onPress={() => handleConversationPress(item)}
    >
      <View style={styles.avatarContainer}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={24} color={Colors.text} />
        </View>
      </View>

      <View style={styles.conversationInfo}>
        <View style={styles.conversationHeader}>
          <Text style={styles.participantName}>
            {getOtherParticipantName(item)}
          </Text>
          <Text style={styles.timestamp}>
            {formatTime(item.lastMessageAt)}
          </Text>
        </View>

        {item.itemName && (
          <Text style={styles.itemTitle} numberOfLines={1}>
            {item.itemName}
          </Text>
        )}

        <Text 
          style={styles.lastMessage}
          numberOfLines={1}
        >
          {item.lastMessage || 'No messages yet'}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={20} color={Colors.text} />
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="chatbubbles-outline" size={64} color={Colors.text} />
      <Text style={styles.emptyTitle}>No Messages Yet</Text>
      <Text style={styles.emptySubtitle}>
        Start a conversation by requesting to rent an item
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
      </View>

      <FlatList
        data={conversations}
        renderItem={renderConversation}
        keyExtractor={(item) => item.id || ''}
        style={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={!loading ? renderEmptyState : null}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    padding: 20,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
  },
  list: {
    flex: 1,
  },
  conversationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#DC3545',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  conversationInfo: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  participantName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
  },
  timestamp: {
    fontSize: 12,
    color: Colors.text,
    opacity: 0.6,
  },
  itemTitle: {
    fontSize: 14,
    color: Colors.secondary,
    marginBottom: 4,
  },
  lastMessage: {
    fontSize: 14,
    color: Colors.text,
    opacity: 0.7,
  },
  unreadMessage: {
    fontWeight: '600',
    opacity: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: Colors.text,
    opacity: 0.7,
    textAlign: 'center',
  },
});
