// src/components/NativeSlider.web.tsx
// Web stub for Slider using HTML range input
import React from 'react';
import { View } from 'react-native';

const Slider = ({ value, onValueChange, minimumValue = 0, maximumValue = 100, step = 1, minimumTrackTintColor = '#2E86AB', style }: any) => {
  return (
    <View style={style}>
      <input
        type="range"
        min={minimumValue}
        max={maximumValue}
        step={step}
        value={value}
        onChange={(e: any) => onValueChange(parseFloat(e.target.value))}
        style={{ width: '100%', height: 36, accentColor: minimumTrackTintColor, cursor: 'pointer' }}
      />
    </View>
  );
};

export default Slider;