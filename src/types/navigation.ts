// src/types/navigation.ts
// Navigation type definitions

export type RootStackParamList = {
  // Auth screens
  Login: undefined;
  Register: undefined;
  
  // Onboarding
  Onboarding: undefined;

  // Main tabs
  MainTabs: undefined;
  Home: undefined;
  Rentals: undefined;
  AddItem: { editItemId?: string } | undefined;
  Messages: undefined;
  Profile: undefined;
  
  // Item screens
  ItemDetails: { itemId: string };
  BookItem: { itemId: string };
  
  // My Items
  MyItems: undefined;
  
  // Payment screens
  Checkout: { 
    rentalId: string; 
    itemId?: string;
    amount?: number;
  };
  PaymentMethods: undefined;
  
  // Chat
  Chat: { 
    conversationId: string;
    otherUserId?: string;
    otherUserName?: string;
  };
  
  // Earnings & Stripe Connect
  Earnings: undefined;
  StripeConnect: undefined;
  
  // Identity Verification
  VerifyIdentity: {
    rentalId?: string;
    returnTo?: string;
  } | undefined;
  
  // Admin
  AdminDashboard: undefined;
  
  // Disputes
  ReportDamage: { rentalId: string };
  MyDisputes: undefined;
  DisputeDetails: { disputeId: string };
  
  // Reviews
  CreateReview: { 
    rentalId: string;
    itemId: string;
    revieweeId: string;
  };
  
  // Notifications
  Notifications: undefined;

  // Handoff (Pick-up & Return)
  Handoff: {
    rentalId: string;
    mode: 'pickup' | 'return';
  };

  // Meeting Location
  MeetingLocation: {
    rentalId: string;
  };

  // Legal & Support
  PrivacyPolicy: undefined;
  TermsOfService: undefined;
  HelpCenter: undefined;
  SupportChat: undefined;

  // Edit Profile (Issue #18)
  EditProfile: undefined;

  // Wishlist / Saved Items
  Wishlist: undefined;

  // Public Profile (Issue #16)
  PublicProfile: {
    userId: string;
    userName?: string;
  };
};

// Helper type for useNavigation hook
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}