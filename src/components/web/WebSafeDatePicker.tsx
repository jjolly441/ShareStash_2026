// src/components/web/WebSafeDatePicker.tsx
// On native: renders DateTimePicker. On web: renders HTML date input.
import React from 'react';
import { View, Text, StyleSheet, Platform, TextInput } from 'react-native';

interface WebSafeDatePickerProps {
  value: Date;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  mode?: 'date' | 'time' | 'datetime';
  label?: string;
}

export default function WebSafeDatePicker({
  value,
  onChange,
  minimumDate,
  maximumDate,
  mode = 'date',
  label,
}: WebSafeDatePickerProps) {
  if (Platform.OS !== 'web') {
    const DateTimePicker = require('@react-native-community/datetimepicker').default;
    return (
      <DateTimePicker
        value={value}
        mode={mode}
        display="default"
        onChange={(_: any, date?: Date) => { if (date) onChange(date); }}
        minimumDate={minimumDate}
        maximumDate={maximumDate}
      />
    );
  }

  // Web fallback — HTML date input
  const formatDate = (d: Date) => {
    return d.toISOString().split('T')[0];
  };

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        style={styles.input}
        value={formatDate(value)}
        onChangeText={(text) => {
          const parsed = new Date(text + 'T00:00:00');
          if (!isNaN(parsed.getTime())) {
            onChange(parsed);
          }
        }}
        placeholder="YYYY-MM-DD"
        // @ts-ignore — web-only prop
        type="date"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  label: { fontSize: 13, fontWeight: '600', color: '#212529', marginBottom: 4 },
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
