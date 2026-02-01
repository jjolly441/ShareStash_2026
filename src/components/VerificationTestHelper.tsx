/**
 * VerificationTestHelper - Development/Testing Component
 * 
 * Add this temporarily to your Profile screen or any screen to help test
 * the verification system. REMOVE BEFORE PRODUCTION!
 * 
 * Usage:
 * import VerificationTestHelper from '../components/VerificationTestHelper';
 * 
 * // In your render:
 * <VerificationTestHelper />
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '../config/firebase';
import { useNavigation } from '@react-navigation/native';

const VerificationTestHelper: React.FC = () => {
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation<any>();

  const getUserId = () => {
    const auth = getAuth();
    return auth.currentUser?.uid;
  };

  // Fetch current user verification data
  const fetchUserData = async () => {
    const userId = getUserId();
    if (!userId) {
      Alert.alert('Error', 'No user logged in');
      return;
    }

    setLoading(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      const data = userDoc.data();
      setUserData(data);
      console.log('User verification data:', data);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  // Reset verification state (start fresh)
  const resetVerification = async () => {
    const userId = getUserId();
    if (!userId) return;

    Alert.alert(
      'Reset Verification',
      'This will clear all verification data. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await setDoc(doc(db, 'users', userId), {
                identityVerified: false,
                identityVerificationStatus: null,
                identityVerificationAttempts: 0,
                identityVerificationSessionId: null,
                identityVerificationAbandoned: false,
                identityVerificationError: null,
                identityVerifiedAt: null,
              }, { merge: true });
              Alert.alert('Success', 'Verification data reset');
              fetchUserData();
            } catch (error: any) {
              Alert.alert('Error', error.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  // Simulate abandoned verification
  const simulateAbandoned = async () => {
    const userId = getUserId();
    if (!userId) return;

    setLoading(true);
    try {
      await setDoc(doc(db, 'users', userId), {
        identityVerified: false,
        identityVerificationAbandoned: true,
        identityVerificationStartedAt: serverTimestamp(),
        identityVerificationAttempts: 1,
        verificationReminderLastShown: null, // Clear reminder cooldown
      }, { merge: true });
      Alert.alert('Success', 'Abandoned verification simulated. Restart the app to see the reminder.');
      fetchUserData();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  // Simulate max attempts reached
  const simulateMaxAttempts = async () => {
    const userId = getUserId();
    if (!userId) return;

    setLoading(true);
    try {
      await setDoc(doc(db, 'users', userId), {
        identityVerified: false,
        identityVerificationAttempts: 3,
        identityVerificationStatus: 'requires_input',
      }, { merge: true });
      Alert.alert('Success', 'Max attempts (3) set. Go to Verify Identity screen to see the result.');
      fetchUserData();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  // Simulate verified user
  const simulateVerified = async () => {
    const userId = getUserId();
    if (!userId) return;

    setLoading(true);
    try {
      await setDoc(doc(db, 'users', userId), {
        identityVerified: true,
        identityVerificationStatus: 'verified',
        identityVerifiedAt: serverTimestamp(),
        identityVerificationAbandoned: false,
      }, { merge: true });
      Alert.alert('Success', 'User marked as verified.');
      fetchUserData();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  // Navigate to verification screen
  const goToVerification = () => {
    navigation.navigate('VerifyIdentity');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🧪 Verification Test Helper</Text>
      <Text style={styles.warning}>⚠️ Remove before production!</Text>

      <ScrollView style={styles.buttonContainer}>
        <TouchableOpacity 
          style={[styles.button, styles.infoButton]} 
          onPress={fetchUserData}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Loading...' : '📊 Fetch Current Status'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.primaryButton]} 
          onPress={goToVerification}
        >
          <Text style={styles.buttonText}>🔐 Go to Verify Screen</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.warningButton]} 
          onPress={simulateAbandoned}
          disabled={loading}
        >
          <Text style={styles.buttonText}>🚪 Simulate Abandoned</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.warningButton]} 
          onPress={simulateMaxAttempts}
          disabled={loading}
        >
          <Text style={styles.buttonText}>❌ Simulate Max Attempts (3)</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.successButton]} 
          onPress={simulateVerified}
          disabled={loading}
        >
          <Text style={styles.buttonText}>✅ Simulate Verified</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.dangerButton]} 
          onPress={resetVerification}
          disabled={loading}
        >
          <Text style={styles.buttonText}>🗑️ Reset All Verification Data</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Display current user data */}
      {userData && (
        <View style={styles.dataContainer}>
          <Text style={styles.dataTitle}>Current Verification Data:</Text>
          <Text style={styles.dataText}>
            Verified: {userData.identityVerified ? '✅ Yes' : '❌ No'}
          </Text>
          <Text style={styles.dataText}>
            Status: {userData.identityVerificationStatus || 'none'}
          </Text>
          <Text style={styles.dataText}>
            Attempts: {userData.identityVerificationAttempts || 0} / 3
          </Text>
          <Text style={styles.dataText}>
            Abandoned: {userData.identityVerificationAbandoned ? '⚠️ Yes' : 'No'}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    margin: 16,
    borderWidth: 2,
    borderColor: '#e94560',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 4,
  },
  warning: {
    fontSize: 12,
    color: '#e94560',
    textAlign: 'center',
    marginBottom: 16,
  },
  buttonContainer: {
    maxHeight: 300,
  },
  button: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  infoButton: {
    backgroundColor: '#3b82f6',
  },
  primaryButton: {
    backgroundColor: '#6366f1',
  },
  warningButton: {
    backgroundColor: '#f59e0b',
  },
  successButton: {
    backgroundColor: '#22c55e',
  },
  dangerButton: {
    backgroundColor: '#ef4444',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  dataContainer: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  dataTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  dataText: {
    fontSize: 13,
    color: '#a0a0a0',
    marginBottom: 4,
  },
});

export default VerificationTestHelper;