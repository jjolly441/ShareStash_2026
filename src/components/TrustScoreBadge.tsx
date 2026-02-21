// src/components/TrustScoreBadge.tsx
// Reusable Trust Score display component
// Shows the overall score, tier badge, and optional breakdown

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TrustScoreService, { TrustScoreBreakdown, TrustTier } from '../services/TrustScoreService';

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

// ============================================================================
// COMPACT BADGE (for use on cards, list items, item details)
// ============================================================================

interface CompactBadgeProps {
  score: number;
  tier: TrustTier;
  color: string;
  label: string;
}

export function TrustScoreCompactBadge({ score, tier, color, label }: CompactBadgeProps) {
  const icon = TrustScoreService.getTierIcon(tier);

  return (
    <View style={[styles.compactBadge, { backgroundColor: color + '15', borderColor: color + '30' }]}>
      <Ionicons name={icon as any} size={14} color={color} />
      <Text style={[styles.compactScore, { color }]}>{score}</Text>
      <Text style={[styles.compactLabel, { color }]}>{label}</Text>
    </View>
  );
}

// ============================================================================
// FULL TRUST SCORE CARD (for profile pages)
// ============================================================================

interface TrustScoreCardProps {
  breakdown: TrustScoreBreakdown;
  showBreakdown?: boolean;
  isOwnProfile?: boolean;
}

export function TrustScoreCard({ breakdown, showBreakdown = true, isOwnProfile = false }: TrustScoreCardProps) {
  const [expanded, setExpanded] = useState(false);
  const icon = TrustScoreService.getTierIcon(breakdown.tier);
  const description = TrustScoreService.getScoreDescription(breakdown);
  const tips = isOwnProfile ? TrustScoreService.getImprovementTips(breakdown) : [];

  return (
    <View style={styles.card}>
      {/* Header with score circle and tier */}
      <View style={styles.cardHeader}>
        <View style={[styles.scoreCircle, { borderColor: breakdown.color }]}>
          <Text style={[styles.scoreNumber, { color: breakdown.color }]}>{breakdown.overall}</Text>
          <Text style={styles.scoreMax}>/100</Text>
        </View>

        <View style={styles.tierInfo}>
          <View style={[styles.tierBadge, { backgroundColor: breakdown.color + '15' }]}>
            <Ionicons name={icon as any} size={16} color={breakdown.color} />
            <Text style={[styles.tierLabel, { color: breakdown.color }]}>{breakdown.label}</Text>
          </View>
          <Text style={styles.tierDescription}>{description}</Text>
        </View>
      </View>

      {/* Breakdown toggle */}
      {showBreakdown && (
        <>
          <TouchableOpacity
            style={styles.breakdownToggle}
            onPress={() => setExpanded(!expanded)}
          >
            <Text style={styles.breakdownToggleText}>
              {expanded ? 'Hide Details' : 'View Score Breakdown'}
            </Text>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={Colors.secondary}
            />
          </TouchableOpacity>

          {expanded && (
            <View style={styles.breakdownContainer}>
              <ScoreBar
                label="Reviews"
                score={breakdown.reviewScore}
                detail={`${breakdown.stats.averageRating.toFixed(1)}★ from ${breakdown.stats.totalReviews} reviews`}
                weight="40%"
              />
              <ScoreBar
                label="Verification"
                score={breakdown.verificationScore}
                detail={
                  breakdown.stats.identityVerified
                    ? 'Identity verified'
                    : breakdown.stats.phoneVerified
                    ? 'Phone verified'
                    : 'Not verified'
                }
                weight="20%"
              />
              <ScoreBar
                label="Rental History"
                score={breakdown.rentalHistoryScore}
                detail={`${breakdown.stats.completedRentals} completed, ${breakdown.stats.cancelledRentals} cancelled`}
                weight="25%"
              />
              <ScoreBar
                label="Disputes"
                score={breakdown.disputeScore}
                detail={
                  breakdown.stats.disputesReported === 0
                    ? 'Clean record'
                    : `${breakdown.stats.disputesReported} dispute${breakdown.stats.disputesReported > 1 ? 's' : ''}`
                }
                weight="15%"
              />

              {/* Improvement tips (own profile only) */}
              {isOwnProfile && tips.length > 0 && (
                <View style={styles.tipsContainer}>
                  <Text style={styles.tipsTitle}>How to improve your score:</Text>
                  {tips.map((tip, index) => (
                    <View key={index} style={styles.tipRow}>
                      <Ionicons name="bulb-outline" size={14} color={Colors.primary} />
                      <Text style={styles.tipText}>{tip}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}

// ============================================================================
// SCORE BAR COMPONENT
// ============================================================================

interface ScoreBarProps {
  label: string;
  score: number;
  detail: string;
  weight: string;
}

function ScoreBar({ label, score, detail, weight }: ScoreBarProps) {
  const barColor =
    score >= 80 ? Colors.success :
    score >= 50 ? Colors.secondary :
    score >= 30 ? '#F59E0B' :
    '#DC3545';

  return (
    <View style={styles.scoreBarContainer}>
      <View style={styles.scoreBarHeader}>
        <Text style={styles.scoreBarLabel}>{label}</Text>
        <Text style={styles.scoreBarWeight}>({weight})</Text>
        <Text style={[styles.scoreBarValue, { color: barColor }]}>{score}</Text>
      </View>
      <View style={styles.scoreBarTrack}>
        <View
          style={[
            styles.scoreBarFill,
            { width: `${Math.min(score, 100)}%`, backgroundColor: barColor },
          ]}
        />
      </View>
      <Text style={styles.scoreBarDetail}>{detail}</Text>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  // Compact badge
  compactBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  compactScore: {
    fontSize: 13,
    fontWeight: '700',
  },
  compactLabel: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Full card
  card: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  scoreCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreNumber: {
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 26,
  },
  scoreMax: {
    fontSize: 10,
    color: Colors.muted,
    marginTop: -2,
  },
  tierInfo: {
    flex: 1,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 5,
    marginBottom: 4,
  },
  tierLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  tierDescription: {
    fontSize: 12,
    color: Colors.muted,
    lineHeight: 18,
  },

  // Breakdown toggle
  breakdownToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 14,
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 4,
  },
  breakdownToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.secondary,
  },

  // Breakdown
  breakdownContainer: {
    marginTop: 14,
    gap: 12,
  },

  // Score bar
  scoreBarContainer: {
    gap: 4,
  },
  scoreBarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scoreBarLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  scoreBarWeight: {
    fontSize: 11,
    color: Colors.muted,
    flex: 1,
  },
  scoreBarValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  scoreBarTrack: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  scoreBarDetail: {
    fontSize: 11,
    color: Colors.muted,
  },

  // Tips
  tipsContainer: {
    backgroundColor: Colors.primary + '10',
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
  },
  tipsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 4,
  },
  tipText: {
    fontSize: 12,
    color: Colors.text,
    flex: 1,
    lineHeight: 18,
  },
});
