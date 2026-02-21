// src/components/NativeMap.web.tsx
// Web stub — never imports react-native-maps
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const MapView = ({ children, style, ...props }: any) => {
  return <View style={[styles.container, style]}>{children}</View>;
};

export const Marker = (_props: any) => null;

export function NativeMapView({ latitude, longitude, address, title, style, onPress }: any) {
  const openInMaps = () => {
    if (latitude && longitude) {
      Linking.openURL(`https://www.google.com/maps?q=${latitude},${longitude}`);
    }
  };

  return (
    <TouchableOpacity style={[styles.container, style]} onPress={onPress || openInMaps} activeOpacity={0.7}>
      <View style={styles.iconCircle}>
        <Ionicons name="location" size={32} color="#2E86AB" />
      </View>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {address ? <Text style={styles.address}>{address}</Text> : null}
      <View style={styles.linkRow}>
        <Ionicons name="open-outline" size={14} color="#2E86AB" />
        <Text style={styles.linkText}>Open in Google Maps</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F0F7FF',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    minHeight: 150,
    justifyContent: 'center',
  },
  iconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 10,
  },
  title: { fontSize: 15, fontWeight: '700', color: '#212529', marginBottom: 4 },
  address: { fontSize: 13, color: '#6C757D', textAlign: 'center', marginBottom: 8 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkText: { fontSize: 13, color: '#2E86AB', fontWeight: '600' },
});

export default MapView;