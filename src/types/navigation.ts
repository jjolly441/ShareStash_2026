// src/types/navigation.ts
// Navigation type definitions

export type RootStackParamList = {
  // Auth screens
  Login: undefined;
  Register: undefined;
  
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
};

// Helper type for useNavigation hook
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}