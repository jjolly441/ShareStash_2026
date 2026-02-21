// src/screens/BookItemScreen.tsx - FIXED
import React, { useState, useContext, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '../components/NativeDatePicker';
import { RentalService } from '../services/RentalService'; // FIXED: Named import
import MessageService from '../services/MessageService';
import { AuthContext } from '../contexts/AuthContext';
import SettingsService from '../services/SettingsService';
import InsuranceService, { InsuranceTier } from '../services/InsuranceService';
import InsurancePicker from '../components/InsurancePicker';
import { useTranslation } from '../i18n/useTranslation';

const Colors = {
  primary: '#F5C542',
  secondary: '#2E86AB',
  success: '#46A758',
  warning: '#F76707',
  background: '#F8F9FA',
  text: '#212529',
  white: '#FFFFFF',
  border: '#E9ECEF',
};

type RentalPeriodType = 'hourly' | 'daily' | 'weekly' | 'monthly';

export default function BookItemScreen({ navigation, route }: any) {
  const { itemId, itemTitle, itemImage, pricePerDay, pricePerHour, pricePerWeek, pricePerMonth, weeklyDiscountPercent, monthlyDiscountPercent, securityDeposit, ownerId, ownerName } = route.params;
  const { user } = useContext(AuthContext);
  const { t } = useTranslation();

  // Determine which period types are available
  const availablePeriods: { type: RentalPeriodType; label: string; price: number }[] = [];
  if (pricePerHour) availablePeriods.push({ type: 'hourly', label: t('booking.hourly'), price: pricePerHour });
  availablePeriods.push({ type: 'daily', label: t('booking.daily'), price: pricePerDay });
  if (pricePerWeek) availablePeriods.push({ type: 'weekly', label: t('booking.weekly'), price: pricePerWeek });
  if (pricePerMonth) availablePeriods.push({ type: 'monthly', label: t('booking.monthly'), price: pricePerMonth });

  const [rentalPeriodType, setRentalPeriodType] = useState<RentalPeriodType>('daily');
  const [rentalQuantity, setRentalQuantity] = useState(2);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const dayAfterTomorrow = new Date();
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 3);
  dayAfterTomorrow.setHours(0, 0, 0, 0);

  const [startDate, setStartDate] = useState(tomorrow);
  const [endDate, setEndDate] = useState(dayAfterTomorrow);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [feePercent, setFeePercent] = useState(0.10);
  const [feeTierName, setFeeTierName] = useState('');
  const [loyaltyApplied, setLoyaltyApplied] = useState(false);
  const [loyaltyDiscount, setLoyaltyDiscount] = useState(0);
  const [insuranceTier, setInsuranceTier] = useState<InsuranceTier>('none');
  const [insurancePremium, setInsurancePremium] = useState(0);

  // Load fee — will re-run when rental price changes
  const loadFee = async (rentalAmount: number) => {
    try {
      // Get user's completed rental count for loyalty discount
      let completedCount = 0;
      if (user?.id) {
        try {
          const { collection: col, query: q, where: w, getDocs: gd } = require('firebase/firestore');
          const { db: database } = require('../config/firebase');
          const snap = await gd(q(col(database, 'rentals'), w('renterId', '==', user.id), w('status', '==', 'completed')));
          completedCount = snap.size;
        } catch {}
      }
      const breakdown = await SettingsService.getFeeBreakdown(rentalAmount, completedCount);
      setFeePercent(breakdown.finalFeePercent / 100);
      setFeeTierName(breakdown.isTiered ? breakdown.tierName : '');
      setLoyaltyApplied(breakdown.isLoyaltyApplied);
      setLoyaltyDiscount(breakdown.loyaltyDiscount);
    } catch {
      SettingsService.getServiceFeeDecimal().then(fee => setFeePercent(fee)).catch(() => {});
    }
  };

  useEffect(() => {
    SettingsService.getServiceFeeDecimal().then(fee => setFeePercent(fee)).catch(() => {});
  }, []);

  const calculateRentalDetails = () => {
    let unitPrice = pricePerDay;
    let units = 1;
    let unitLabel = 'day';
    let discountPercent = 0;
    let discountLabel = '';

    const currentPeriod = availablePeriods.find(p => p.type === rentalPeriodType);

    if (rentalPeriodType === 'hourly' && pricePerHour) {
      unitPrice = pricePerHour;
      units = rentalQuantity;
      unitLabel = units === 1 ? 'hour' : 'hours';
    } else if (rentalPeriodType === 'daily') {
      unitPrice = pricePerDay;
      const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
      units = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
      unitLabel = units === 1 ? 'day' : 'days';

      // Apply daily duration discounts
      if (units >= 28 && monthlyDiscountPercent) {
        discountPercent = monthlyDiscountPercent;
        discountLabel = 'Monthly discount';
      } else if (units >= 7 && weeklyDiscountPercent) {
        discountPercent = weeklyDiscountPercent;
        discountLabel = 'Weekly discount';
      }
    } else if (rentalPeriodType === 'weekly' && pricePerWeek) {
      unitPrice = pricePerWeek;
      units = rentalQuantity;
      unitLabel = units === 1 ? 'week' : 'weeks';
    } else if (rentalPeriodType === 'monthly' && pricePerMonth) {
      unitPrice = pricePerMonth;
      units = rentalQuantity;
      unitLabel = units === 1 ? 'month' : 'months';
    }

    const subtotal = unitPrice * units;
    const discountAmount = subtotal * (discountPercent / 100);
    const totalPrice = subtotal - discountAmount;
    const serviceFee = totalPrice * feePercent;
    const finalTotal = totalPrice + serviceFee + insurancePremium;

    return { units, unitPrice, unitLabel, subtotal, discountPercent, discountLabel, discountAmount, totalPrice, serviceFee, finalTotal, totalDays: units };
  };

  const { units, unitPrice, unitLabel, subtotal, discountPercent, discountLabel, discountAmount, totalPrice, serviceFee, finalTotal, totalDays } = calculateRentalDetails();

  // Recalculate tiered fee when rental price changes
  useEffect(() => {
    if (totalPrice > 0) {
      loadFee(totalPrice);
    }
  }, [totalPrice]);

  const handleStartDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowStartPicker(false);
    }
    
    if (selectedDate) {
      if (selectedDate >= endDate) {
        Alert.alert('Invalid Date', 'Start date must be before end date');
        setShowStartPicker(false);
        return;
      }
      setStartDate(selectedDate);
      if (Platform.OS === 'ios') {
        setShowStartPicker(false);
      }
    } else if (event.type === 'dismissed') {
      setShowStartPicker(false);
    }
  };

  const handleEndDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowEndPicker(false);
    }
    
    if (selectedDate) {
      if (selectedDate <= startDate) {
        Alert.alert('Invalid Date', 'End date must be after start date');
        setShowEndPicker(false);
        return;
      }
      setEndDate(selectedDate);
      if (Platform.OS === 'ios') {
        setShowEndPicker(false);
      }
    } else if (event.type === 'dismissed') {
      setShowEndPicker(false);
    }
  };

  const handleSubmitRequest = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to book an item');
      return;
    }

    if (units < 1) {
      Alert.alert('Invalid Rental Period', 'Rental must be at least 1 unit');
      return;
    }

    if (!message.trim()) {
      Alert.alert('Message Required', 'Please add a message to the owner');
      return;
    }

    const periodDesc = rentalPeriodType === 'daily'
      ? `Dates: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`
      : `Duration: ${units} ${unitLabel} starting ${startDate.toLocaleDateString()}`;

    Alert.alert(
      'Confirm Rental Request',
      `You are requesting to rent "${itemTitle}" from ${ownerName}.\n\n${periodDesc}\nTotal: $${finalTotal.toFixed(2)}\n\nNote: Payment will be processed after the owner approves your request.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: submitRentalRequest },
      ]
    );
  };

  const submitRentalRequest = async () => {
    setLoading(true);

    try {
      // Create rental with updated interface
      const rentalId = await RentalService.createRental({
        itemId,
        itemName: itemTitle,
        itemImage,
        ownerId,
        ownerName,
        renterId: user!.id,
        renterName: `${user!.firstName} ${user!.lastName}`,
        startDate: startDate,
        endDate: endDate,
        totalPrice: finalTotal,
        rentalPeriodType,
        rentalQuantity: units,
        status: 'pending',
        message: message,
        ...(securityDeposit && securityDeposit > 0 ? { securityDeposit } : {}),
        ...(insuranceTier !== 'none' ? {
          insuranceTier,
          insurancePremium,
          insuranceCoverageMax: InsuranceService.getPlan(insuranceTier).coverageMax,
          insurancePlanName: InsuranceService.getPlan(insuranceTier).name,
        } : {}),
      });

      // Create conversation with owner
      await MessageService.createConversation(
        [user!.id, ownerId],
        [`${user!.firstName} ${user!.lastName}`, ownerName],
        itemId,
        itemTitle,
        message,
        user!.id,
        `${user!.firstName} ${user!.lastName}`
      );

      Alert.alert(
        'Request Sent!',
        'Your rental request has been sent to the owner. You will be notified when they respond.',
        [
          {
            text: 'OK',
            onPress: () => {
              navigation.navigate('MainTabs', { screen: 'Rentals' });
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('Error submitting rental request:', error);
      Alert.alert('Error', error.message || 'Failed to send rental request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('booking.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Item Info Card */}
        <View style={styles.itemCard}>
          <Image source={{ uri: itemImage }} style={styles.itemImage} />
          <View style={styles.itemInfo}>
            <Text style={styles.itemTitle}>{itemTitle}</Text>
            <Text style={styles.itemOwner}>Listed by {ownerName}</Text>
            <Text style={styles.itemPrice}>${pricePerDay}/day</Text>
          </View>
        </View>

        {/* Rental Period Type Selector */}
        {availablePeriods.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Rental Type</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {availablePeriods.map((period) => (
                <TouchableOpacity
                  key={period.type}
                  onPress={() => {
                    setRentalPeriodType(period.type);
                    if (period.type !== 'daily') setRentalQuantity(1);
                    else setRentalQuantity(2);
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: rentalPeriodType === period.type ? Colors.primary : Colors.border,
                    backgroundColor: rentalPeriodType === period.type ? Colors.primary + '15' : Colors.white,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{
                    fontSize: 14,
                    fontWeight: rentalPeriodType === period.type ? 'bold' : '500',
                    color: rentalPeriodType === period.type ? Colors.text : '#666',
                  }}>
                    {period.label}
                  </Text>
                  <Text style={{
                    fontSize: 12,
                    color: rentalPeriodType === period.type ? Colors.secondary : '#999',
                    marginTop: 2,
                  }}>
                    ${period.price}/{period.type === 'hourly' ? 'hr' : period.type === 'daily' ? 'day' : period.type === 'weekly' ? 'wk' : 'mo'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Quantity selector for non-daily periods */}
        {rentalPeriodType !== 'daily' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              How many {rentalPeriodType === 'hourly' ? 'hours' : rentalPeriodType === 'weekly' ? 'weeks' : 'months'}?
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
              <TouchableOpacity
                onPress={() => setRentalQuantity(Math.max(1, rentalQuantity - 1))}
                style={{
                  width: 44, height: 44, borderRadius: 22,
                  backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center',
                }}
              >
                <Ionicons name="remove" size={24} color={Colors.text} />
              </TouchableOpacity>
              <Text style={{ fontSize: 28, fontWeight: 'bold', color: Colors.text, minWidth: 40, textAlign: 'center' }}>
                {rentalQuantity}
              </Text>
              <TouchableOpacity
                onPress={() => setRentalQuantity(rentalQuantity + 1)}
                style={{
                  width: 44, height: 44, borderRadius: 22,
                  backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center',
                }}
              >
                <Ionicons name="add" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Date Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {rentalPeriodType === 'daily' ? t('booking.selectDates') : t('booking.startDate')}
          </Text>

          {/* Start Date */}
          <View style={styles.dateContainer}>
            <Text style={styles.dateLabel}>{t('booking.startDate')}</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowStartPicker(true)}
            >
              <Ionicons name="calendar-outline" size={20} color={Colors.secondary} />
              <Text style={styles.dateText}>{startDate.toLocaleDateString()}</Text>
              <Ionicons name="chevron-down" size={20} color={Colors.text} />
            </TouchableOpacity>
          </View>

          {showStartPicker && (
            <DateTimePicker
              value={startDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleStartDateChange}
              minimumDate={tomorrow}
            />
          )}

          {/* End Date — only for daily */}
          {rentalPeriodType === 'daily' && (
            <>
              <View style={styles.dateContainer}>
                <Text style={styles.dateLabel}>{t('booking.endDate')}</Text>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowEndPicker(true)}
                >
                  <Ionicons name="calendar-outline" size={20} color={Colors.secondary} />
                  <Text style={styles.dateText}>{endDate.toLocaleDateString()}</Text>
                  <Ionicons name="chevron-down" size={20} color={Colors.text} />
                </TouchableOpacity>
              </View>

              {showEndPicker && (
                <DateTimePicker
                  value={endDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleEndDateChange}
                  minimumDate={new Date(startDate.getTime() + 86400000)}
                />
              )}
            </>
          )}

          {/* Rental Duration */}
          <View style={styles.durationBadge}>
            <Ionicons name="time-outline" size={20} color={Colors.primary} />
            <Text style={styles.durationText}>
              {units} {unitLabel}
            </Text>
          </View>

          {/* Discount hint — nudge user to extend for a discount */}
          {rentalPeriodType === 'daily' && discountPercent === 0 && (
            (weeklyDiscountPercent && units >= 4 && units < 7) ? (
              <View style={{ backgroundColor: '#FFF8E1', borderRadius: 8, padding: 10, marginTop: 8, flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="pricetag-outline" size={16} color="#F5A623" />
                <Text style={{ fontSize: 13, color: '#8B6914', marginLeft: 6, flex: 1 }}>
                  Add {7 - units} more {7 - units === 1 ? 'day' : 'days'} to save {weeklyDiscountPercent}% with the weekly discount!
                </Text>
              </View>
            ) : (monthlyDiscountPercent && units >= 21 && units < 28) ? (
              <View style={{ backgroundColor: '#FFF8E1', borderRadius: 8, padding: 10, marginTop: 8, flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="pricetag-outline" size={16} color="#F5A623" />
                <Text style={{ fontSize: 13, color: '#8B6914', marginLeft: 6, flex: 1 }}>
                  Add {28 - units} more {28 - units === 1 ? 'day' : 'days'} to save {monthlyDiscountPercent}% with the monthly discount!
                </Text>
              </View>
            ) : null
          )}
        </View>

        {/* Message to Owner */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('booking.messageToOwner')}</Text>
          <TextInput
            style={styles.messageInput}
            value={message}
            onChangeText={setMessage}
            placeholder={t('booking.messagePlaceholder')}
            multiline
            numberOfLines={4}
            maxLength={500}
          />
          <Text style={styles.charCount}>{message.length}/500</Text>
        </View>

        {/* Price Breakdown */}
        {/* Insurance / Rental Protection */}
        <View style={styles.section}>
          <InsurancePicker
            rentalPrice={totalPrice}
            selectedTier={insuranceTier}
            onSelectTier={(tier, premium) => {
              setInsuranceTier(tier);
              setInsurancePremium(premium);
            }}
          />
        </View>

        {/* Price Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('booking.priceDetails')}</Text>

          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>
              ${unitPrice.toFixed(2)} x {units} {unitLabel}
            </Text>
            <Text style={styles.priceValue}>${subtotal.toFixed(2)}</Text>
          </View>

          {discountPercent > 0 && (
            <View style={styles.priceRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="pricetag" size={14} color={Colors.success} />
                <Text style={[styles.priceLabel, { color: Colors.success, marginLeft: 4 }]}>
                  {discountLabel} ({discountPercent}% off)
                </Text>
              </View>
              <Text style={[styles.priceValue, { color: Colors.success }]}>-${discountAmount.toFixed(2)}</Text>
            </View>
          )}

          <View style={styles.priceRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Text style={styles.priceLabel}>
                {t('booking.serviceFee')} ({Math.round(feePercent * 100)}%)
              </Text>
              {feeTierName ? (
                <View style={{ backgroundColor: '#2E86AB15', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 6 }}>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: '#2E86AB' }}>{feeTierName}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.priceValue}>${serviceFee.toFixed(2)}</Text>
          </View>

          {loyaltyApplied ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: -4, marginBottom: 4, paddingLeft: 2 }}>
              <Ionicons name="star" size={12} color="#F59E0B" />
              <Text style={{ fontSize: 11, color: '#F59E0B', marginLeft: 4, fontWeight: '600' }}>
                Loyalty discount applied (-{loyaltyDiscount}%)
              </Text>
            </View>
          ) : null}

          {insurancePremium > 0 && (
            <View style={styles.priceRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name={InsuranceService.getTierIcon(insuranceTier) as any} size={14} color={InsuranceService.getTierColor(insuranceTier)} />
                <Text style={[styles.priceLabel, { color: InsuranceService.getTierColor(insuranceTier), marginLeft: 4 }]}>
                  {InsuranceService.getPlan(insuranceTier).name}
                </Text>
              </View>
              <Text style={[styles.priceValue, { color: InsuranceService.getTierColor(insuranceTier) }]}>
                ${insurancePremium.toFixed(2)}
              </Text>
            </View>
          )}

          <View style={styles.divider} />

          <View style={styles.priceRow}>
            <Text style={styles.totalLabel}>{t('booking.total')}</Text>
            <Text style={styles.totalValue}>${finalTotal.toFixed(2)}</Text>
          </View>

          {/* Security Deposit Notice */}
          {securityDeposit > 0 && (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#EFF6FF',
              borderRadius: 10,
              padding: 12,
              marginTop: 10,
              borderWidth: 1,
              borderColor: '#BFDBFE',
            }}>
              <Ionicons name="shield-checkmark" size={20} color={Colors.secondary} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.text }}>
                  + ${securityDeposit.toFixed(2)} Refundable Deposit
                </Text>
                <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                  Held on your card, released after successful return
                </Text>
              </View>
            </View>
          )}

          {discountPercent > 0 && (
            <View style={{ backgroundColor: '#F0FFF4', borderRadius: 8, padding: 10, marginTop: 8, flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
              <Text style={{ fontSize: 13, color: Colors.success, marginLeft: 6, fontWeight: '600' }}>
                You're saving ${discountAmount.toFixed(2)} with the {discountLabel.toLowerCase()}!
              </Text>
            </View>
          )}

          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={20} color={Colors.secondary} />
            <Text style={styles.infoText}>
              Payment will be processed after the owner approves your request
            </Text>
          </View>
        </View>

        {/* Important Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Important Information</Text>

          <View style={styles.infoItem}>
            <Ionicons name="shield-checkmark-outline" size={20} color={Colors.success} />
            <Text style={styles.infoItemText}>
              Your payment is protected until you confirm receipt
            </Text>
          </View>

          <View style={styles.infoItem}>
            <Ionicons name="calendar-outline" size={20} color={Colors.success} />
            <Text style={styles.infoItemText}>
              Free cancellation up to 24 hours before rental start
            </Text>
          </View>

          <View style={styles.infoItem}>
            <Ionicons name="chatbubble-outline" size={20} color={Colors.success} />
            <Text style={styles.infoItemText}>
              Communicate with the owner through our messaging system
            </Text>
          </View>

          <View style={styles.infoItem}>
            <Ionicons name="alert-circle-outline" size={20} color={Colors.success} />
            <Text style={styles.infoItemText}>
              Report any issues or damage immediately
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomPriceInfo}>
          <Text style={styles.bottomTotal}>${finalTotal.toFixed(2)}</Text>
          <Text style={styles.bottomSubtext}>for {totalDays} days</Text>
        </View>
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmitRequest}
          disabled={loading}
        >
          <Text style={styles.submitButtonText}>
            {loading ? t('common.loading') : t('booking.requestBooking')}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
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
  headerSpacer: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  itemCard: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    margin: 20,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  itemImage: {
    width: 100,
    height: 100,
  },
  itemInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  itemOwner: {
    fontSize: 12,
    color: Colors.text,
    opacity: 0.6,
    marginBottom: 8,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  section: {
    backgroundColor: Colors.white,
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 16,
  },
  dateContainer: {
    marginBottom: 16,
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dateText: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
    marginLeft: 12,
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary + '20',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  durationText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  messageInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.text,
    height: 100,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 12,
    color: Colors.text,
    opacity: 0.6,
    textAlign: 'right',
    marginTop: 4,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  priceLabel: {
    fontSize: 16,
    color: Colors.text,
  },
  priceValue: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 12,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.secondary + '10',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: Colors.secondary,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  infoItemText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  bottomPriceInfo: {
    flex: 1,
  },
  bottomTotal: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
  },
  bottomSubtext: {
    fontSize: 12,
    color: Colors.text,
    opacity: 0.6,
  },
  submitButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
  },
});