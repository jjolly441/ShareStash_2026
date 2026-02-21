// src/components/web/AppOnlyScreen.tsx
// Shows a "Download the app" prompt on web for screens that require native features
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

interface AppOnlyScreenProps {
  title: string;
  description?: string;
  icon?: string;
  navigation?: any;
  children?: React.ReactNode;
}

export default function AppOnlyScreen({ title, description, icon, navigation, children }: AppOnlyScreenProps) {
  // On native, render the actual children
  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  // On web, show download prompt
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {navigation && (
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#212529" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={{ width: 24 }} />
        </View>
      )}
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name={(icon as any) || 'phone-portrait-outline'} size={48} color="#2E86AB" />
        </View>
        <Text style={styles.title}>Available in the App</Text>
        <Text style={styles.description}>
          {description || `${title} is available in the ShareStash mobile app. Download it for the full experience.`}
        </Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: '#000' }]}
            onPress={() => Linking.openURL('https://apps.apple.com')}
          >
            <Ionicons name="logo-apple" size={20} color="#fff" />
            <Text style={styles.buttonText}>App Store</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: '#34A853' }]}
            onPress={() => Linking.openURL('https://play.google.com')}
          >
            <Ionicons name="logo-google-playstore" size={20} color="#fff" />
            <Text style={styles.buttonText}>Google Play</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#212529' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: { fontSize: 24, fontWeight: '800', color: '#212529', marginBottom: 12 },
  description: { fontSize: 15, color: '#6C757D', textAlign: 'center', maxWidth: 400, lineHeight: 22, marginBottom: 32 },
  buttonRow: { flexDirection: 'row', gap: 12 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
