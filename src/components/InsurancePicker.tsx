// src/components/InsurancePicker.tsx
// Reusable insurance plan picker component for BookItem and Checkout screens
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import InsuranceService, { InsurancePlan, InsuranceTier } from '../services/InsuranceService';

const Colors = {
  primary: '#F5C542',
  secondary: '#2E86AB',
  success: '#46A758',
  background: '#F8F9FA',
  text: '#212529',
  white: '#FFFFFF',
  border: '#E9ECEF',
  muted: '#6C757D',
};

interface InsurancePickerProps {
  rentalPrice: number;
  selectedTier: InsuranceTier;
  onSelectTier: (tier: InsuranceTier, premium: number) => void;
  compact?: boolean;
}

export default function InsurancePicker({
  rentalPrice,
  selectedTier,
  onSelectTier,
  compact = false,
}: InsurancePickerProps) {
  const plans = InsuranceService.getPlans();
  const recommendedTier = InsuranceService.getRecommendedTier(rentalPrice);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="shield-checkmark" size={20} color={Colors.secondary} />
        <Text style={styles.headerTitle}>Rental Protection</Text>
      </View>
      <Text style={styles.headerSubtitle}>
        Protect yourself against damage, theft, and accidents
      </Text>

      <View style={styles.plansList}>
        {plans.map((plan) => {
          const premium = InsuranceService.calculatePremium(rentalPrice, plan.tier);
          const isSelected = selectedTier === plan.tier;
          const isRecommended = plan.tier === recommendedTier && plan.tier !== 'none';

          return (
            <TouchableOpacity
              key={plan.tier}
              style={[
                styles.planCard,
                isSelected && { borderColor: plan.color, borderWidth: 2, backgroundColor: plan.color + '08' },
              ]}
              onPress={() => onSelectTier(plan.tier, premium)}
              activeOpacity={0.7}
            >
              {/* Recommended badge */}
              {isRecommended && (
                <View style={[styles.recommendedBadge, { backgroundColor: plan.color }]}>
                  <Text style={styles.recommendedText}>Recommended</Text>
                </View>
              )}

              <View style={styles.planHeader}>
                <View style={styles.planLeft}>
                  <View style={[styles.radio, isSelected && { borderColor: plan.color }]}>
                    {isSelected && <View style={[styles.radioDot, { backgroundColor: plan.color }]} />}
                  </View>
                  <Ionicons name={plan.icon as any} size={22} color={plan.color} />
                  <View style={styles.planNameCol}>
                    <Text style={[styles.planName, isSelected && { color: plan.color }]}>
                      {plan.name}
                    </Text>
                    {!compact && (
                      <Text style={styles.planDesc}>{plan.description}</Text>
                    )}
                  </View>
                </View>
                <View style={styles.planRight}>
                  {plan.tier === 'none' ? (
                    <Text style={styles.planFree}>Free</Text>
                  ) : (
                    <View style={styles.priceCol}>
                      <Text style={[styles.planPrice, { color: plan.color }]}>
                        +${premium.toFixed(2)}
                      </Text>
                      <Text style={styles.planRate}>{plan.ratePercent}%</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Coverage details (expanded when selected and not compact) */}
              {isSelected && !compact && plan.tier !== 'none' && (
                <View style={styles.coverageList}>
                  {plan.coverageDetails.map((detail, i) => (
                    <View key={i} style={styles.coverageItem}>
                      <Ionicons name="checkmark" size={14} color={plan.color} />
                      <Text style={styles.coverageText}>{detail}</Text>
                    </View>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ============================================================================
// COMPACT INSURANCE BADGE (for displaying on rental cards)
// ============================================================================

interface InsuranceBadgeProps {
  tier: InsuranceTier;
  premiumAmount?: number;
}

export function InsuranceBadge({ tier, premiumAmount }: InsuranceBadgeProps) {
  if (tier === 'none') return null;

  const plan = InsuranceService.getPlan(tier);

  return (
    <View style={[styles.badge, { backgroundColor: plan.color + '15', borderColor: plan.color + '30' }]}>
      <Ionicons name={plan.icon as any} size={14} color={plan.color} />
      <Text style={[styles.badgeText, { color: plan.color }]}>{plan.name}</Text>
      {premiumAmount != null && premiumAmount > 0 && (
        <Text style={[styles.badgeAmount, { color: plan.color }]}>${premiumAmount.toFixed(2)}</Text>
      )}
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: Colors.muted,
    marginBottom: 12,
    marginLeft: 28,
  },
  plansList: {
    gap: 8,
  },
  planCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  recommendedBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderBottomLeftRadius: 8,
  },
  recommendedText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.white,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  planNameCol: {
    flex: 1,
  },
  planName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  planDesc: {
    fontSize: 11,
    color: Colors.muted,
    marginTop: 1,
  },
  planRight: {
    alignItems: 'flex-end',
  },
  priceCol: {
    alignItems: 'flex-end',
  },
  planPrice: {
    fontSize: 15,
    fontWeight: '800',
  },
  planRate: {
    fontSize: 10,
    color: Colors.muted,
  },
  planFree: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.muted,
  },
  coverageList: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 4,
  },
  coverageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  coverageText: {
    fontSize: 12,
    color: Colors.text,
  },

  // Badge
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  badgeAmount: {
    fontSize: 11,
    fontWeight: '700',
  },
});