// src/screens/PrivacyPolicyScreen.tsx — ShareStash Privacy Policy
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
  navigation: StackNavigationProp<RootStackParamList, 'PrivacyPolicy'>;
};

const LAST_UPDATED = 'February 15, 2026';

export default function PrivacyPolicyScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated}>Last Updated: {LAST_UPDATED}</Text>

        <Text style={styles.intro}>
          ShareStash ("we," "us," or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and related services (collectively, the "Service").
        </Text>

        <Section title="1. Information We Collect">
          <Text style={styles.body}>
            We collect information you provide directly, information collected automatically, and information from third parties.
          </Text>
          <SubSection title="Information You Provide">
            <Text style={styles.body}>
              Account information (name, email address, phone number, profile photo), identity verification documents (government-issued ID, selfie) processed through Stripe Identity, payment and banking information processed through Stripe Connect, rental listings including item descriptions, photos, pricing, and location, messages exchanged with other users, reviews and ratings, dispute reports and supporting documentation, and any other information you choose to provide.
            </Text>
          </SubSection>
          <SubSection title="Information Collected Automatically">
            <Text style={styles.body}>
              Device information (device type, operating system, unique identifiers), usage data (features used, actions taken, time and duration of use), location data (with your permission, for item listings and meeting point features), push notification tokens, and log data and analytics.
            </Text>
          </SubSection>
          <SubSection title="Information from Third Parties">
            <Text style={styles.body}>
              Identity verification results from Stripe Identity, payment processing data from Stripe, and authentication data from Firebase Authentication.
            </Text>
          </SubSection>
        </Section>

        <Section title="2. How We Use Your Information">
          <Text style={styles.body}>
            We use your information to provide, maintain, and improve the Service, process transactions and send related information (confirmations, receipts, invoices), facilitate communication between renters and item owners, verify your identity and prevent fraud, send push notifications about rental updates, messages, and account activity, respond to your comments, questions, and support requests, monitor and analyze usage trends and preferences, comply with legal obligations, and enforce our Terms of Service.
          </Text>
        </Section>

        <Section title="3. How We Share Your Information">
          <Text style={styles.body}>
            We may share your information in the following situations:
          </Text>
          <Text style={styles.body}>
            With other users: Your public profile, ratings, reviews, and listing information are visible to other users. When you enter a rental transaction, your name and agreed meeting location are shared with the other party.
          </Text>
          <Text style={styles.body}>
            With service providers: We use third-party services including Stripe for payment processing and identity verification, Firebase (Google) for authentication, database, storage, and cloud functions, and Expo for push notification delivery.
          </Text>
          <Text style={styles.body}>
            For legal reasons: We may disclose information if required by law, regulation, legal process, or governmental request, or to protect the rights, property, or safety of ShareStash, our users, or the public.
          </Text>
          <Text style={styles.body}>
            We do not sell your personal information to third parties.
          </Text>
        </Section>

        <Section title="4. Data Security">
          <Text style={styles.body}>
            We implement appropriate technical and organizational security measures to protect your information. Payment and banking data is processed and stored by Stripe and is never stored on our servers. Identity verification documents are processed by Stripe Identity and are not retained by ShareStash. However, no method of electronic transmission or storage is 100% secure, and we cannot guarantee absolute security.
          </Text>
        </Section>

        <Section title="5. Data Retention">
          <Text style={styles.body}>
            We retain your personal information for as long as your account is active or as needed to provide you with the Service. We may retain certain information after account deletion for legitimate business purposes such as resolving disputes, enforcing agreements, and complying with legal obligations.
          </Text>
        </Section>

        <Section title="6. Your Rights and Choices">
          <Text style={styles.body}>
            You may access and update your profile information through the app's Edit Profile screen. You may request deletion of your account by contacting us. You can opt out of push notifications through your device settings. You can control location permissions through your device settings. Depending on your jurisdiction, you may have additional rights under applicable data protection laws (such as CCPA or GDPR), including the right to access, correct, delete, or port your data, and the right to opt out of certain data processing activities.
          </Text>
        </Section>

        <Section title="7. Children's Privacy">
          <Text style={styles.body}>
            The Service is not intended for use by anyone under the age of 18. We do not knowingly collect personal information from children under 18. If we learn that we have collected personal information from a child under 18, we will take steps to delete that information.
          </Text>
        </Section>

        <Section title="8. Changes to This Policy">
          <Text style={styles.body}>
            We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy within the app and updating the "Last Updated" date. Your continued use of the Service after changes are posted constitutes your acceptance of the revised policy.
          </Text>
        </Section>

        <Section title="9. Contact Us">
          <Text style={styles.body}>
            If you have questions about this Privacy Policy or our data practices, please contact us at:
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

// ─── Helper Components ────────────────────────────────────────────
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

const SubSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={styles.subSection}>
    <Text style={styles.subSectionTitle}>{title}</Text>
    {children}
  </View>
);

// ─── Styles ───────────────────────────────────────────────────────
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
  subSection: { marginTop: 8, marginLeft: 8 },
  subSectionTitle: { fontSize: 15, fontWeight: '600', color: Colors.secondary, marginBottom: 6 },
  body: { fontSize: 15, color: Colors.text, lineHeight: 24, marginBottom: 10 },
  contactText: { fontSize: 15, color: Colors.secondary, fontWeight: '600', marginTop: 4 },
  disclaimer: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFF3CD',
    borderRadius: 10, padding: 14, marginTop: 16, gap: 10,
  },
  disclaimerText: { flex: 1, fontSize: 13, color: '#856404', lineHeight: 20 },
  warning: '#FF9800',
});