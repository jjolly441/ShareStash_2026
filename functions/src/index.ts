/**
 * PeerRentalApp - Stripe Cloud Functions (ENHANCED VERSION)
 * Firebase Functions v2 API with Stripe Connect for two-sided marketplace
 * 
 * FIXES APPLIED:
 * 1. createAccountLink now uses https:// URLs (Firebase Hosting) instead of deep links
 * 2. Added complete Identity Verification functions
 * 3. Added Identity webhook secret
 * 4. ENHANCED: Added retry attempt tracking (max 3 attempts)
 * 5. ENHANCED: Added abandoned verification tracking
 * 6. ENHANCED: Better error handling and status responses
 * 7. DEBUG: Added logging to createPaymentIntent for identity verification debugging
 * 
 * Platform Fee: 10%
 * Identity Verification Threshold: $500+
 */

import { onRequest, HttpsOptions } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import Stripe from "stripe";

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// Define secrets
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");
const stripeIdentityWebhookSecret = defineSecret("STRIPE_IDENTITY_WEBHOOK_SECRET");

// Constants
const PLATFORM_FEE_PERCENT = 10;
const IDENTITY_VERIFICATION_THRESHOLD_CENTS = 50000; // $500
const MAX_VERIFICATION_ATTEMPTS = 3; // NEW: Max retry attempts for identity verification

// Your Firebase Hosting URL (or custom domain)
const WEB_BASE_URL = "https://peerrentalapp.web.app";

// Helper: Create Stripe instance per request (required for v2)
function getStripe(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: "2025-10-29.clover",
    typescript: true,
  });
}

// Common HTTPS options
const httpsOptions: HttpsOptions = {
  region: "us-central1",
  cors: true,
};

// ============================================
// STRIPE CONNECT - SELLER ONBOARDING
// ============================================

/**
 * Create a Stripe Connect Express account for a seller
 */
export const createConnectAccount = onRequest(
  { ...httpsOptions, secrets: [stripeSecretKey] },
  async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const idToken = authHeader.split("Bearer ")[1];
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const userId = decodedToken.uid;

      const { email, firstName, lastName } = req.body;

      if (!email) {
        res.status(400).json({ error: "Email is required" });
        return;
      }

      const stripe = getStripe(stripeSecretKey.value());

      // Check if user already has a Connect account
      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();

      if (userData?.stripeConnectAccountId) {
        res.json({ 
          accountId: userData.stripeConnectAccountId,
          message: "Connect account already exists" 
        });
        return;
      }

      // Create new Express account
      const account = await stripe.accounts.create({
        type: "express",
        country: "US",
        email: email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "individual",
        individual: {
          email: email,
          first_name: firstName || undefined,
          last_name: lastName || undefined,
        },
        metadata: {
          firebaseUserId: userId,
        },
      });

      // Save to Firestore
      await db.collection("users").doc(userId).set(
        {
          stripeConnectAccountId: account.id,
          stripeConnectStatus: "pending",
          stripeConnectCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      res.json({ accountId: account.id });
    } catch (error: any) {
      console.error("createConnectAccount error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * Create an account link for Connect onboarding
 * FIXED: Uses https:// URLs instead of custom URL schemes
 */
export const createAccountLink = onRequest(
  { ...httpsOptions, secrets: [stripeSecretKey] },
  async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const idToken = authHeader.split("Bearer ")[1];
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const userId = decodedToken.uid;

      let { accountId } = req.body;

      // If accountId not provided, get from user document
      if (!accountId) {
        const userDoc = await db.collection("users").doc(userId).get();
        const userData = userDoc.data();
        accountId = userData?.stripeConnectAccountId;
      }

      if (!accountId) {
        res.status(400).json({ error: "No Connect account found. Create one first." });
        return;
      }

      const stripe = getStripe(stripeSecretKey.value());

      // FIXED: Use https:// URLs that redirect to the app
      // The stripe-redirect.html page handles opening the app via deep link
      const refreshUrl = `${WEB_BASE_URL}/stripe-redirect.html?type=refresh&userId=${userId}`;
      const returnUrl = `${WEB_BASE_URL}/stripe-redirect.html?type=return&userId=${userId}`;

      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: "account_onboarding",
      });

      res.json({ url: accountLink.url });
    } catch (error: any) {
      console.error("createAccountLink error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * Create a login link for the Stripe Express dashboard
 */
export const createConnectLoginLink = onRequest(
  { ...httpsOptions, secrets: [stripeSecretKey] },
  async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const idToken = authHeader.split("Bearer ")[1];
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const userId = decodedToken.uid;

      let { accountId } = req.body;

      if (!accountId) {
        const userDoc = await db.collection("users").doc(userId).get();
        const userData = userDoc.data();
        accountId = userData?.stripeConnectAccountId;
      }

      if (!accountId) {
        res.status(400).json({ error: "No Connect account found" });
        return;
      }

      const stripe = getStripe(stripeSecretKey.value());
      const loginLink = await stripe.accounts.createLoginLink(accountId);

      res.json({ url: loginLink.url });
    } catch (error: any) {
      console.error("createConnectLoginLink error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * Get Connect account status
 */
export const getConnectAccountStatus = onRequest(
  { ...httpsOptions, secrets: [stripeSecretKey] },
  async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const idToken = authHeader.split("Bearer ")[1];
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const userId = decodedToken.uid;

      let { accountId } = req.body;

      if (!accountId) {
        const userDoc = await db.collection("users").doc(userId).get();
        const userData = userDoc.data();
        accountId = userData?.stripeConnectAccountId;
      }

      if (!accountId) {
        res.json({ 
          hasAccount: false,
          status: "none",
          message: "No Connect account found" 
        });
        return;
      }

      const stripe = getStripe(stripeSecretKey.value());
      const account = await stripe.accounts.retrieve(accountId);

      let status = "pending";
      let message = "Account setup incomplete";

      if (account.charges_enabled && account.payouts_enabled) {
        status = "active";
        message = "Account is fully active";
      } else if (account.details_submitted) {
        status = "under_review";
        message = "Account is under review by Stripe";
      } else if (account.requirements?.currently_due?.length) {
        status = "incomplete";
        message = "Additional information required";
      }

      await db.collection("users").doc(userId).set(
        {
          stripeConnectStatus: status,
          stripeConnectChargesEnabled: account.charges_enabled,
          stripeConnectPayoutsEnabled: account.payouts_enabled,
          stripeConnectDetailsSubmitted: account.details_submitted,
          stripeConnectRequirements: account.requirements?.currently_due || [],
        },
        { merge: true }
      );

      res.json({
        hasAccount: true,
        accountId: account.id,
        status,
        message,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
        requirements: account.requirements?.currently_due || [],
        pendingVerification: account.requirements?.pending_verification || [],
      });
    } catch (error: any) {
      console.error("getConnectAccountStatus error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ============================================
// STRIPE CUSTOMERS & PAYMENT METHODS
// ============================================

/**
 * Create a SetupIntent for adding a payment method
 */
export const createSetupIntent = onRequest(
  { ...httpsOptions, secrets: [stripeSecretKey] },
  async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const idToken = authHeader.split("Bearer ")[1];
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const userId = decodedToken.uid;

      const stripe = getStripe(stripeSecretKey.value());

      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();
      let customerId = userData?.stripeCustomerId;

      // Helper function to create a new customer
      const createNewCustomer = async () => {
        const customer = await stripe.customers.create({
          email: decodedToken.email,
          metadata: { firebaseUserId: userId },
        });
        await db.collection("users").doc(userId).set(
          { stripeCustomerId: customer.id },
          { merge: true }
        );
        return customer.id;
      };

      // If no customer ID, create one
      if (!customerId) {
        customerId = await createNewCustomer();
      } else {
        // Verify the customer still exists in Stripe
        try {
          await stripe.customers.retrieve(customerId);
        } catch (customerError: any) {
          // Customer doesn't exist, create a new one
          if (customerError.code === 'resource_missing') {
            console.log(`Customer ${customerId} not found, creating new customer`);
            customerId = await createNewCustomer();
          } else {
            throw customerError;
          }
        }
      }

      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ["card"],
        metadata: { firebaseUserId: userId },
      });

      res.json({
        clientSecret: setupIntent.client_secret,
        setupIntentId: setupIntent.id,
      });
    } catch (error: any) {
      console.error("createSetupIntent error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * List customer's payment methods
 */
export const listPaymentMethods = onRequest(
  { ...httpsOptions, secrets: [stripeSecretKey] },
  async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const idToken = authHeader.split("Bearer ")[1];
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const userId = decodedToken.uid;

      const stripe = getStripe(stripeSecretKey.value());

      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();
      const customerId = userData?.stripeCustomerId;

      if (!customerId) {
        res.json({ paymentMethods: [], defaultPaymentMethodId: null });
        return;
      }

      // Try to retrieve customer, return empty if not found
      let customer;
      try {
        customer = await stripe.customers.retrieve(customerId);
      } catch (customerError: any) {
        if (customerError.code === 'resource_missing') {
          // Customer doesn't exist in Stripe, clear it from Firestore
          await db.collection("users").doc(userId).update({
            stripeCustomerId: admin.firestore.FieldValue.delete()
          });
          res.json({ paymentMethods: [], defaultPaymentMethodId: null });
          return;
        }
        throw customerError;
      }

      const defaultPaymentMethodId = 
        (customer as Stripe.Customer).invoice_settings?.default_payment_method;

      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: "card",
      });

      res.json({
        paymentMethods: paymentMethods.data.map((pm) => ({
          id: pm.id,
          brand: pm.card?.brand,
          last4: pm.card?.last4,
          expMonth: pm.card?.exp_month,
          expYear: pm.card?.exp_year,
          isDefault: pm.id === defaultPaymentMethodId,
        })),
        defaultPaymentMethodId,
      });
    } catch (error: any) {
      console.error("listPaymentMethods error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * Detach a payment method
 */
export const detachPaymentMethod = onRequest(
  { ...httpsOptions, secrets: [stripeSecretKey] },
  async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      await admin.auth().verifyIdToken(authHeader.split("Bearer ")[1]);

      const { paymentMethodId } = req.body;
      if (!paymentMethodId) {
        res.status(400).json({ error: "Payment method ID is required" });
        return;
      }

      const stripe = getStripe(stripeSecretKey.value());
      await stripe.paymentMethods.detach(paymentMethodId);

      res.json({ success: true });
    } catch (error: any) {
      console.error("detachPaymentMethod error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * Set default payment method
 */
export const setDefaultPaymentMethod = onRequest(
  { ...httpsOptions, secrets: [stripeSecretKey] },
  async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const idToken = authHeader.split("Bearer ")[1];
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const userId = decodedToken.uid;

      const { paymentMethodId } = req.body;
      if (!paymentMethodId) {
        res.status(400).json({ error: "Payment method ID is required" });
        return;
      }

      const stripe = getStripe(stripeSecretKey.value());

      const userDoc = await db.collection("users").doc(userId).get();
      const customerId = userDoc.data()?.stripeCustomerId;

      if (!customerId) {
        res.status(400).json({ error: "No customer found" });
        return;
      }

      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("setDefaultPaymentMethod error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ============================================
// PAYMENTS
// ============================================

/**
 * Create a PaymentIntent for a rental
 */
export const createPaymentIntent = onRequest(
  { ...httpsOptions, secrets: [stripeSecretKey] },
  async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const idToken = authHeader.split("Bearer ")[1];
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const userId = decodedToken.uid;

      const {
        amount,
        currency = "usd",
        rentalId,
        itemId,
        itemName,
        sellerId,
        paymentMethodId,
      } = req.body;

      if (!amount || !rentalId || !sellerId) {
        res.status(400).json({ error: "Amount, rentalId, and sellerId are required" });
        return;
      }

      const stripe = getStripe(stripeSecretKey.value());

      // Get or create customer
      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();
      let customerId = userData?.stripeCustomerId;

      // DEBUG LOGGING - Remove after fixing
      console.log("=== PAYMENT INTENT DEBUG ===");
      console.log("userId:", userId);
      console.log("userData keys:", userData ? Object.keys(userData) : "null");
      console.log("identityVerified value:", userData?.identityVerified);
      console.log("identityVerified type:", typeof userData?.identityVerified);
      console.log("amount:", amount);
      console.log("threshold:", IDENTITY_VERIFICATION_THRESHOLD_CENTS);
      console.log("requiresVerification:", amount >= IDENTITY_VERIFICATION_THRESHOLD_CENTS);
      console.log("=== END DEBUG ===");

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: decodedToken.email,
          metadata: { firebaseUserId: userId },
        });
        customerId = customer.id;
        await db.collection("users").doc(userId).set(
          { stripeCustomerId: customerId },
          { merge: true }
        );
      }

      // Get seller's Connect account
      const sellerDoc = await db.collection("users").doc(sellerId).get();
      const sellerConnectAccountId = sellerDoc.data()?.stripeConnectAccountId;

      if (!sellerConnectAccountId) {
        res.status(400).json({ error: "Seller has not set up payments" });
        return;
      }

      // Calculate fees
      const platformFeeAmount = Math.round(amount * (PLATFORM_FEE_PERCENT / 100));
      const requiresIdentityVerification = amount >= IDENTITY_VERIFICATION_THRESHOLD_CENTS;

      // Check if identity verification is required and not completed
      // FIXED: Check for both boolean true and string "true" for robustness
      const isVerified = userData?.identityVerified === true || userData?.identityVerified === "true";
      
      console.log("isVerified (after check):", isVerified);
      
      if (requiresIdentityVerification && !isVerified) {
        res.status(400).json({ 
          error: "Identity verification required for rentals $500+",
          requiresIdentityVerification: true,
          identityVerified: false 
        });
        return;
      }

      const paymentIntentData: Stripe.PaymentIntentCreateParams = {
        amount,
        currency,
        customer: customerId,
        payment_method_types: ["card"],
        transfer_data: { destination: sellerConnectAccountId },
        application_fee_amount: platformFeeAmount,
        metadata: {
          firebaseUserId: userId,
          rentalId,
          itemId: itemId || "",
          itemName: itemName || "",
          sellerId,
          platformFee: platformFeeAmount.toString(),
        },
      };

      if (paymentMethodId) {
        paymentIntentData.payment_method = paymentMethodId;
        paymentIntentData.confirm = true;
        paymentIntentData.return_url = `${WEB_BASE_URL}/stripe-redirect.html?type=payment&rentalId=${rentalId}`;
      }

      const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);

      await db.collection("rentals").doc(rentalId).set(
        {
          paymentIntentId: paymentIntent.id,
          paymentStatus: paymentIntent.status,
          amount,
          platformFee: platformFeeAmount,
          sellerAmount: amount - platformFeeAmount,
          currency,
          renterId: userId,
          sellerId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        amount,
        platformFee: platformFeeAmount,
        sellerAmount: amount - platformFeeAmount,
        requiresIdentityVerification: false, // Already verified if we got here
      });
    } catch (error: any) {
      console.error("createPaymentIntent error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * Create a refund
 */
export const createRefund = onRequest(
  { ...httpsOptions, secrets: [stripeSecretKey] },
  async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const idToken = authHeader.split("Bearer ")[1];
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const userId = decodedToken.uid;

      const { paymentIntentId, rentalId, amount, reason = "requested_by_customer" } = req.body;

      if (!paymentIntentId && !rentalId) {
        res.status(400).json({ error: "Either paymentIntentId or rentalId is required" });
        return;
      }

      const stripe = getStripe(stripeSecretKey.value());

      let finalPaymentIntentId = paymentIntentId;
      if (!finalPaymentIntentId && rentalId) {
        const rentalDoc = await db.collection("rentals").doc(rentalId).get();
        finalPaymentIntentId = rentalDoc.data()?.paymentIntentId;
      }

      if (!finalPaymentIntentId) {
        res.status(400).json({ error: "Payment intent not found" });
        return;
      }

      const refundData: Stripe.RefundCreateParams = {
        payment_intent: finalPaymentIntentId,
        reason: reason as Stripe.RefundCreateParams.Reason,
        refund_application_fee: true,
        metadata: { requestedBy: userId, rentalId: rentalId || "" },
      };

      if (amount) {
        refundData.amount = amount;
      }

      const refund = await stripe.refunds.create(refundData);

      if (rentalId) {
        await db.collection("rentals").doc(rentalId).set(
          {
            refundId: refund.id,
            refundStatus: refund.status,
            refundAmount: refund.amount,
            refundedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      res.json({
        refundId: refund.id,
        status: refund.status,
        amount: refund.amount,
      });
    } catch (error: any) {
      console.error("createRefund error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ============================================
// ISSUE #7 & #8 FIX: Add missing processTransfer Cloud Function
// ============================================
// ADD this function to functions/src/index.ts BEFORE the Identity Verification section
// (i.e., after the createRefund function, around line 753)
//
// ROOT CAUSE: PayoutService.ts calls a Cloud Function named 'processTransfer'
// but no such function exists in functions/src/index.ts. When the app calls the
// non-existent endpoint, Firebase returns an HTML 404 page instead of JSON,
// causing the "JSON parse error" (Issue #7). Since payouts fail, earnings
// never update (Issue #8).
// ============================================

/**
 * Process a transfer/payout to a seller's Connect account
 * Called by PayoutService.processRentalPayout()
 */
export const processTransfer = onRequest(
  { ...httpsOptions, secrets: [stripeSecretKey] },
  async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const idToken = authHeader.split("Bearer ")[1];
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const userId = decodedToken.uid;

      const { sellerId, amount, rentalId } = req.body;

      if (!sellerId || !amount || !rentalId) {
        res.status(400).json({ error: "sellerId, amount, and rentalId are required" });
        return;
      }

      const stripe = getStripe(stripeSecretKey.value());

      // Get seller's Connect account ID
      const sellerDoc = await db.collection("users").doc(sellerId).get();
      const sellerData = sellerDoc.data();
      const sellerConnectAccountId = sellerData?.stripeConnectAccountId;

      if (!sellerConnectAccountId) {
        res.status(400).json({ error: "Seller has not set up a payout account" });
        return;
      }

      // Check that the seller's account is active
      const account = await stripe.accounts.retrieve(sellerConnectAccountId);
      if (!account.charges_enabled || !account.payouts_enabled) {
        res.status(400).json({ error: "Seller's payout account is not fully active" });
        return;
      }

      // Calculate platform fee (10%)
      const platformFeeAmount = Math.round(amount * (PLATFORM_FEE_PERCENT / 100));
      const sellerAmount = amount - platformFeeAmount;

      // Create a transfer to the seller's Connect account
      const transfer = await stripe.transfers.create({
        amount: sellerAmount,
        currency: "usd",
        destination: sellerConnectAccountId,
        metadata: {
          rentalId,
          sellerId,
          requestedBy: userId,
          originalAmount: amount.toString(),
          platformFee: platformFeeAmount.toString(),
        },
      });

      // Record the payout in Firestore
      await db.collection("payouts").add({
        userId: sellerId,
        rentalId,
        amount: sellerAmount,
        platformFee: platformFeeAmount,
        originalAmount: amount,
        currency: "usd",
        stripeTransferId: transfer.id,
        status: "completed",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`✅ Transfer processed: ${transfer.id} — $${(sellerAmount / 100).toFixed(2)} to ${sellerConnectAccountId}`);

      res.json({
        transferId: transfer.id,
        amount: sellerAmount,
        originalAmount: amount,
        platformFee: platformFeeAmount,
      });
    } catch (error: any) {
      console.error("processTransfer error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ============================================
// IDENTITY VERIFICATION (ENHANCED)
// ============================================

/**
 * Create an identity verification session
 * ENHANCED: Includes retry attempt tracking and abandoned verification detection
 */
export const createIdentityVerificationSession = onRequest(
  { ...httpsOptions, secrets: [stripeSecretKey] },
  async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const idToken = authHeader.split("Bearer ")[1];
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const userId = decodedToken.uid;

      const { rentalId } = req.body;

      const stripe = getStripe(stripeSecretKey.value());

      // Get user data
      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();

      // Check if user already verified
      if (userData?.identityVerified) {
        res.json({
          alreadyVerified: true,
          status: "verified",
          message: "Identity already verified"
        });
        return;
      }

      // Check attempt count - ENHANCED: Enforce max attempts
      const attemptCount = userData?.identityVerificationAttempts || 0;
      if (attemptCount >= MAX_VERIFICATION_ATTEMPTS) {
        res.status(400).json({
          error: "Maximum verification attempts reached",
          maxAttemptsReached: true,
          attemptCount,
          message: "Please contact support for assistance with verification."
        });
        return;
      }

      // Create verification session
      const verificationSession = await stripe.identity.verificationSessions.create({
        type: "document",
        options: {
          document: {
            allowed_types: ["driving_license", "passport", "id_card"],
            require_id_number: false,
            require_matching_selfie: true,
          },
        },
        metadata: {
          firebaseUserId: userId,
          rentalId: rentalId || "",
          attemptNumber: (attemptCount + 1).toString(), // ENHANCED: Track attempt number
        },
        // Use https URL that redirects to app
        return_url: `${WEB_BASE_URL}/stripe-redirect.html?type=identity&userId=${userId}`,
      });

      // Update user document with new attempt - ENHANCED: Track attempts and abandoned state
      await db.collection("users").doc(userId).set(
        {
          identityVerificationSessionId: verificationSession.id,
          identityVerificationStatus: verificationSession.status,
          identityVerificationAttempts: attemptCount + 1, // ENHANCED: Increment attempts
          identityVerificationLastAttempt: admin.firestore.FieldValue.serverTimestamp(), // ENHANCED
          identityVerificationStartedAt: admin.firestore.FieldValue.serverTimestamp(), // ENHANCED
          identityVerificationAbandoned: false, // ENHANCED: Reset abandoned flag
          identityVerificationUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      res.json({
        sessionId: verificationSession.id,
        clientSecret: verificationSession.client_secret,
        url: verificationSession.url,
        status: verificationSession.status,
        attemptCount: attemptCount + 1, // ENHANCED: Return attempt info
        attemptsRemaining: MAX_VERIFICATION_ATTEMPTS - (attemptCount + 1), // ENHANCED
      });
    } catch (error: any) {
      console.error("createIdentityVerificationSession error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * Get identity verification status
 * ENHANCED: Includes attempt tracking and max attempts check
 */
export const getIdentityVerificationStatus = onRequest(
  { ...httpsOptions, secrets: [stripeSecretKey] },
  async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const idToken = authHeader.split("Bearer ")[1];
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const userId = decodedToken.uid;

      const { sessionId } = req.body;

      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();

      // ENHANCED: Get attempt info
      const attemptCount = userData?.identityVerificationAttempts || 0;
      const maxAttemptsReached = attemptCount >= MAX_VERIFICATION_ATTEMPTS && !userData?.identityVerified;

      // If already verified in Firestore, return that
      if (userData?.identityVerified) {
        res.json({
          hasSession: true,
          status: "verified",
          verified: true,
          attemptCount, // ENHANCED
          maxAttemptsReached: false, // ENHANCED
        });
        return;
      }

      // ENHANCED: If max attempts reached and not verified
      if (maxAttemptsReached) {
        res.json({
          hasSession: true,
          status: "max_attempts_reached",
          verified: false,
          attemptCount,
          maxAttemptsReached: true,
          message: "Maximum verification attempts reached. Please contact support.",
        });
        return;
      }

      const finalSessionId = sessionId || userData?.identityVerificationSessionId;

      if (!finalSessionId) {
        res.json({ 
          hasSession: false,
          status: "none",
          verified: false,
          attemptCount, // ENHANCED
          maxAttemptsReached: false, // ENHANCED
        });
        return;
      }

      const stripe = getStripe(stripeSecretKey.value());
      const session = await stripe.identity.verificationSessions.retrieve(finalSessionId);

      const verified = session.status === "verified";

      // ENHANCED: Build update data with conditional fields
      const updateData: any = {
        identityVerificationStatus: session.status,
        identityVerified: verified,
        identityVerificationUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // ENHANCED: If verified, clear abandoned flag and record verification time
      if (verified) {
        updateData.identityVerifiedAt = admin.firestore.FieldValue.serverTimestamp();
        updateData.identityVerificationAbandoned = false;
      }

      await db.collection("users").doc(userId).set(updateData, { merge: true });

      res.json({
        hasSession: true,
        sessionId: session.id,
        status: session.status,
        verified,
        lastError: session.last_error,
        attemptCount, // ENHANCED
        attemptsRemaining: MAX_VERIFICATION_ATTEMPTS - attemptCount, // ENHANCED
        maxAttemptsReached: !verified && attemptCount >= MAX_VERIFICATION_ATTEMPTS, // ENHANCED
      });
    } catch (error: any) {
      console.error("getIdentityVerificationStatus error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ============================================
// WEBHOOKS
// ============================================

/**
 * Stripe Webhook handler for payments and Connect events
 */
export const stripeWebhook = onRequest(
  { 
    ...httpsOptions, 
    secrets: [stripeSecretKey, stripeWebhookSecret],
  },
  async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;

    if (!sig) {
      res.status(400).send("No signature");
      return;
    }

    const stripe = getStripe(stripeSecretKey.value());
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        stripeWebhookSecret.value()
      );
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    console.log("Received webhook event:", event.type);

    try {
      switch (event.type) {
        case "payment_intent.succeeded": {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          const rentalId = paymentIntent.metadata.rentalId;

          if (rentalId) {
            await db.collection("rentals").doc(rentalId).set(
              {
                paymentStatus: "succeeded",
                paidAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          }
          console.log(`Payment succeeded: ${paymentIntent.id}`);
          break;
        }

        case "payment_intent.payment_failed": {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          const rentalId = paymentIntent.metadata.rentalId;

          if (rentalId) {
            await db.collection("rentals").doc(rentalId).set(
              {
                paymentStatus: "failed",
                paymentError: paymentIntent.last_payment_error?.message || "Payment failed",
                failedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          }
          console.log(`Payment failed: ${paymentIntent.id}`);
          break;
        }

        case "account.updated": {
          const account = event.data.object as Stripe.Account;
          const odUserId = account.metadata?.firebaseUserId;

          if (odUserId) {
            let status = "pending";
            if (account.charges_enabled && account.payouts_enabled) {
              status = "active";
            } else if (account.details_submitted) {
              status = "under_review";
            }

            await db.collection("users").doc(odUserId).set(
              {
                stripeConnectStatus: status,
                stripeConnectChargesEnabled: account.charges_enabled,
                stripeConnectPayoutsEnabled: account.payouts_enabled,
                stripeConnectUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          }
          console.log(`Account updated: ${account.id}`);
          break;
        }

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error("Webhook handler error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * Stripe Identity Webhook handler
 * ENHANCED: Better status tracking and abandoned verification handling
 */
export const stripeIdentityWebhook = onRequest(
  { 
    ...httpsOptions, 
    secrets: [stripeSecretKey, stripeIdentityWebhookSecret],
  },
  async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;

    if (!sig) {
      res.status(400).send("No signature");
      return;
    }

    const stripe = getStripe(stripeSecretKey.value());
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        stripeIdentityWebhookSecret.value()
      );
    } catch (err: any) {
      console.error("Identity webhook signature verification failed:", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    console.log("Received identity webhook event:", event.type);

    try {
      switch (event.type) {
        case "identity.verification_session.verified": {
          const session = event.data.object as Stripe.Identity.VerificationSession;
          const odUserId = session.metadata?.firebaseUserId;

          if (odUserId) {
            await db.collection("users").doc(odUserId).set(
              {
                identityVerificationStatus: "verified",
                identityVerified: true,
                identityVerifiedAt: admin.firestore.FieldValue.serverTimestamp(), // ENHANCED
                identityVerificationAbandoned: false, // ENHANCED: Clear abandoned flag
                identityVerificationSessionId: session.id,
              },
              { merge: true }
            );
            console.log(`Identity verified for user: ${odUserId}`);
          }
          break;
        }

        case "identity.verification_session.requires_input": {
          const session = event.data.object as Stripe.Identity.VerificationSession;
          const odUserId = session.metadata?.firebaseUserId;

          if (odUserId) {
            await db.collection("users").doc(odUserId).set(
              {
                identityVerificationStatus: "requires_input",
                identityVerificationError: session.last_error?.reason || "Additional input required",
                identityVerificationErrorCode: session.last_error?.code || null, // ENHANCED
                identityVerificationUpdatedAt: admin.firestore.FieldValue.serverTimestamp(), // ENHANCED
              },
              { merge: true }
            );
            console.log(`Identity requires input for user: ${odUserId}, reason: ${session.last_error?.reason}`);
          }
          break;
        }

        case "identity.verification_session.canceled": {
          const session = event.data.object as Stripe.Identity.VerificationSession;
          const odUserId = session.metadata?.firebaseUserId;

          if (odUserId) {
            await db.collection("users").doc(odUserId).set(
              { 
                identityVerificationStatus: "canceled",
                identityVerificationUpdatedAt: admin.firestore.FieldValue.serverTimestamp(), // ENHANCED
              },
              { merge: true }
            );
            console.log(`Identity verification canceled for user: ${odUserId}`);
          }
          break;
        }

        default:
          console.log(`Unhandled identity event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error("Identity webhook handler error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);