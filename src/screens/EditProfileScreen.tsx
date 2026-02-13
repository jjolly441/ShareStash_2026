// src/screens/EditProfileScreen.tsx
// Issue #18: Edit Profile - Name, Photo, Bio/Description
import React, { useState, useContext, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { AuthContext } from '../contexts/AuthContext';

const Colors = {
  primary: '#F5C542',
  secondary: '#2E86AB',
  success: '#46A758',
  background: '#F8F9FA',
  text: '#212529',
  white: '#FFFFFF',
  border: '#E9ECEF',
  danger: '#DC3545',
  placeholder: '#9CA3AF',
};

export default function EditProfileScreen({ navigation }: any) {
  const { user, refreshUser } = useContext(AuthContext);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [bio, setBio] = useState('');
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    if (!user) return;
    try {
      const userDoc = await getDoc(doc(db, 'users', user.id));
      const data = userDoc.data();
      if (data) {
        setFirstName(data.firstName || '');
        setLastName(data.lastName || '');
        setBio(data.bio || '');
        setPhotoURL(data.photoURL || null);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant camera roll access to change your photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoURL(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Required', 'First name and last name are required.');
      return;
    }

    setSaving(true);
    try {
      const updateData: any = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        bio: bio.trim(),
        updatedAt: new Date().toISOString(),
      };

      if (photoURL) {
        updateData.photoURL = photoURL;
      }

      await updateDoc(doc(db, 'users', user.id), updateData);

      // Refresh user context if available
      if (refreshUser) {
        await refreshUser();
      }

      Alert.alert('Success', 'Profile updated successfully!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.saveButton}>
          {saving ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Profile Photo */}
          <View style={styles.photoSection}>
            <TouchableOpacity onPress={handlePickImage} style={styles.photoContainer}>
              {photoURL ? (
                <Image source={{ uri: photoURL }} style={styles.photo} />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="person" size={48} color={Colors.white} />
                </View>
              )}
              <View style={styles.editPhotoOverlay}>
                <Ionicons name="camera" size={18} color={Colors.white} />
              </View>
            </TouchableOpacity>
            <Text style={styles.changePhotoText}>Tap to change photo</Text>
          </View>

          {/* Form Fields */}
          <View style={styles.formSection}>
            <Text style={styles.label}>First Name</Text>
            <TextInput
              style={styles.input}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="Enter first name"
              placeholderTextColor={Colors.placeholder}
              autoCapitalize="words"
            />

            <Text style={styles.label}>Last Name</Text>
            <TextInput
              style={styles.input}
              value={lastName}
              onChangeText={setLastName}
              placeholder="Enter last name"
              placeholderTextColor={Colors.placeholder}
              autoCapitalize="words"
            />

            <Text style={styles.label}>Bio</Text>
            <TextInput
              style={[styles.input, styles.bioInput]}
              value={bio}
              onChangeText={(text) => {
                if (text.length <= 300) setBio(text);
              }}
              placeholder="Tell others about yourself..."
              placeholderTextColor={Colors.placeholder}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{bio.length}/300</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  photoSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  photoContainer: {
    position: 'relative',
  },
  photo: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  photoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editPhotoOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.white,
  },
  changePhotoText: {
    marginTop: 8,
    fontSize: 14,
    color: Colors.secondary,
  },
  formSection: {
    gap: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.text,
  },
  bioInput: {
    minHeight: 100,
    paddingTop: 12,
  },
  charCount: {
    textAlign: 'right',
    fontSize: 12,
    color: Colors.placeholder,
    marginTop: 4,
  },
});