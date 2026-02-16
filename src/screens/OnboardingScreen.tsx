// src/screens/OnboardingScreen.tsx — First-time user walkthrough
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

const Colors = {
  primary: '#F5C542',
  secondary: '#2E86AB',
  success: '#46A758',
  text: '#212529',
  white: '#FFFFFF',
  lightBg: '#F8F9FA',
};

interface OnboardingSlide {
  id: string;
  icon: string;
  iconColor: string;
  title: string;
  subtitle: string;
  description: string;
  isWelcome?: boolean;
}

const slides: OnboardingSlide[] = [
  {
    id: '0',
    icon: 'cube',
    iconColor: Colors.primary,
    title: 'ShareStash',
    subtitle: 'Rent anything from people nearby',
    description:
      'Welcome! Here\'s a quick look at how ShareStash works. Swipe through to get started.',
    isWelcome: true,
  },
  {
    id: '1',
    icon: 'search',
    iconColor: Colors.secondary,
    title: 'Discover Nearby Items',
    subtitle: 'Find what you need',
    description:
      'Browse items available for rent in your area. Filter by category, price, and distance to find the perfect item for your project or adventure.',
  },
  {
    id: '2',
    icon: 'add-circle',
    iconColor: Colors.success,
    title: 'List Your Own Items',
    subtitle: 'Earn money from things you own',
    description:
      'Have a power drill, camera, or kayak sitting around? List it in minutes, set your price, and start earning money when you\'re not using it.',
  },
  {
    id: '3',
    icon: 'calendar',
    iconColor: Colors.primary,
    title: 'Book & Schedule',
    subtitle: 'Rent by the hour, day, week, or month',
    description:
      'Choose your rental period, pick a safe meeting spot, and book securely through the app. Flexible scheduling to fit your needs.',
  },
  {
    id: '4',
    icon: 'camera',
    iconColor: '#8B5CF6',
    title: 'Safe Handoffs',
    subtitle: 'Photo evidence protects everyone',
    description:
      'Document item condition at pickup and return with photos. Our mutual confirmation system and dispute protection keep both parties safe.',
  },
  {
    id: '5',
    icon: 'shield-checkmark',
    iconColor: Colors.secondary,
    title: 'Verified & Secure',
    subtitle: 'Rent with confidence',
    description:
      'Identity verification, secure payments via Stripe, in-app messaging, and our 48-hour dispute window give you peace of mind on every rental.',
  },
];

const ONBOARDING_KEY = '@sharestash_onboarding_complete';

export async function hasCompletedOnboarding(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(ONBOARDING_KEY);
    return value === 'true';
  } catch {
    return false;
  }
}

export async function markOnboardingComplete(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
  } catch (e) {
    console.error('Error saving onboarding state:', e);
  }
}

export async function resetOnboarding(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ONBOARDING_KEY);
  } catch (e) {
    console.error('Error resetting onboarding:', e);
  }
}

export default function OnboardingScreen({ navigation }: any) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex(currentIndex + 1);
    } else {
      completeOnboarding();
    }
  };

  const handleSkip = () => {
    completeOnboarding();
  };

  const completeOnboarding = async () => {
    await markOnboardingComplete();
    navigation.replace('MainTabs');
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index ?? 0);
    }
  }).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const renderSlide = ({ item }: { item: OnboardingSlide }) => {
    if (item.isWelcome) {
      return (
        <View style={styles.slide}>
          {/* Logo placeholder — replace with your actual logo image */}
          {/* <Image source={require('../assets/logo.png')} style={styles.welcomeLogo} /> */}
          <View style={styles.welcomeLogoPlaceholder}>
            <Ionicons name="cube" size={56} color={Colors.primary} />
          </View>
          <Text style={styles.welcomeTitle}>{item.title}</Text>
          <View style={styles.welcomeDivider} />
          <Text style={styles.welcomeSubtitle}>{item.subtitle}</Text>
          <Text style={styles.welcomeDescription}>{item.description}</Text>
        </View>
      );
    }

    return (
      <View style={styles.slide}>
        <View style={styles.iconContainer}>
          <View style={[styles.iconCircle, { backgroundColor: item.iconColor + '18' }]}>
            <Ionicons name={item.icon as any} size={64} color={item.iconColor} />
          </View>
        </View>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.subtitle}>{item.subtitle}</Text>
        <Text style={styles.description}>{item.description}</Text>
      </View>
    );
  };

  const renderDots = () => (
    <View style={styles.dotsContainer}>
      {slides.map((_, index) => {
        const inputRange = [
          (index - 1) * width,
          index * width,
          (index + 1) * width,
        ];
        const dotWidth = scrollX.interpolate({
          inputRange,
          outputRange: [8, 24, 8],
          extrapolate: 'clamp',
        });
        const dotOpacity = scrollX.interpolate({
          inputRange,
          outputRange: [0.3, 1, 0.3],
          extrapolate: 'clamp',
        });
        return (
          <Animated.View
            key={index}
            style={[
              styles.dot,
              {
                width: dotWidth,
                opacity: dotOpacity,
                backgroundColor: Colors.primary,
              },
            ]}
          />
        );
      })}
    </View>
  );

  const isLast = currentIndex === slides.length - 1;

  return (
    <SafeAreaView style={styles.container}>
      {/* Skip button */}
      {!isLast && (
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={slides}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        scrollEventThrottle={16}
      />

      {/* Bottom section */}
      <View style={styles.bottomSection}>
        {renderDots()}

        <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
          <Text style={styles.nextButtonText}>
            {isLast ? 'Get Started' : 'Next'}
          </Text>
          {!isLast && (
            <Ionicons name="arrow-forward" size={20} color={Colors.text} style={{ marginLeft: 6 }} />
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  skipButton: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  skipText: {
    fontSize: 16,
    color: '#999',
    fontWeight: '500',
  },
  slide: {
    width,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 80,
  },
  iconContainer: {
    marginBottom: 32,
  },
  iconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 17,
    color: Colors.secondary,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  welcomeLogoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 30,
    backgroundColor: Colors.primary + '18',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  welcomeLogo: {
    width: 120,
    height: 120,
    borderRadius: 30,
    marginBottom: 24,
  },
  welcomeTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  welcomeDivider: {
    width: 60,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.primary,
    marginBottom: 16,
  },
  welcomeSubtitle: {
    fontSize: 19,
    color: Colors.secondary,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
  },
  welcomeDescription: {
    fontSize: 15,
    color: '#999',
    textAlign: 'center',
    lineHeight: 22,
  },
  bottomSection: {
    paddingHorizontal: 24,
    paddingBottom: 30,
    alignItems: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  nextButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  nextButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
  },
});