// src/screens/HelpCenterScreen.tsx — Searchable Help Center with expandable FAQ
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation';

const Colors = {
  primary: '#F5C542',
  secondary: '#2E86AB',
  success: '#46A758',
  background: '#F8F9FA',
  text: '#212529',
  white: '#FFFFFF',
  border: '#E9ECEF',
  muted: '#6C757D',
};

type Props = {
  navigation: StackNavigationProp<RootStackParamList, 'HelpCenter'>;
};

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQCategory {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  items: FAQItem[];
}

const FAQ_DATA: FAQCategory[] = [
  {
    title: 'Getting Started',
    icon: 'rocket-outline',
    color: '#3B82F6',
    items: [
      {
        question: 'What is ShareStash?',
        answer: 'ShareStash is a peer-to-peer rental marketplace where you can rent items from people nearby or list your own items for others to rent. Think of it as a neighborhood sharing economy — rent tools, cameras, sports equipment, and more from real people.',
      },
      {
        question: 'How do I create an account?',
        answer: 'Tap "Register" on the login screen and enter your name, email, and password. You\'ll be able to start browsing items right away. To rent or list items, you\'ll need to set up a payment method.',
      },
      {
        question: 'Is ShareStash free to use?',
        answer: 'Creating an account and browsing items is completely free. ShareStash charges a 10% service fee on each rental transaction, which is deducted from the owner\'s payout. Renters pay the listed price with no additional fees.',
      },
      {
        question: 'What can I rent or list on ShareStash?',
        answer: 'You can list almost any physical item — tools, electronics, sports gear, camping equipment, party supplies, musical instruments, and more. Items must be legal to own and rent in your area. Prohibited items include weapons, illegal substances, and hazardous materials.',
      },
    ],
  },
  {
    title: 'Renting Items',
    icon: 'cart-outline',
    color: '#10B981',
    items: [
      {
        question: 'How do I rent an item?',
        answer: 'Browse or search for items on the Home screen. Tap an item to see details, then tap "Book This Item." Select your rental dates, add an optional message to the owner, and submit your request. The owner will approve or decline your request.',
      },
      {
        question: 'When do I pay?',
        answer: 'You\'re not charged until the owner approves your request. Once approved, you\'ll see a "Pay Now" button on your rental card. Payment is processed through Stripe using your saved payment method.',
      },
      {
        question: 'Can I cancel a rental?',
        answer: 'Yes, you can cancel a rental for a full refund if you cancel more than 24 hours before the rental start date. Cancellations made less than 24 hours before the start date are not eligible for a refund.',
      },
      {
        question: 'How does the pick-up and return work?',
        answer: 'After payment, either party can propose a meeting location through the app. Both the owner and renter take photos of the item\'s condition at pick-up and return using the Handoff feature. These photos serve as evidence in case of any disputes.',
      },
      {
        question: 'What if the item is damaged or not as described?',
        answer: 'You can file a dispute through the "Report Issue" button on your rental card. If you report an issue during the 48-hour payout window after the rental ends, the owner\'s payout will be frozen until the dispute is resolved.',
      },
    ],
  },
  {
    title: 'Lending Your Items',
    icon: 'pricetag-outline',
    color: '#F59E0B',
    items: [
      {
        question: 'How do I list an item?',
        answer: 'Tap the "+" tab at the bottom of the screen. Add photos, a title, description, category, daily rental price, and your location. Once submitted, your item will be visible to other users in your area.',
      },
      {
        question: 'How do I set my price?',
        answer: 'You set a daily rental price when creating your listing. Consider the item\'s value, local market rates, and wear and tear when setting your price. You can edit your price at any time from the My Items screen.',
      },
      {
        question: 'How do I get paid?',
        answer: 'You\'ll need to set up a Stripe Connect account from your Profile screen under "Stripe Connect Setup." Once connected, payouts are automatically sent to your bank account after each completed rental (minus the 10% platform fee). Payouts are processed after the rental is confirmed complete and the 48-hour dispute window passes.',
      },
      {
        question: 'What happens when I receive a rental request?',
        answer: 'You\'ll receive a push notification. Go to the "My Items" tab on the Rentals screen to see the request. You can view the renter\'s profile, their message, and the requested dates. Tap "Approve" or "Decline" to respond.',
      },
      {
        question: 'How do I complete a rental?',
        answer: 'When the rental period ends, tap "Mark Rental Complete" on the rental card. The renter will be notified to confirm the return. Once both parties confirm, your payout will be processed after a 48-hour dispute window.',
      },
    ],
  },
  {
    title: 'Payments & Payouts',
    icon: 'card-outline',
    color: '#8B5CF6',
    items: [
      {
        question: 'How do I add a payment method?',
        answer: 'Go to Profile → Payment Methods and tap "Add a Card." Enter your card details securely through Stripe. Your card information is never stored on our servers.',
      },
      {
        question: 'How do I set up payouts?',
        answer: 'Go to Profile → Stripe Connect Setup and follow the onboarding process. You\'ll need to provide your bank account details and verify your identity. Once set up, payouts will be sent automatically after completed rentals.',
      },
      {
        question: 'When will I receive my payout?',
        answer: 'Payouts are processed after the rental is confirmed complete by both parties and the 48-hour dispute window has passed. Funds are then transferred to your connected bank account, which typically takes 2-3 business days to arrive.',
      },
      {
        question: 'What is the 48-hour dispute window?',
        answer: 'After both the owner and renter confirm a rental is complete, there\'s a 48-hour window where either party can file a dispute. If a dispute is filed during this window, the payout is frozen until the dispute is resolved. This protects both parties.',
      },
      {
        question: 'What fees does ShareStash charge?',
        answer: 'ShareStash charges a 10% platform fee on each transaction, which is deducted from the owner\'s payout. For example, on a $100 rental, the owner receives $90 and ShareStash retains $10. There are no additional fees for renters.',
      },
    ],
  },
  {
    title: 'Safety & Trust',
    icon: 'shield-checkmark-outline',
    color: '#EF4444',
    items: [
      {
        question: 'How does identity verification work?',
        answer: 'For rentals over $500, ShareStash requires identity verification through Stripe Identity. You\'ll be asked to take a photo of your government-issued ID and a selfie. This is processed securely by Stripe — ShareStash never sees or stores your ID documents.',
      },
      {
        question: 'How are payments protected?',
        answer: 'All payments are processed through Stripe, a PCI-compliant payment processor. Funds are held on the platform until the rental is confirmed complete, protecting renters from fraudulent listings. The 48-hour dispute window adds an extra layer of protection.',
      },
      {
        question: 'What should I do if I feel unsafe?',
        answer: 'If you feel unsafe at any point, remove yourself from the situation and contact local authorities if necessary. You can report the user through the app using the "Report Issue" feature. Meet in public, well-lit locations for item handoffs.',
      },
      {
        question: 'Tips for a safe transaction',
        answer: 'Always communicate through the app\'s messaging system. Meet in a public place for handoffs. Use the photo handoff feature to document item condition. Check the other user\'s profile, reviews, and ratings before transacting. Never share personal financial information outside the platform.',
      },
    ],
  },
  {
    title: 'Troubleshooting',
    icon: 'build-outline',
    color: '#6B7280',
    items: [
      {
        question: 'My payment failed. What should I do?',
        answer: 'Check that your card details are correct and that you have sufficient funds. Try removing and re-adding your payment method. If the issue persists, try a different card or contact your bank to ensure they\'re not blocking the transaction.',
      },
      {
        question: 'I\'m not receiving push notifications.',
        answer: 'Make sure notifications are enabled for ShareStash in your device settings. On iOS, go to Settings → Notifications → ShareStash. On Android, go to Settings → Apps → ShareStash → Notifications. Also ensure you have a stable internet connection.',
      },
      {
        question: 'The owner/renter isn\'t responding.',
        answer: 'Users are notified of new messages and rental requests via push notifications. If they haven\'t responded within 24-48 hours, the request may not be a good fit. You can cancel a pending request and try another listing.',
      },
      {
        question: 'How do I report a bug or provide feedback?',
        answer: 'We\'d love to hear from you! Contact us at support@sharestash.app with a description of the issue, your device type, and any screenshots. Your feedback helps us improve the app.',
      },
    ],
  },
];

export default function HelpCenterScreen({ navigation }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleItem = (key: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Filter FAQ items based on search
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return FAQ_DATA;

    const query = searchQuery.toLowerCase();
    return FAQ_DATA.map(category => ({
      ...category,
      items: category.items.filter(
        item =>
          item.question.toLowerCase().includes(query) ||
          item.answer.toLowerCase().includes(query)
      ),
    })).filter(category => category.items.length > 0);
  }, [searchQuery]);

  const totalResults = filteredData.reduce((sum, cat) => sum + cat.items.length, 0);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help Center</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={Colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for help..."
            placeholderTextColor={Colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={Colors.muted} />
            </TouchableOpacity>
          )}
        </View>
        {searchQuery.length > 0 && (
          <Text style={styles.searchResults}>
            {totalResults} result{totalResults !== 1 ? 's' : ''} found
          </Text>
        )}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {filteredData.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={48} color={Colors.muted} />
            <Text style={styles.emptyTitle}>No results found</Text>
            <Text style={styles.emptySubtitle}>
              Try different keywords or contact us at support@sharestash.app
            </Text>
          </View>
        ) : (
          filteredData.map((category, catIndex) => (
            <View key={catIndex} style={styles.categorySection}>
              {/* Category header */}
              <View style={styles.categoryHeader}>
                <View style={[styles.categoryIcon, { backgroundColor: category.color + '15' }]}>
                  <Ionicons name={category.icon} size={22} color={category.color} />
                </View>
                <Text style={styles.categoryTitle}>{category.title}</Text>
              </View>

              {/* FAQ items */}
              {category.items.map((item, itemIndex) => {
                const key = `${catIndex}-${itemIndex}`;
                const isExpanded = expandedItems.has(key);

                return (
                  <TouchableOpacity
                    key={key}
                    style={styles.faqItem}
                    onPress={() => toggleItem(key)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.faqQuestion}>
                      <Text style={styles.faqQuestionText}>{item.question}</Text>
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color={Colors.muted}
                      />
                    </View>
                    {isExpanded && (
                      <Text style={styles.faqAnswer}>{item.answer}</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))
        )}

        {/* Contact section */}
        <View style={styles.contactSection}>
          <Text style={styles.contactTitle}>Still need help?</Text>
          <Text style={styles.contactSubtitle}>
            Chat with our AI assistant or reach out to our support team.
          </Text>
          <TouchableOpacity
            style={[styles.contactButton, { marginBottom: 10 }]}
            onPress={() => navigation.navigate('SupportChat')}
          >
            <Ionicons name="chatbubbles-outline" size={20} color={Colors.white} />
            <Text style={styles.contactButtonText}>Chat with AI Support</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.contactButton, { backgroundColor: Colors.muted }]}>
            <Ionicons name="mail-outline" size={20} color={Colors.white} />
            <Text style={styles.contactButtonText}>support@sharestash.app</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: Colors.text },
  // Search
  searchContainer: {
    backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.background,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: Colors.text },
  searchResults: { fontSize: 13, color: Colors.muted, marginTop: 8 },
  // Content
  content: { flex: 1, padding: 16 },
  // Category
  categorySection: { marginBottom: 20 },
  categoryHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10,
  },
  categoryIcon: {
    width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center',
  },
  categoryTitle: { fontSize: 17, fontWeight: 'bold', color: Colors.text },
  // FAQ items
  faqItem: {
    backgroundColor: Colors.white, borderRadius: 10, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: Colors.border,
  },
  faqQuestion: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
  },
  faqQuestionText: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.text },
  faqAnswer: {
    fontSize: 14, color: Colors.text, lineHeight: 22, marginTop: 12,
    paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.text, marginTop: 16 },
  emptySubtitle: {
    fontSize: 14, color: Colors.muted, textAlign: 'center', marginTop: 8, paddingHorizontal: 40,
  },
  // Contact
  contactSection: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 20,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  contactTitle: { fontSize: 17, fontWeight: 'bold', color: Colors.text, marginBottom: 6 },
  contactSubtitle: {
    fontSize: 14, color: Colors.muted, textAlign: 'center', marginBottom: 16,
  },
  contactButton: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.secondary,
    borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20, gap: 8,
  },
  contactButtonText: { color: Colors.white, fontSize: 15, fontWeight: '600' },
});