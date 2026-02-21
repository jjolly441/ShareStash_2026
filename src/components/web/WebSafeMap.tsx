// src/components/web/WebSafeMap.tsx
// On native: renders MapView. On web: renders a styled address card.
import React from 'react';
import { View, Text, StyleSheet, Platform, Linking, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface WebSafeMapProps {
  latitude?: number;
  longitude?: number;
  address?: string;
  title?: string;
  style?: any;
  children?: React.ReactNode;
}

export default function WebSafeMap({ latitude, longitude, address, title, style, children }: WebSafeMapProps) {
  if (Platform.OS !== 'web') {
    // On native, use the real MapView
    const MapView = require('react-native-maps').default;
    const { Marker } = require('react-native-maps');
    return (
      <MapView
        style={[{ height: 200, borderRadius: 12 }, style]}
        initialRegion={{
          latitude: latitude || 37.78,
          longitude: longitude || -122.41,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
      >
        {latitude && longitude && (
          <Marker coordinate={{ latitude, longitude }} title={title} />
        )}
        {children}
      </MapView>
    );
  }

  // Web fallback — styled location card
  const openInMaps = () => {
    if (latitude && longitude) {
      Linking.openURL(`https://www.google.com/maps?q=${latitude},${longitude}`);
    } else if (address) {
      Linking.openURL(`https://www.google.com/maps/search/${encodeURIComponent(address)}`);
    }
  };

  return (
    <TouchableOpacity style={[styles.container, style]} onPress={openInMaps} activeOpacity={0.7}>
      <View style={styles.iconContainer}>
        <Ionicons name="location" size={32} color="#2E86AB" />
      </View>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {address ? <Text style={styles.address}>{address}</Text> : null}
      {latitude && longitude ? (
        <Text style={styles.coords}>{latitude.toFixed(4)}, {longitude.toFixed(4)}</Text>
      ) : null}
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
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: { fontSize: 15, fontWeight: '700', color: '#212529', marginBottom: 4 },
  address: { fontSize: 13, color: '#6C757D', textAlign: 'center', marginBottom: 4 },
  coords: { fontSize: 11, color: '#9CA3AF', marginBottom: 8 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkText: { fontSize: 13, color: '#2E86AB', fontWeight: '600' },
});
