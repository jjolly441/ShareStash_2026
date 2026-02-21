// src/components/web/WebLayout.tsx
// Responsive wrapper that constrains content width on desktop
import React from 'react';
import { View, StyleSheet, Platform, Dimensions } from 'react-native';

const MAX_WIDTH = 1200;

interface WebLayoutProps {
  children: React.ReactNode;
  maxWidth?: number;
  style?: any;
  centered?: boolean;
}

export default function WebLayout({ children, maxWidth = MAX_WIDTH, style, centered = true }: WebLayoutProps) {
  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  return (
    <View style={[styles.outer, style]}>
      <View style={[styles.inner, { maxWidth }, centered && styles.centered]}>
        {children}
      </View>
    </View>
  );
}

/**
 * Hook to get responsive column count based on screen width
 */
export function useResponsiveColumns(mobileCount = 1, tabletCount = 2, desktopCount = 3): number {
  if (Platform.OS !== 'web') return mobileCount;
  const width = Dimensions.get('window').width;
  if (width >= 1024) return desktopCount;
  if (width >= 768) return tabletCount;
  return mobileCount;
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    width: '100%',
  },
  inner: {
    flex: 1,
    width: '100%',
  },
  centered: {
    alignSelf: 'center',
  },
});
