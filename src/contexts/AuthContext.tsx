// src/contexts/AuthContext.tsx
// UPDATED: Added KYC fields (optional for backward compatibility) and refreshUser method
import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import ReferralService from '../services/ReferralService';

// ============================================================================
// USER INTERFACE - KYC fields are OPTIONAL for backward compatibility
// ============================================================================

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'user' | 'admin';
  stripeCustomerId?: string;
  stripeConnectAccountId?: string;
  createdAt: string;
  
  // KYC/Verification Fields (ALL OPTIONAL for backward compatibility)
  phoneNumber?: string;
  phoneVerified?: boolean;
  identityVerified?: boolean;
  identityVerificationDate?: string;
  idDocumentType?: 'drivers_license' | 'passport' | 'national_id';
  verificationStatus?: 'unverified' | 'phone_verified' | 'fully_verified' | 'rejected';
  verificationAttempts?: number;
  
  // Ratings (from reviews system)
  averageRating?: number;
  totalReviews?: number;

  // Referral
  referralCode?: string;       // This user's unique referral code
  referredBy?: string;         // The referral code they used at signup
}

// ============================================================================
// CONTEXT TYPE
// ============================================================================

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, firstName: string, lastName: string, referralCode?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
  /** Refresh user data from Firestore (call after verification updates) */
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => ({ success: false }),
  register: async () => ({ success: false }),
  logout: async () => {},
  setUser: () => {},
  refreshUser: async () => {},
});

// ============================================================================
// HELPER: Map Firestore data to User object
// ============================================================================

const mapFirestoreToUser = (uid: string, email: string, data: any): User => {
  return {
    id: uid,
    email: email,
    firstName: data.firstName || '',
    lastName: data.lastName || '',
    role: data.role || 'user',
    stripeCustomerId: data.stripeCustomerId,
    stripeConnectAccountId: data.stripeConnectAccountId,
    createdAt: data.createdAt || new Date().toISOString(),
    
    // KYC fields with defaults (optional)
    phoneNumber: data.phoneNumber,
    phoneVerified: data.phoneVerified ?? false,
    identityVerified: data.identityVerified ?? false,
    identityVerificationDate: data.identityVerificationDate,
    idDocumentType: data.idDocumentType,
    verificationStatus: data.verificationStatus ?? 'unverified',
    verificationAttempts: data.verificationAttempts ?? 0,
    
    // Ratings
    averageRating: data.averageRating,
    totalReviews: data.totalReviews,
  };
};

// ============================================================================
// AUTH PROVIDER
// ============================================================================

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // ==========================================================================
  // AUTH STATE LISTENER
  // ==========================================================================

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Get user data from Firestore
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setUser(mapFirestoreToUser(
              firebaseUser.uid,
              firebaseUser.email!,
              userData
            ));
          } else {
            // User exists in Auth but not in Firestore - shouldn't happen normally
            console.warn('User document not found in Firestore');
            setUser(null);
          }
        } catch (error) {
          console.error('Error loading user data:', error);
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // ==========================================================================
  // LOGIN
  // ==========================================================================

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      // Get user data from Firestore
      const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
      
      if (!userDoc.exists()) {
        return { success: false, error: 'User data not found' };
      }

      const userData = userDoc.data();
      setUser(mapFirestoreToUser(
        userCredential.user.uid,
        userCredential.user.email!,
        userData
      ));

      return { success: true };
    } catch (error: any) {
      console.error('Login error:', error);
      
      let errorMessage = 'Login failed';
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address';
      } else if (error.code === 'auth/invalid-credential') {
        errorMessage = 'Invalid email or password';
      }

      return { success: false, error: errorMessage };
    }
  };

  // ==========================================================================
  // REGISTER
  // ==========================================================================

  const register = async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    referralCode?: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // Create auth user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      // Create user document in Firestore with KYC defaults
      const userData: any = {
        email,
        firstName,
        lastName,
        role: 'user',
        createdAt: new Date().toISOString(),
        
        // Initialize KYC fields
        phoneVerified: false,
        identityVerified: false,
        verificationStatus: 'unverified',
        verificationAttempts: 0,
      };

      // If a referral code was provided, store it
      if (referralCode && referralCode.trim()) {
        userData.referredBy = referralCode.toUpperCase().trim();
      }

      await setDoc(doc(db, 'users', userCredential.user.uid), userData);

      // Process referral (non-blocking — don't fail registration if this errors)
      if (referralCode && referralCode.trim()) {
        try {
          const validation = await ReferralService.validateReferralCode(
            referralCode,
            userCredential.user.uid
          );
          if (validation.valid && validation.referrerProfile) {
            await ReferralService.processReferral(
              validation.referrerProfile.userId,
              userCredential.user.uid,
              referralCode.toUpperCase().trim()
            );
          }
        } catch (refError) {
          console.warn('Referral processing failed (non-critical):', refError);
        }
      }

      setUser(mapFirestoreToUser(
        userCredential.user.uid,
        email,
        userData
      ));

      return { success: true };
    } catch (error: any) {
      console.error('Registration error:', error);
      
      let errorMessage = 'Registration failed';
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'An account with this email already exists';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password should be at least 6 characters';
      }

      return { success: false, error: errorMessage };
    }
  };

  // ==========================================================================
  // LOGOUT
  // ==========================================================================

  const logout = async (): Promise<void> => {
    try {
      await signOut(auth);
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // ==========================================================================
  // REFRESH USER - For KYC updates
  // ==========================================================================

  const refreshUser = async (): Promise<void> => {
    const currentUser = auth.currentUser;
    
    if (!currentUser) {
      console.warn('No authenticated user to refresh');
      return;
    }

    try {
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setUser(mapFirestoreToUser(
          currentUser.uid,
          currentUser.email!,
          userData
        ));
      }
    } catch (error) {
      console.error('Error refreshing user data:', error);
    }
  };

  // ==========================================================================
  // CONTEXT VALUE
  // ==========================================================================

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    setUser,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// ============================================================================
// HOOK
// ============================================================================

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};