// src/screens/SupportChatScreen.tsx — Claude-powered AI Support Chat
import React, { useState, useRef, useContext, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation';
import { AuthContext } from '../contexts/AuthContext';
import ChatService, { ChatMessage } from '../services/ChatService';

const Colors = {
  primary: '#F5C542',
  secondary: '#2E86AB',
  success: '#46A758',
  background: '#F8F9FA',
  text: '#212529',
  white: '#FFFFFF',
  border: '#E9ECEF',
  muted: '#6C757D',
  danger: '#DC3545',
  userBubble: '#2E86AB',
  assistantBubble: '#FFFFFF',
};

type Props = {
  navigation: StackNavigationProp<RootStackParamList, 'SupportChat'>;
};

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const SUGGESTED_QUESTIONS = [
  'How do I list an item?',
  'How do payouts work?',
  'How do I report an issue?',
  'What is the 48-hour window?',
  'How do I cancel a rental?',
];

export default function SupportChatScreen({ navigation }: Props) {
  const { user } = useContext(AuthContext);
  const scrollViewRef = useRef<ScrollView>(null);
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages, isTyping]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isTyping) return;

    const userMessage: DisplayMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsTyping(true);
    setError(null);

    try {
      // Build conversation history for API
      const apiMessages: ChatMessage[] = [
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: text.trim() },
      ];

      const response = await ChatService.sendMessage(apiMessages);

      const assistantMessage: DisplayMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: any) {
      console.error('Chat error:', err);
      setError('Failed to get a response. Please try again.');

      const errorMessage: DisplayMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I'm having trouble connecting right now. Please try again in a moment, or contact us at support@sharestash.app for help.",
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSuggestion = (question: string) => {
    sendMessage(question);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.avatarContainer}>
            <Ionicons name="chatbubbles" size={20} color={Colors.white} />
          </View>
          <View>
            <Text style={styles.headerTitle}>ShareStash Support</Text>
            <Text style={styles.headerSubtitle}>AI-powered assistant</Text>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Welcome message */}
          {messages.length === 0 && (
            <View style={styles.welcomeContainer}>
              <View style={styles.welcomeAvatar}>
                <Ionicons name="chatbubbles" size={32} color={Colors.secondary} />
              </View>
              <Text style={styles.welcomeTitle}>Hi{user?.firstName ? `, ${user.firstName}` : ''}!</Text>
              <Text style={styles.welcomeText}>
                I'm your ShareStash AI assistant. I can help you with questions about renting, listing items, payments, disputes, and more.
              </Text>

              {/* Suggested questions */}
              <Text style={styles.suggestedLabel}>Try asking:</Text>
              <View style={styles.suggestedContainer}>
                {SUGGESTED_QUESTIONS.map((q, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.suggestedChip}
                    onPress={() => handleSuggestion(q)}
                  >
                    <Text style={styles.suggestedChipText}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Chat messages */}
          {messages.map((msg) => (
            <View
              key={msg.id}
              style={[
                styles.messageBubbleRow,
                msg.role === 'user' ? styles.userRow : styles.assistantRow,
              ]}
            >
              {msg.role === 'assistant' && (
                <View style={styles.assistantAvatarSmall}>
                  <Ionicons name="chatbubbles" size={14} color={Colors.white} />
                </View>
              )}
              <View
                style={[
                  styles.messageBubble,
                  msg.role === 'user' ? styles.userBubble : styles.assistantBubbleStyle,
                ]}
              >
                <Text
                  style={[
                    styles.messageText,
                    msg.role === 'user' ? styles.userText : styles.assistantText,
                  ]}
                >
                  {msg.content}
                </Text>
                <Text
                  style={[
                    styles.messageTime,
                    msg.role === 'user' ? styles.userTime : styles.assistantTime,
                  ]}
                >
                  {formatTime(msg.timestamp)}
                </Text>
              </View>
            </View>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <View style={[styles.messageBubbleRow, styles.assistantRow]}>
              <View style={styles.assistantAvatarSmall}>
                <Ionicons name="chatbubbles" size={14} color={Colors.white} />
              </View>
              <View style={[styles.messageBubble, styles.assistantBubbleStyle, styles.typingBubble]}>
                <View style={styles.typingDots}>
                  <View style={[styles.dot, styles.dot1]} />
                  <View style={[styles.dot, styles.dot2]} />
                  <View style={[styles.dot, styles.dot3]} />
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Input area */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            placeholder="Ask a question..."
            placeholderTextColor={Colors.muted}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={() => sendMessage(inputText)}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || isTyping) && styles.sendButtonDisabled]}
            onPress={() => sendMessage(inputText)}
            disabled={!inputText.trim() || isTyping}
          >
            <Ionicons name="send" size={20} color={Colors.white} />
          </TouchableOpacity>
        </View>

        {/* Disclaimer */}
        <View style={styles.disclaimerBar}>
          <Text style={styles.disclaimerText}>
            AI assistant — responses may not always be accurate
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarContainer: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.secondary,
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.text },
  headerSubtitle: { fontSize: 12, color: Colors.muted },
  // Messages
  messageList: { flex: 1 },
  messageListContent: { padding: 16, paddingBottom: 8 },
  // Welcome
  welcomeContainer: { alignItems: 'center', paddingVertical: 30, paddingHorizontal: 20 },
  welcomeAvatar: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.secondary + '15',
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  welcomeTitle: { fontSize: 22, fontWeight: 'bold', color: Colors.text, marginBottom: 8 },
  welcomeText: {
    fontSize: 15, color: Colors.muted, textAlign: 'center', lineHeight: 22, marginBottom: 24,
  },
  suggestedLabel: { fontSize: 13, color: Colors.muted, fontWeight: '600', marginBottom: 10 },
  suggestedContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  suggestedChip: {
    backgroundColor: Colors.white, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.secondary,
  },
  suggestedChipText: { fontSize: 13, color: Colors.secondary, fontWeight: '500' },
  // Message bubbles
  messageBubbleRow: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end' },
  userRow: { justifyContent: 'flex-end' },
  assistantRow: { justifyContent: 'flex-start' },
  assistantAvatarSmall: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.secondary,
    justifyContent: 'center', alignItems: 'center', marginRight: 8,
  },
  messageBubble: {
    maxWidth: '75%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: Colors.userBubble, borderBottomRightRadius: 4,
  },
  assistantBubbleStyle: {
    backgroundColor: Colors.assistantBubble, borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  messageText: { fontSize: 15, lineHeight: 22 },
  userText: { color: Colors.white },
  assistantText: { color: Colors.text },
  messageTime: { fontSize: 11, marginTop: 4 },
  userTime: { color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
  assistantTime: { color: Colors.muted },
  // Typing indicator
  typingBubble: { paddingVertical: 14, paddingHorizontal: 18 },
  typingDots: { flexDirection: 'row', gap: 4 },
  dot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.muted, opacity: 0.5,
  },
  dot1: { opacity: 0.4 },
  dot2: { opacity: 0.6 },
  dot3: { opacity: 0.8 },
  // Input
  inputContainer: {
    flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border, gap: 8,
  },
  textInput: {
    flex: 1, backgroundColor: Colors.background, borderRadius: 20, paddingHorizontal: 16,
    paddingVertical: 10, fontSize: 15, color: Colors.text, maxHeight: 100,
    borderWidth: 1, borderColor: Colors.border,
  },
  sendButton: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.secondary,
    justifyContent: 'center', alignItems: 'center',
  },
  sendButtonDisabled: { backgroundColor: Colors.muted, opacity: 0.5 },
  // Disclaimer
  disclaimerBar: {
    backgroundColor: Colors.white, paddingVertical: 6, paddingHorizontal: 16,
    borderTopWidth: 1, borderTopColor: Colors.border, alignItems: 'center',
  },
  disclaimerText: { fontSize: 11, color: Colors.muted },
});