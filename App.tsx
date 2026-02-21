// App.tsx
// Updated with VerifyIdentityScreen (web-based) and deep link handling
// ADDED: Verification reminder for abandoned verifications
// ADDED: MyItemsScreen for managing user's items
// FIXED: AddItemScreen type error in Tab Navigator
import 'react-native-gesture-handler';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Linking, Alert } from 'react-native';
import { NavigationContainer, LinkingOptions, NavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { StripeProvider } from '@stripe/stripe-react-native';
import { AuthProvider, AuthContext } from './src/contexts/AuthContext';
import NotificationService from './src/services/NotificationService';
import { initializeLanguage, t as translate } from './src/i18n';
import * as Notifications from 'expo-notifications';

// Initialize language preference (loads from AsyncStorage)
initializeLanguage();

// Configure foreground notification behavior - show banner even when app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Auth Screens
import LoginScreen from './src/screens/auth/LoginScreen';
import RegisterScreen from './src/screens/auth/RegisterScreen';

// Main Screens
import HomeScreen from './src/screens/HomeScreen';
import ItemDetailsScreen from './src/screens/ItemDetailsScreen';
import BookItemScreen from './src/screens/BookItemScreen';
import CheckoutScreen from './src/screens/CheckoutScreen';
import RentalsScreen from './src/screens/RentalsScreen';
import MessagesScreen from './src/screens/MessagesScreen';
import ChatScreen from './src/screens/ChatScreen';
import AddItemScreen from './src/screens/AddItemScreen';
import PaymentMethodScreen from './src/screens/PaymentMethodScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import AdminDashboard from './src/screens/AdminDashboard';
import ReportDamageScreen from './src/screens/ReportDamageScreen';
import MyDisputesScreen from './src/screens/MyDisputesScreen';
import DisputeDetailsScreen from './src/screens/DisputeDetailsScreen';
import EarningsScreen from './src/screens/EarningsScreen';
import StripeConnectScreen from './src/screens/StripeConnectScreen';
import CreateReviewScreen from './src/screens/CreateReviewScreen';
import NotificationsScreen from './src/screens/NotificationScreens';
import MyItemsScreen from './src/screens/MyItemsScreen';
import EditProfileScreen from './src/screens/EditProfileScreen';
import PublicProfileScreen from './src/screens/PublicProfileScreen';
import HandoffScreen from './src/screens/HandoffScreen';
import MeetingLocationScreen from './src/screens/MeetingLocationScreen';
import PrivacyPolicyScreen from './src/screens/PrivacyPolicyScreen';
import TermsOfServiceScreen from './src/screens/TermsOfServiceScreen';
import HelpCenterScreen from './src/screens/HelpCenterScreen';
import SupportChatScreen from './src/screens/SupportChatScreen';
import WishlistScreen from './src/screens/WishlistScreen';
import OnboardingScreen, { hasCompletedOnboarding } from './src/screens/OnboardingScreen';

// Verification hook for abandoned verification reminders
import { useVerificationReminder } from './src/hooks/useVerification';

// Verification Screen (uses web-based Stripe Identity, no native SDK needed)
import VerifyIdentityScreen from './src/screens/VerifyIdentityScreen';

// Import navigation types
import { RootStackParamList } from './src/types/navigation';

// ============================================================================
// CONFIGURATION
// ============================================================================

const STRIPE_PUBLISHABLE_KEY = 'pk_test_51SuwcDCTtFP9wxSLgirWxC3gbmyMbh9QwrKfhxH9XXR5ELxbzez4BpE24mz2NuaBEsOYK8LackswXL8YYOFn4Y0E00j1emDqgm';

// Deep linking configuration
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['peerrentalapp://', 'https://peerrentalapp.com'],
  config: {
    screens: {
      // Stripe Connect deep links
      StripeConnect: {
        path: 'stripe-connect-return',
      },
      // Identity verification deep link
      VerifyIdentity: {
        path: 'identity-verification-complete',
      },
      // Payment completion deep link
      Checkout: {
        path: 'payment-complete',
      },
      // Other deep links
      ItemDetails: 'item/:itemId',
      Chat: 'chat/:conversationId',
      Rentals: 'rentals',
      Notifications: 'notifications',
    },
  },
};

// ============================================================================
// NAVIGATORS
// ============================================================================

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'AddItem') {
            iconName = focused ? 'add-circle' : 'add-circle-outline';
          } else if (route.name === 'Rentals') {
            iconName = focused ? 'calendar' : 'calendar-outline';
          } else if (route.name === 'Messages') {
            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#F5C542',
        tabBarInactiveTintColor: 'gray',
        headerShown: false,
        tabBarStyle: styles.tabBar,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: translate('tabs.home') }} />
      <Tab.Screen name="Rentals" component={RentalsScreen} options={{ tabBarLabel: translate('tabs.rentals') }} />
      <Tab.Screen 
        name="AddItem" 
        options={{ tabBarLabel: translate('tabs.addItem') }}
      >
        {(props: any) => <AddItemScreen {...props} />}
      </Tab.Screen>
      <Tab.Screen name="Messages" component={MessagesScreen} options={{ tabBarLabel: translate('tabs.messages') }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: translate('tabs.profile') }} />
    </Tab.Navigator>
  );
}

// ============================================================================
// VERIFICATION REMINDER COMPONENT
// This component handles showing reminders for abandoned verifications
// It must be inside NavigationContainer and only rendered when user is logged in
// ============================================================================

function VerificationReminderHandler() {
  // This hook will automatically show a reminder alert if the user
  // started verification but didn't complete it (after 2 second delay)
  // It won't show the reminder more than once per 24 hours
  useVerificationReminder();
  
  return null; // This component doesn't render anything visible
}

// ============================================================================
// MAIN APP
// ============================================================================

export default function App() {
  return (
    <AuthProvider>
      <StripeProvider 
        publishableKey={STRIPE_PUBLISHABLE_KEY}
        merchantIdentifier="merchant.com.peerrentalapp"
        urlScheme="peerrentalapp"
      >
        <AppContent />
      </StripeProvider>
    </AuthProvider>
  );
}

function AppContent() {
  const { user, loading } = React.useContext(AuthContext);
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  // Check onboarding status when user logs in
  useEffect(() => {
    if (user) {
      hasCompletedOnboarding().then(done => setOnboardingDone(done));
    } else {
      setOnboardingDone(null);
    }
  }, [user]);

  // Initialize notifications
  useEffect(() => {
    if (user) {
      NotificationService.initialize(user.id);

      const listeners = NotificationService.setupNotificationListeners(
        (notification) => {
          console.log('📬 Notification received:', notification);
        },
        (response) => {
          console.log('👆 Notification tapped:', response);
          const data = response.notification.request.content.data;
          console.log('Notification data:', data);
        }
      );

      return () => listeners.remove();
    }
  }, [user]);

  // Handle deep links
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      console.log('🔗 Deep link received:', event.url);
      
      const url = event.url;
      
      // Handle Stripe Connect return
      if (url.includes('stripe-connect-return')) {
        console.log('✅ Stripe Connect onboarding completed');
        // Navigation will be handled automatically by linking config
        // Show success message after a brief delay
        setTimeout(() => {
          Alert.alert(
            'Setup Complete',
            'Checking your account status...',
            [{ text: 'OK' }]
          );
        }, 500);
      }
      
      // Handle Stripe Connect refresh (session expired)
      if (url.includes('stripe-connect-refresh')) {
        console.log('🔄 Stripe Connect session expired, need to restart');
        Alert.alert(
          'Session Expired',
          'Your setup session expired. Please try again.',
          [{ text: 'OK' }]
        );
        // Navigate to StripeConnect screen to restart
        if (navigationRef.current) {
          navigationRef.current.navigate('StripeConnect');
        }
      }
      
      // Handle Identity verification complete
      if (url.includes('identity-verification-complete')) {
        console.log('✅ Identity verification completed');
        setTimeout(() => {
          Alert.alert(
            'Verification Complete',
            'Checking your verification status...',
            [{ text: 'OK' }]
          );
        }, 500);
      }
      
      // Handle Payment complete
      if (url.includes('payment-complete')) {
        console.log('✅ Payment completed');
        setTimeout(() => {
          Alert.alert(
            'Payment Successful',
            'Your payment has been processed.',
            [{ text: 'OK' }]
          );
        }, 500);
      }
    };

    // Listen for deep links while app is open
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Check if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('🚀 App opened via deep link:', url);
        handleDeepLink({ url });
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  if (loading || (user && onboardingDone === null)) {
    return null;
  }

  return (
    <NavigationContainer 
      ref={navigationRef}
      linking={linking}
      onStateChange={(state) => {
        // Optional: Log navigation state changes for debugging
        // console.log('Navigation state:', state);
      }}
    >
      {/* Verification Reminder - only active when user is logged in */}
      {user && <VerificationReminderHandler />}
      
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        ) : (
          <>
            {!onboardingDone && (
              <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            )}
            <Stack.Screen name="MainTabs" component={MainTabs} />
            {onboardingDone && (
              <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            )}
            <Stack.Screen name="ItemDetails" component={ItemDetailsScreen} />
            <Stack.Screen name="BookItem" component={BookItemScreen} />
            <Stack.Screen name="Checkout" component={CheckoutScreen} />
            <Stack.Screen name="PaymentMethods" component={PaymentMethodScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="AddItem">
              {(props: any) => <AddItemScreen {...props} />}
            </Stack.Screen>
            <Stack.Screen name="MyItems" component={MyItemsScreen} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
            <Stack.Screen name="PublicProfile" component={PublicProfileScreen} />
            <Stack.Screen name="Earnings" component={EarningsScreen} />
            <Stack.Screen name="StripeConnect" component={StripeConnectScreen} />
            <Stack.Screen name="AdminDashboard" component={AdminDashboard} />
            <Stack.Screen name="ReportDamage" component={ReportDamageScreen} />
            <Stack.Screen name="MyDisputes" component={MyDisputesScreen} />
            <Stack.Screen name="DisputeDetails" component={DisputeDetailsScreen} />
            <Stack.Screen name="CreateReview" component={CreateReviewScreen} />
            <Stack.Screen name="Handoff" component={HandoffScreen} />
            <Stack.Screen name="MeetingLocation" component={MeetingLocationScreen} />
            <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
            <Stack.Screen name="TermsOfService" component={TermsOfServiceScreen} />
            <Stack.Screen name="HelpCenter" component={HelpCenterScreen} />
            <Stack.Screen name="SupportChat" component={SupportChatScreen} />
            <Stack.Screen name="Wishlist" component={WishlistScreen} />
            
            {/* Identity Verification Screen */}
            <Stack.Screen 
              name="VerifyIdentity" 
              component={VerifyIdentityScreen}
              options={{
                headerShown: true,
                title: 'Verify Identity',
                headerStyle: { backgroundColor: '#F5C542' },
                headerTintColor: '#000',
                headerTitleStyle: { fontWeight: 'bold' },
              }}
            />
            
            <Stack.Screen 
              name="Notifications" 
              component={NotificationsScreen}
              options={{ 
                headerShown: true,
                title: 'Notifications',
                headerStyle: { backgroundColor: '#F5C542' },
                headerTintColor: '#000',
                headerTitleStyle: { fontWeight: 'bold' },
              }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 60,
    paddingBottom: 8,
  },
});