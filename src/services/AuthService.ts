// src/services/AuthService.ts - Firebase version
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail,
  } from 'firebase/auth';
  import { doc, setDoc, getDoc } from 'firebase/firestore';
  import { auth, db } from '../config/firebase';
  
  export interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    createdAt: string;
    role?: 'user' | 'admin'; // Optional role field
  }
  
  export interface LoginCredentials {
    email: string;
    password: string;
  }
  
  export interface RegisterData {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }
  
  class AuthService {
    private static instance: AuthService;
    private currentUser: User | null = null;
  
    static getInstance(): AuthService {
      if (!AuthService.instance) {
        AuthService.instance = new AuthService();
      }
      return AuthService.instance;
    }
  
    async login(credentials: LoginCredentials): Promise<{ success: boolean; user?: User; error?: string }> {
      try {
        // Sign in with Firebase Auth
        const userCredential = await signInWithEmailAndPassword(
          auth,
          credentials.email,
          credentials.password
        );
  
        // Get user data from Firestore
        const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
        
        if (userDoc.exists()) {
          const userData = userDoc.data() as User;
          this.currentUser = userData;
          return { success: true, user: userData };
        } else {
          return { success: false, error: 'User data not found' };
        }
      } catch (error: any) {
        console.error('Login error:', error);
        
        let errorMessage = 'Login failed. Please try again.';
        if (error.code === 'auth/user-not-found') {
          errorMessage = 'No account found with this email';
        } else if (error.code === 'auth/wrong-password') {
          errorMessage = 'Incorrect password';
        } else if (error.code === 'auth/invalid-email') {
          errorMessage = 'Invalid email address';
        } else if (error.code === 'auth/too-many-requests') {
          errorMessage = 'Too many failed attempts. Please try again later';
        } else if (error.code === 'auth/invalid-credential') {
          errorMessage = 'Invalid email or password';
        }
        
        return { success: false, error: errorMessage };
      }
    }
  
    async register(data: RegisterData): Promise<{ success: boolean; user?: User; error?: string }> {
      try {
        // Create Firebase Auth user
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          data.email,
          data.password
        );
  
        // Create user document in Firestore
        const newUser: User = {
          id: userCredential.user.uid,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          createdAt: new Date().toISOString(),
          role: 'user' // Default role
        };
  
        await setDoc(doc(db, 'users', userCredential.user.uid), newUser);
        
        this.currentUser = newUser;
        return { success: true, user: newUser };
      } catch (error: any) {
        console.error('Registration error:', error);
        
        let errorMessage = 'Registration failed. Please try again.';
        if (error.code === 'auth/email-already-in-use') {
          errorMessage = 'An account with this email already exists';
        } else if (error.code === 'auth/invalid-email') {
          errorMessage = 'Invalid email address';
        } else if (error.code === 'auth/weak-password') {
          errorMessage = 'Password should be at least 6 characters';
        }
        
        return { success: false, error: errorMessage };
      }
    }
  
    async logout(): Promise<void> {
      try {
        await signOut(auth);
        this.currentUser = null;
      } catch (error) {
        console.error('Logout failed:', error);
        throw error;
      }
    }
  
    async checkAuthStatus(): Promise<{ isLoggedIn: boolean; user?: User }> {
      return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          if (firebaseUser) {
            try {
              const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
              if (userDoc.exists()) {
                const userData = userDoc.data() as User;
                this.currentUser = userData;
                resolve({ isLoggedIn: true, user: userData });
              } else {
                resolve({ isLoggedIn: false });
              }
            } catch (error) {
              console.error('Error fetching user data:', error);
              resolve({ isLoggedIn: false });
            }
          } else {
            this.currentUser = null;
            resolve({ isLoggedIn: false });
          }
          unsubscribe();
        });
      });
    }
  
    getCurrentUser(): User | null {
      return this.currentUser;
    }

    async resetPassword(email: string): Promise<{ success: boolean; error?: string }> {
      try {
        await sendPasswordResetEmail(auth, email);
        return { success: true };
      } catch (error: any) {
        console.error('Password reset error:', error);
        
        let errorMessage = 'Failed to send reset email. Please try again.';
        if (error.code === 'auth/user-not-found') {
          errorMessage = 'No account found with this email address';
        } else if (error.code === 'auth/invalid-email') {
          errorMessage = 'Please enter a valid email address';
        } else if (error.code === 'auth/too-many-requests') {
          errorMessage = 'Too many requests. Please try again later';
        }
        
        return { success: false, error: errorMessage };
      }
    }
  
    // Validation helpers
    static validateEmail(email: string): boolean {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    }
  
    static validatePassword(password: string): { isValid: boolean; errors: string[] } {
      const errors: string[] = [];
      
      if (password.length < 6) {
        errors.push('Password must be at least 6 characters');
      }
      
      return {
        isValid: errors.length === 0,
        errors
      };
    }
  
    static validateRegistration(data: RegisterData & { confirmPassword: string }): { isValid: boolean; errors: string[] } {
      const errors: string[] = [];
      
      if (!data.firstName.trim()) {
        errors.push('First name is required');
      }
      
      if (!data.lastName.trim()) {
        errors.push('Last name is required');
      }
      
      if (!this.validateEmail(data.email)) {
        errors.push('Please enter a valid email address');
      }
      
      const passwordValidation = this.validatePassword(data.password);
      if (!passwordValidation.isValid) {
        errors.push(...passwordValidation.errors);
      }
      
      if (data.password !== data.confirmPassword) {
        errors.push('Passwords do not match');
      }
      
      return {
        isValid: errors.length === 0,
        errors
      };
    }
  }
  
  export default AuthService.getInstance();
  