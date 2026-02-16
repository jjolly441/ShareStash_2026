// src/screens/TermsOfServiceScreen.tsx — ShareStash Terms of Service
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation';

const Colors = {
  primary: '#F5C542',
  secondary: '#2E86AB',
  background: '#F8F9FA',
  text: '#212529',
  white: '#FFFFFF',
  border: '#E9ECEF',
  muted: '#6C757D',
};

type Props = {
  navigation: StackNavigationProp<RootStackParamList, 'TermsOfService'>;
};

const LAST_UPDATED = 'February 15, 2026';

export default function TermsOfServiceScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated}>Last Updated: {LAST_UPDATED}</Text>

        <Text style={styles.intro}>
          Welcome to ShareStash. These Terms of Service ("Terms") govern your use of the ShareStash mobile application and related services (the "Service"). By creating an account or using the Service, you agree to be bound by these Terms.
        </Text>

        <Section title="1. The Service">
          <Text style={styles.body}>
            ShareStash is a peer-to-peer rental marketplace that connects item owners ("Owners") with individuals seeking to rent items ("Renters"). ShareStash provides the platform and facilitates transactions but does not own, manage, or control any items listed on the Service. ShareStash is not a party to the rental agreements between Owners and Renters.
          </Text>
        </Section>

        <Section title="2. Eligibility and Accounts">
          <Text style={styles.body}>
            You must be at least 18 years of age to use the Service. By creating an account, you represent that you are at least 18 years old and that all information you provide is accurate and complete. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use of your account.
          </Text>
        </Section>

        <Section title="3. Identity Verification">
          <Text style={styles.body}>
            ShareStash may require identity verification for certain transactions (e.g., rentals over $500). Identity verification is processed through Stripe Identity, a third-party service. By using the Service, you consent to this verification process when required. ShareStash does not store your identity documents; they are processed and retained by Stripe in accordance with their privacy policy.
          </Text>
        </Section>

        <Section title="4. Listings and Rentals">
          <Text style={styles.body}>
            Owners are responsible for providing accurate descriptions, photos, pricing, and availability for their listings. Items must be legal to own and rent in your jurisdiction. Owners retain all liability for the condition and safety of their items. Renters agree to use rented items responsibly and return them in the same condition they were received, subject to normal wear and tear.
          </Text>
        </Section>

        <Section title="5. Rental Process">
          <Text style={styles.body}>
            The rental process follows these steps: the Renter submits a rental request, the Owner approves or declines the request, if approved the Renter completes payment, the rental becomes active and both parties coordinate the handoff, at the end of the rental period the Owner initiates completion, the Renter confirms the return, and after a 48-hour dispute window the payout is processed to the Owner.
          </Text>
        </Section>

        <Section title="6. Payments, Fees, and Payouts">
          <Text style={styles.body}>
            All payments are processed through Stripe. ShareStash charges a platform service fee of 10% on each transaction, which is deducted from the Owner's payout. Renters are charged the full rental amount at the time of booking. Owners receive their payout (90% of the rental price) after the rental is completed and the 48-hour dispute window has passed. Payouts are sent to the Owner's connected bank account via Stripe Connect.
          </Text>
        </Section>

        <Section title="7. Cancellations and Refunds">
          <Text style={styles.body}>
            Renters may cancel a rental more than 24 hours before the start date for a full refund. Cancellations made less than 24 hours before the start date are not eligible for a refund. Owners may cancel at any time, but frequent cancellations may result in account restrictions. ShareStash reserves the right to issue refunds at its discretion in cases of disputes, fraud, or extenuating circumstances.
          </Text>
        </Section>

        <Section title="8. Disputes and Damage">
          <Text style={styles.body}>
            Either party may report an issue or file a dispute through the app. Disputes filed during the 48-hour payout window will freeze the Owner's payout pending resolution. Both parties are encouraged to document item condition using the app's photo handoff feature at pick-up and return. ShareStash will review disputes and may mediate, but is not obligated to resolve disputes between users. ShareStash's decision on disputes is final.
          </Text>
        </Section>

        <Section title="9. Prohibited Conduct">
          <Text style={styles.body}>
            You agree not to: list or rent illegal items or substances, use the Service for any unlawful purpose, harass, threaten, or abuse other users, create fraudulent listings or rental requests, manipulate reviews or ratings, circumvent the platform's payment system, attempt to complete transactions outside the platform, create multiple accounts to evade bans or restrictions, or use the Service in any way that could damage or impair the Service.
          </Text>
        </Section>

        <Section title="10. Intellectual Property">
          <Text style={styles.body}>
            The ShareStash name, logo, and all related marks are the property of ShareStash. Content you post on the Service (listings, reviews, photos) remains your property, but you grant ShareStash a non-exclusive, worldwide, royalty-free license to use, display, and distribute that content in connection with the Service.
          </Text>
        </Section>

        <Section title="11. Limitation of Liability">
          <Text style={styles.body}>
            ShareStash provides the platform "as is" and makes no warranties regarding the quality, safety, or legality of items listed, the accuracy of listings or user content, the ability of Owners or Renters to complete transactions, or the identity or background of any user. To the maximum extent permitted by law, ShareStash shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service, including but not limited to property damage, personal injury, or financial loss resulting from rental transactions.
          </Text>
        </Section>

        <Section title="12. Indemnification">
          <Text style={styles.body}>
            You agree to indemnify and hold harmless ShareStash, its officers, directors, employees, and agents from any claims, damages, losses, or expenses (including legal fees) arising from your use of the Service, your violation of these Terms, or your violation of any rights of a third party.
          </Text>
        </Section>

        <Section title="13. Account Termination">
          <Text style={styles.body}>
            ShareStash reserves the right to suspend or terminate your account at any time, with or without notice, for conduct that we determine violates these Terms or is harmful to other users, ShareStash, or third parties. You may delete your account at any time by contacting us.
          </Text>
        </Section>

        <Section title="14. Changes to These Terms">
          <Text style={styles.body}>
            We may modify these Terms at any time. We will notify you of material changes through the app or via email. Your continued use of the Service after changes are posted constitutes acceptance of the revised Terms. If you do not agree to the revised Terms, you must stop using the Service.
          </Text>
        </Section>

        <Section title="15. Governing Law">
          <Text style={styles.body}>
            These Terms shall be governed by and construed in accordance with the laws of the State of Maryland, United States, without regard to its conflict of law provisions.
          </Text>
        </Section>

        <Section title="16. Contact Us">
          <Text style={styles.body}>
            If you have questions about these Terms, please contact us at:
          </Text>
          <Text style={styles.contactText}>support@sharestash.app</Text>
        </Section>

        <View style={styles.disclaimer}>
          <Ionicons name="information-circle" size={18} color={Colors.warning} />
          <Text style={styles.disclaimerText}>
            For legal-related matters, please consult with our legal representatives at Kramer, Kohlberg & Partners in Columbia, MD.
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: Colors.text },
  content: { flex: 1, padding: 20 },
  lastUpdated: { fontSize: 13, color: Colors.muted, marginBottom: 16 },
  intro: { fontSize: 15, color: Colors.text, lineHeight: 24, marginBottom: 20 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: Colors.text, marginBottom: 10 },
  body: { fontSize: 15, color: Colors.text, lineHeight: 24, marginBottom: 10 },
  contactText: { fontSize: 15, color: Colors.secondary, fontWeight: '600', marginTop: 4 },
  disclaimer: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFF3CD',
    borderRadius: 10, padding: 14, marginTop: 16, gap: 10,
  },
  disclaimerText: { flex: 1, fontSize: 13, color: '#856404', lineHeight: 20 },
  warning: '#FF9800',
});