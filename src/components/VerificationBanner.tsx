/**
 * VerificationBanner - Proactive verification prompt component
 * 
 * Displays a friendly banner encouraging users to verify their identity.
 * Can be placed on Home screen, Profile, or anywhere verification should be promoted.
 * 
 * Features:
 * - Multiple visual variants (default, compact, card)
 * - Dismissible with persistence
 * - Shows verification status if already verified
 * - Smooth animations
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '../config/firebase';
import { useNavigation } from '@react-navigation/native';

const { width } = Dimensions.get('window');

interface Props {
  variant?: 'default' | 'compact' | 'card';
  dismissible?: boolean;
  onVerified?: () => void;
  style?: any;
}

type VerificationStatus = 'loading' | 'unverified' | 'verified' | 'dismissed';

const VerificationBanner: React.FC<Props> = ({ 
  variant = 'default',
  dismissible = true,
  onVerified,
  style,
}) => {
  const [status, setStatus] = useState<VerificationStatus>('loading');
  const [isVisible, setIsVisible] = useState(true);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-20)).current;
  const navigation = useNavigation<any>();

  useEffect(() => {
    checkVerificationStatus();
  }, []);

  useEffect(() => {
    if (status !== 'loading' && status !== 'dismissed' && isVisible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [status, isVisible]);

  const checkVerificationStatus = async () => {
    const auth = getAuth();
    const userId = auth.currentUser?.uid;
    
    if (!userId) {
      setStatus('unverified');
      return;
    }

    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      const userData = userDoc.data();

      if (userData?.identityVerified) {
        setStatus('verified');
        onVerified?.();
      } else if (userData?.verificationBannerDismissed) {
        // Check if dismissal has expired (show again after 7 days)
        const dismissedAt = userData.verificationBannerDismissedAt?.toDate();
        const daysSinceDismissed = dismissedAt 
          ? (Date.now() - dismissedAt.getTime()) / (1000 * 60 * 60 * 24)
          : 999;
        
        if (daysSinceDismissed > 7) {
          setStatus('unverified');
        } else {
          setStatus('dismissed');
          setIsVisible(false);
        }
      } else {
        setStatus('unverified');
      }
    } catch (error) {
      console.error('Error checking verification status:', error);
      setStatus('unverified');
    }
  };

  const handleDismiss = async () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: -20,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsVisible(false);
    });

    // Persist dismissal
    const auth = getAuth();
    const userId = auth.currentUser?.uid;
    if (userId) {
      try {
        await setDoc(doc(db, 'users', userId), {
          verificationBannerDismissed: true,
          verificationBannerDismissedAt: new Date(),
        }, { merge: true });
      } catch (error) {
        console.error('Error saving dismissal:', error);
      }
    }
  };

  const handlePress = () => {
    navigation.navigate('VerifyIdentity');
  };

  // Don't render if loading, dismissed, or verified (for unverified variant)
  if (status === 'loading' || !isVisible) {
    return null;
  }

  // Verified badge variant
  if (status === 'verified') {
    if (variant === 'compact') {
      return (
        <View style={[styles.verifiedBadgeCompact, style]}>
          <Ionicons name="shield-checkmark" size={14} color="#22c55e" />
          <Text style={styles.verifiedTextCompact}>Verified</Text>
        </View>
      );
    }
    
    return (
      <View style={[styles.verifiedBanner, style]}>
        <View style={styles.verifiedIcon}>
          <Ionicons name="shield-checkmark" size={20} color="#22c55e" />
        </View>
        <Text style={styles.verifiedText}>Identity Verified</Text>
      </View>
    );
  }

  // Unverified variants
  if (variant === 'compact') {
    return (
      <Animated.View 
        style={[
          styles.compactBanner,
          style,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
        ]}
      >
        <TouchableOpacity 
          style={styles.compactContent}
          onPress={handlePress}
          activeOpacity={0.7}
        >
          <View style={styles.compactIcon}>
            <Ionicons name="shield-outline" size={18} color="#6366f1" />
          </View>
          <Text style={styles.compactText}>Get verified</Text>
          <Ionicons name="chevron-forward" size={16} color="#6366f1" />
        </TouchableOpacity>
      </Animated.View>
    );
  }

  if (variant === 'card') {
    return (
      <Animated.View 
        style={[
          styles.cardBanner,
          style,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
        ]}
      >
        <TouchableOpacity 
          style={styles.cardContent}
          onPress={handlePress}
          activeOpacity={0.8}
        >
          <View style={styles.cardHeader}>
            <View style={styles.cardIconContainer}>
              <Ionicons name="shield-checkmark-outline" size={28} color="#6366f1" />
            </View>
            {dismissible && (
              <TouchableOpacity 
                style={styles.dismissButton}
                onPress={handleDismiss}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={20} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </View>
          
          <Text style={styles.cardTitle}>Unlock Premium Rentals</Text>
          <Text style={styles.cardSubtitle}>
            Verify your identity to rent items over $500 and build trust with owners
          </Text>
          
          <View style={styles.cardButton}>
            <Text style={styles.cardButtonText}>Verify Now</Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // Default variant
  return (
    <Animated.View 
      style={[
        styles.defaultBanner,
        style,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
      ]}
    >
      <TouchableOpacity 
        style={styles.defaultContent}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <View style={styles.defaultLeft}>
          <View style={styles.defaultIconContainer}>
            <Ionicons name="shield-checkmark-outline" size={24} color="#fff" />
          </View>
          <View style={styles.defaultTextContainer}>
            <Text style={styles.defaultTitle}>Get Verified</Text>
            <Text style={styles.defaultSubtitle}>
              Unlock all items & build trust
            </Text>
          </View>
        </View>
        
        <View style={styles.defaultRight}>
          <View style={styles.defaultArrowContainer}>
            <Ionicons name="arrow-forward" size={18} color="#6366f1" />
          </View>
        </View>
      </TouchableOpacity>
      
      {dismissible && (
        <TouchableOpacity 
          style={styles.defaultDismiss}
          onPress={handleDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  // Default variant styles
  defaultBanner: {
    backgroundColor: '#6366f1',
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    overflow: 'hidden',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  defaultContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  defaultLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  defaultIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  defaultTextContainer: {
    flex: 1,
  },
  defaultTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  defaultSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
  },
  defaultRight: {
    marginLeft: 12,
  },
  defaultArrowContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  defaultDismiss: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 4,
  },

  // Compact variant styles
  compactBanner: {
    backgroundColor: '#eef2ff',
    borderRadius: 20,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  compactContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  compactIcon: {
    marginRight: 6,
  },
  compactText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6366f1',
    marginRight: 4,
  },

  // Card variant styles
  cardBanner: {
    backgroundColor: '#fff',
    borderRadius: 20,
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardContent: {
    padding: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  cardIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dismissButton: {
    padding: 4,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: 15,
    color: '#64748b',
    lineHeight: 22,
    marginBottom: 20,
  },
  cardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  cardButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginRight: 8,
  },

  // Verified badge styles
  verifiedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  verifiedIcon: {
    marginRight: 10,
  },
  verifiedText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#16a34a',
  },
  verifiedBadgeCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  verifiedTextCompact: {
    fontSize: 13,
    fontWeight: '600',
    color: '#16a34a',
    marginLeft: 4,
  },
});

export default VerificationBanner;
