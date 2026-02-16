// src/services/ChatService.ts — AI Support Chat via Cloud Function
import { getAuth } from 'firebase/auth';
import { FUNCTIONS_BASE_URL } from '../config/constants';


export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

async function getAuthToken(): Promise<string> {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated');
  }
  return user.getIdToken();
}

class ChatService {
  private static instance: ChatService;

  static getInstance(): ChatService {
    if (!ChatService.instance) {
      ChatService.instance = new ChatService();
    }
    return ChatService.instance;
  }

  /**
   * Send a message to the AI support chatbot
   * Sends full conversation history for context
   */
  async sendMessage(messages: ChatMessage[]): Promise<string> {
    try {
      const token = await getAuthToken();

      const response = await fetch(`${FUNCTIONS_BASE_URL}/chatWithSupport`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ messages }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to get response');
      }

      return result.message;
    } catch (error: any) {
      console.error('ChatService error:', error);
      throw error;
    }
  }
}

export default ChatService.getInstance();