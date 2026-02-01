/**
 * VerificationBadge - Shows verification status on user profiles
 * 
 * Displays a trust badge indicating whether a user has verified their identity.
 * Use this on profile cards, user avatars, and detail screens.
 * 
 * Features:
 * - Multiple sizes (small, medium, large)
 * - Tooltip option for explanation
 * - Loading state
 * - Animated appearance
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

interface Props {
  userId: string;
  size?: 'small' | 'medium' | 'large';
  showTooltip?: boolean;
  showUnverified?: boolean;
  style?: any;
}

type VerificationStatus = 'loading' | 'verified' | 'unverified';

const VerificationBadge: React.FC<Props> = ({
  userId,
  size = 'medium',
  showTooltip = true,
  showUnverified = false,
  style,
}) => {
  const [status, setStatus] = useState<VerificationStatus>('loading');
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    checkVerificationStatus();
  }, [userId]);

  useEffect(() => {
    if (status === 'verified') {
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 100,
        useNativeDriver: true,
      }).start();
    }
  }, [status]);

  const checkVerificationStatus = async () => {
    if (!userId) {
      setStatus('unverified');
      return;
    }

    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      const userData = userDoc.data();

      if (userData?.identityVerified) {
        setStatus('verified');
      } else {
        setStatus('unverified');
      }
    } catch (error) {
      console.error('Error checking verification status:', error);
      setStatus('unverified');
    }
  };

  const handlePress = () => {
    if (showTooltip) {
      setTooltipVisible(true);
    }
  };

  // Size configurations
  const sizeConfig = {
    small: {
      container: { width: 18, height: 18 },
      icon: 10,
      text: 11,
    },
    medium: {
      container: { width: 24, height: 24 },
      icon: 14,
      text: 13,
    },
    large: {
      container: { width: 32, height: 32 },
      icon: 18,
      text: 15,
    },
  };

  const config = sizeConfig[size];

  // Don't render if unverified and showUnverified is false
  if (status === 'unverified' && !showUnverified) {
    return null;
  }

  // Loading state - minimal
  if (status === 'loading') {
    return null;
  }

  // Verified badge
  if (status === 'verified') {
    return (
      <>
        <TouchableOpacity
          onPress={handlePress}
          activeOpacity={showTooltip ? 0.7 : 1}
          style={style}
        >
          <Animated.View 
            style={[
              styles.verifiedBadge,
              config.container,
              { transform: [{ scale: scaleAnim }] }
            ]}
          >
            <Ionicons 
              name="shield-checkmark" 
              size={config.icon} 
              color="#fff" 
            />
          </Animated.View>
        </TouchableOpacity>

        {/* Tooltip Modal */}
        <Modal
          visible={tooltipVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setTooltipVisible(false)}
        >
          <Pressable 
            style={styles.tooltipOverlay}
            onPress={() => setTooltipVisible(false)}
          >
            <View style={styles.tooltipContainer}>
              <View style={styles.tooltipContent}>
                <View style={styles.tooltipIconContainer}>
                  <Ionicons name="shield-checkmark" size={32} color="#22c55e" />
                </View>
                <Text style={styles.tooltipTitle}>Verified Member</Text>
                <Text style={styles.tooltipText}>
                  This user has verified their identity with a government-issued ID. 
                  Verified members are trusted members of the Share Stash community.
                </Text>
                <TouchableOpacity
                  style={styles.tooltipButton}
                  onPress={() => setTooltipVisible(false)}
                >
                  <Text style={styles.tooltipButtonText}>Got it</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Modal>
      </>
    );
  }

  // Unverified badge (only shown if showUnverified is true)
  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={showTooltip ? 0.7 : 1}
      style={style}
    >
      <View 
        style={[
          styles.unverifiedBadge,
          config.container,
        ]}
      >
        <Ionicons 
          name="shield-outline" 
          size={config.icon} 
          color="#94a3b8" 
        />
      </View>

      {/* Tooltip Modal for unverified */}
      <Modal
        visible={tooltipVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTooltipVisible(false)}
      >
        <Pressable 
          style={styles.tooltipOverlay}
          onPress={() => setTooltipVisible(false)}
        >
          <View style={styles.tooltipContainer}>
            <View style={styles.tooltipContent}>
              <View style={[styles.tooltipIconContainer, { backgroundColor: '#f1f5f9' }]}>
                <Ionicons name="shield-outline" size={32} color="#64748b" />
              </View>
              <Text style={styles.tooltipTitle}>Not Yet Verified</Text>
              <Text style={styles.tooltipText}>
                This user hasn't verified their identity yet. 
                For high-value rentals, consider renting from verified members.
              </Text>
              <TouchableOpacity
                style={styles.tooltipButton}
                onPress={() => setTooltipVisible(false)}
              >
                <Text style={styles.tooltipButtonText}>Got it</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
    </TouchableOpacity>
  );
};

/**
 * Inline badge variant - for use in text or next to names
 */
export const VerificationBadgeInline: React.FC<{
  verified: boolean;
  size?: 'small' | 'medium';
}> = ({ verified, size = 'small' }) => {
  if (!verified) return null;

  const iconSize = size === 'small' ? 14 : 18;

  return (
    <View style={styles.inlineBadge}>
      <Ionicons name="shield-checkmark" size={iconSize} color="#22c55e" />
    </View>
  );
};

/**
 * Text badge variant - includes "Verified" text
 */
export const VerificationBadgeWithText: React.FC<{
  userId: string;
  style?: any;
}> = ({ userId, style }) => {
  const [verified, setVerified] = useState<boolean | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        setVerified(userDoc.data()?.identityVerified || false);
      } catch {
        setVerified(false);
      }
    };
    check();
  }, [userId]);

  if (verified === null || !verified) return null;

  return (
    <View style={[styles.textBadge, style]}>
      <Ionicons name="shield-checkmark" size={14} color="#22c55e" />
      <Text style={styles.textBadgeLabel}>Verified</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  verifiedBadge: {
    backgroundColor: '#22c55e',
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  unverifiedBadge: {
    backgroundColor: '#f1f5f9',
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  inlineBadge: {
    marginLeft: 4,
  },
  textBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  textBadgeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16a34a',
    marginLeft: 4,
  },
  tooltipOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  tooltipContainer: {
    width: '100%',
    maxWidth: 320,
  },
  tooltipContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  tooltipIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#dcfce7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  tooltipTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
    textAlign: 'center',
  },
  tooltipText: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  tooltipButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
  },
  tooltipButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

export default VerificationBadge;