// src/components/NativeDatePicker.web.tsx
// Web stub for DateTimePicker
import React from 'react';
import { View, TextInput, StyleSheet } from 'react-native';

const DateTimePicker = ({ value, onChange, mode, ...props }: any) => {
  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  return (
    <View>
      <TextInput
        style={styles.input}
        value={formatDate(value)}
        onChangeText={(text) => {
          const parsed = new Date(text + 'T00:00:00');
          if (!isNaN(parsed.getTime()) && onChange) {
            onChange({ type: 'set' }, parsed);
          }
        }}
        placeholder="YYYY-MM-DD"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  input: {
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#212529',
  },
});

export default DateTimePicker;