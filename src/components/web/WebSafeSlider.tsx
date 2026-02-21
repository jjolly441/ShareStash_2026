// src/components/web/WebSafeSlider.tsx
// On native: renders @react-native-community/slider. On web: renders HTML range input.
import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

interface WebSafeSliderProps {
  value: number;
  onValueChange: (value: number) => void;
  minimumValue?: number;
  maximumValue?: number;
  step?: number;
  minimumTrackTintColor?: string;
  maximumTrackTintColor?: string;
  thumbTintColor?: string;
  style?: any;
}

export default function WebSafeSlider({
  value,
  onValueChange,
  minimumValue = 0,
  maximumValue = 100,
  step = 1,
  minimumTrackTintColor = '#2E86AB',
  maximumTrackTintColor = '#E9ECEF',
  style,
}: WebSafeSliderProps) {
  if (Platform.OS !== 'web') {
    const Slider = require('@react-native-community/slider').default;
    return (
      <Slider
        value={value}
        onValueChange={onValueChange}
        minimumValue={minimumValue}
        maximumValue={maximumValue}
        step={step}
        minimumTrackTintColor={minimumTrackTintColor}
        maximumTrackTintColor={maximumTrackTintColor}
        style={style}
      />
    );
  }

  // Web fallback — HTML range input
  return (
    <View style={[styles.container, style]}>
      <input
        type="range"
        min={minimumValue}
        max={maximumValue}
        step={step}
        value={value}
        onChange={(e) => onValueChange(parseFloat(e.target.value))}
        style={{
          width: '100%',
          height: 36,
          accentColor: minimumTrackTintColor,
          cursor: 'pointer',
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
});
