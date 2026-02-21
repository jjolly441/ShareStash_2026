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
import { onSchedule } from "firebase-functions/v2/scheduler";
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
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

// Constants
const DEFAULT_PLATFORM_FEE_PERCENT = 10; // Fallback if Firestore unavailable
const IDENTITY_VERIFICATION_THRESHOLD_CENTS = 50000; // $500
const MAX_VERIFICATION_ATTEMPTS = 3; // NEW: Max retry attempts for identity verification

/**
 * Get the current platform fee percentage from Firestore settings.
 * Falls back to DEFAULT_PLATFORM_FEE_PERCENT if unavailable.
 */
async function getPlatformFeePercent(): Promise<number> {
  try {
    const settingsDoc = await db.collection("settings").doc("platform").get();
    if (settingsDoc.exists) {
      const data = settingsDoc.data();
      if (data?.serviceFeePercent !== undefined && data.serviceFeePercent >= 0 && data.serviceFeePercent <= 50) {
        return data.serviceFeePercent;
      }
    }
  } catch (error) {
    console.warn("Could not read platform fee from settings, using default:", error);
  }
  return DEFAULT_PLATFORM_FEE_PERCENT;
}

// Your Firebase Hosting URL (or custom domain)
const WEB_BASE_URL = "https://peerrentalapp.web.app";

// Helper: Create Stripe instance per request (required for v2)
function getStripe(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: "2026-01-28.clover",
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
      const feePercent = await getPlatformFeePercent();
      const platformFeeAmount = Math.round(amount * (feePercent / 100));
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
        // NO transfer_data — funds stay on platform until rental completes
        // Transfer happens via processTransfer when owner marks rental complete
        metadata: {
          firebaseUserId: userId,
          rentalId,
          itemId: itemId || "",
          itemName: itemName || "",
          sellerId,
          platformFee: platformFeeAmount.toString(),
          sellerConnectAccountId, // Store for later transfer
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
        // No refund_application_fee — funds are held on platform, no app fee to reverse
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
// PROCESS TRANSFER - Release funds to seller on rental completion
// ============================================

/**
 * Process a transfer/payout to a seller's Connect account
 * Called by PayoutService.processRentalPayout() when owner marks rental as complete.
 * 
 * PAYMENT FLOW:
 * 1. Renter pays → funds held on platform (no destination charge)
 * 2. Rental completes → this function transfers seller's share to their Connect account
 * 3. Platform fee (10%) is retained on the platform automatically
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

      // Get the rental to find the original payment intent
      const rentalDoc = await db.collection("rentals").doc(rentalId).get();
      const rentalData = rentalDoc.data();
      const paymentIntentId = rentalData?.paymentIntentId;

      // Calculate platform fee and seller amount
      const feePercent = await getPlatformFeePercent();
      const platformFeeAmount = Math.round(amount * (feePercent / 100));
      const sellerAmount = amount - platformFeeAmount;

      // Build transfer params
      const transferParams: Stripe.TransferCreateParams = {
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
      };

      // Link transfer to the original charge via source_transaction
      // This allows the transfer even if funds are still pending in the platform balance
      if (paymentIntentId) {
        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
          const chargeId = paymentIntent.latest_charge;
          if (chargeId) {
            transferParams.source_transaction = typeof chargeId === 'string' ? chargeId : chargeId.id;
            console.log(`Using source_transaction: ${transferParams.source_transaction}`);
          }
        } catch (piError) {
          console.warn("Could not retrieve payment intent for source_transaction, proceeding without it:", piError);
        }
      }

      // Create a transfer to the seller's Connect account
      const transfer = await stripe.transfers.create(transferParams);

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

// ============================================
// SCHEDULED FUNCTIONS — FRAUD PROTECTION
// ============================================

/**
 * LAYER 3: Process eligible payouts after 48-hour dispute window
 * Runs every hour to check for rentals whose payout window has expired
 */
export const processEligiblePayouts = onSchedule(
  {
    schedule: "every 60 minutes",
    region: "us-central1",
    secrets: [stripeSecretKey],
  },
  async () => {
    try {
      // Find rentals in completed_pending_payout where payoutEligibleAt has passed and not frozen
      const snapshot = await db
        .collection("rentals")
        .where("status", "==", "completed_pending_payout")
        .where("payoutFrozen", "==", false)
        .where("payoutEligibleAt", "<=", admin.firestore.Timestamp.now())
        .get();

      console.log(`Found ${snapshot.size} rentals eligible for payout`);

      for (const rentalDoc of snapshot.docs) {
        const rental = rentalDoc.data();
        const rentalId = rentalDoc.id;

        try {
          // Get owner's Stripe account
          const ownerDoc = await db.collection("users").doc(rental.ownerId).get();
          const ownerData = ownerDoc.data();
          const ownerStripeAccountId = ownerData?.stripeConnectAccountId;

          if (!ownerStripeAccountId) {
            console.log(`Owner ${rental.ownerId} has no Stripe account, marking payout pending`);
            await rentalDoc.ref.update({
              status: "completed",
              payoutStatus: "pending",
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            continue;
          }

          const stripe = getStripe(stripeSecretKey.value());

          // Calculate amounts
          const amount = rental.totalPrice;
          const amountCents = Math.round(amount * 100);
          const feePercent = await getPlatformFeePercent();
          const platformFeeAmount = Math.round(amountCents * (feePercent / 100));
          const sellerAmount = amountCents - platformFeeAmount;

          // Build transfer
          const transferParams: Stripe.TransferCreateParams = {
            amount: sellerAmount,
            currency: "usd",
            destination: ownerStripeAccountId,
            metadata: {
              rentalId,
              sellerId: rental.ownerId,
              type: "scheduled_payout",
            },
          };

          // Link to original charge
          if (rental.paymentIntentId) {
            try {
              const pi = await stripe.paymentIntents.retrieve(rental.paymentIntentId);
              const chargeId = pi.latest_charge;
              if (chargeId) {
                transferParams.source_transaction = typeof chargeId === "string" ? chargeId : chargeId.id;
              }
            } catch (piErr) {
              console.warn("Could not retrieve PI for source_transaction:", piErr);
            }
          }

          const transfer = await stripe.transfers.create(transferParams);

          // Record payout
          await db.collection("payouts").add({
            userId: rental.ownerId,
            rentalId,
            amount: sellerAmount,
            platformFee: platformFeeAmount,
            originalAmount: amountCents,
            currency: "usd",
            stripeTransferId: transfer.id,
            status: "completed",
            type: "scheduled",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Update rental to final completed
          await rentalDoc.ref.update({
            status: "completed",
            payoutId: transfer.id,
            payoutStatus: "completed",
            payoutProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          console.log(`✅ Scheduled payout processed for rental ${rentalId}: ${transfer.id}`);
        } catch (rentalError: any) {
          console.error(`Failed to process payout for rental ${rentalId}:`, rentalError);
          await rentalDoc.ref.update({ payoutStatus: "failed" });
        }
      }
    } catch (error: any) {
      console.error("processEligiblePayouts error:", error);
    }
  }
);

/**
 * LAYER 4: Auto-complete rentals + send reminders
 * Runs daily to:
 * 1. Send reminder at day 1 and day 2 after endDate if renter hasn't confirmed
 * 2. Auto-complete at day 3 if still in pending_completion
 */
export const autoCompleteRentals = onSchedule(
  {
    schedule: "every 24 hours",
    region: "us-central1",
  },
  async () => {
    try {
      // Find all rentals stuck in pending_completion
      const snapshot = await db
        .collection("rentals")
        .where("status", "==", "pending_completion")
        .get();

      console.log(`Found ${snapshot.size} rentals in pending_completion`);

      for (const rentalDoc of snapshot.docs) {
        const rental = rentalDoc.data();
        const rentalId = rentalDoc.id;

        const autoCompleteAt = rental.autoCompleteAt?.toDate?.() || null;
        if (!autoCompleteAt) continue;

        const nowDate = new Date();
        const reminders = rental.autoCompleteReminders || 0;

        // Calculate days since owner marked complete
        const endDate = rental.endDate?.toDate?.() || new Date(rental.endDate);
        const daysSinceEnd = (nowDate.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24);

        // AUTO-COMPLETE: 3+ days past end date
        if (nowDate >= autoCompleteAt) {
          console.log(`Auto-completing rental ${rentalId} (${Math.floor(daysSinceEnd)} days past end date)`);

          const payoutEligibleDate = new Date(nowDate.getTime() + 48 * 60 * 60 * 1000);

          await rentalDoc.ref.update({
            renterConfirmedReturn: true,
            status: "completed_pending_payout",
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            payoutEligibleAt: admin.firestore.Timestamp.fromDate(payoutEligibleDate),
            payoutFrozen: false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Notify both
          await db.collection("notifications").add({
            userId: rental.renterId,
            title: "⏰ Rental Auto-Completed",
            body: `Your rental of "${rental.itemName}" was automatically completed because the return was not confirmed within 3 days.`,
            data: { type: "rental_auto_completed", rentalId, screen: "Rentals" },
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          await db.collection("notifications").add({
            userId: rental.ownerId,
            title: "⏰ Rental Auto-Completed",
            body: `The rental of "${rental.itemName}" was automatically completed. Payout will process in 48 hours.`,
            data: { type: "rental_auto_completed", rentalId, screen: "Rentals" },
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          continue;
        }

        // REMINDER at day 1 (reminders === 0, daysSinceEnd >= 1)
        if (reminders === 0 && daysSinceEnd >= 1) {
          console.log(`Sending day-1 reminder for rental ${rentalId}`);

          await db.collection("notifications").add({
            userId: rental.renterId,
            title: "📦 Reminder: Confirm Return",
            body: `Please confirm the return of "${rental.itemName}". The rental will auto-complete in 2 days if not confirmed.`,
            data: { type: "return_reminder", rentalId, screen: "Rentals" },
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          await rentalDoc.ref.update({ autoCompleteReminders: 1 });
          continue;
        }

        // REMINDER at day 2 (reminders === 1, daysSinceEnd >= 2)
        if (reminders === 1 && daysSinceEnd >= 2) {
          console.log(`Sending day-2 reminder for rental ${rentalId}`);

          await db.collection("notifications").add({
            userId: rental.renterId,
            title: "⚠️ Final Reminder: Confirm Return",
            body: `This is your final reminder to confirm the return of "${rental.itemName}". It will auto-complete tomorrow.`,
            data: { type: "return_reminder_final", rentalId, screen: "Rentals" },
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          await rentalDoc.ref.update({ autoCompleteReminders: 2 });
        }
      }
    } catch (error: any) {
      console.error("autoCompleteRentals error:", error);
    }
  }
);

// ============================================
// AI SUPPORT CHATBOT (Claude-powered)
// ============================================

const SUPPORT_SYSTEM_PROMPT = `You are ShareStash Support, a friendly and helpful AI assistant for the ShareStash peer-to-peer rental marketplace app. Your role is to help users with questions about the app, rental process, payments, disputes, and account issues.

KEY INFORMATION ABOUT SHARESTASH:
- ShareStash connects item owners with renters for peer-to-peer item rentals
- Platform fee: 10% deducted from the owner's payout
- Payments processed through Stripe; payouts via Stripe Connect
- Identity verification (Stripe Identity) required for rentals over $500
- Rental flow: Request → Owner Approves → Renter Pays → Active → Owner marks complete → Renter confirms return → 48h dispute window → Payout processed
- Cancellation policy: Full refund if cancelled 24+ hours before start date; no refund within 24 hours
- The 48-hour dispute window freezes payouts if a dispute is filed
- Auto-complete: If renter doesn't confirm return within 3 days after end date, rental auto-completes
- Photo handoff feature: Both parties photograph item condition at pick-up and return
- Meeting location feature: Either party can propose a handoff location; other party accepts or suggests different
- Dispute process: File via "Report Issue" button; admin reviews; payout frozen during review
- Users can leave reviews after rental completion
- Support email: support@sharestash.app

GUIDELINES:
- Be concise, friendly, and helpful
- If you don't know something specific about the user's account, suggest they contact support@sharestash.app
- Never make up features or policies that don't exist
- Guide users step-by-step when explaining how to do something in the app
- If a user seems frustrated, be empathetic and focus on solving their problem
- Keep responses short (2-4 sentences) unless the user asks for detailed explanation
- Do not discuss competitor apps or services`;

export const chatWithSupport = onRequest(
  { ...httpsOptions, secrets: [anthropicApiKey] },
  async (req, res) => {
    try {
      // Verify authentication
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const idToken = authHeader.split("Bearer ")[1];
      await admin.auth().verifyIdToken(idToken);

      const { messages } = req.body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: "messages array is required" });
        return;
      }

      // Call Anthropic API
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicApiKey.value(),
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 512,
          system: SUPPORT_SYSTEM_PROMPT,
          messages: messages.slice(-20), // Last 20 messages for context
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error("Anthropic API error:", response.status, errorBody);
        res.status(502).json({ error: "AI service temporarily unavailable" });
        return;
      }

      const data = await response.json();
      const assistantMessage = data.content
        ?.map((block: any) => (block.type === "text" ? block.text : ""))
        .filter(Boolean)
        .join("\n");

      if (!assistantMessage) {
        res.status(502).json({ error: "No response from AI service" });
        return;
      }

      res.json({ message: assistantMessage });
    } catch (error: any) {
      console.error("chatWithSupport error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ============================================
// SECURITY DEPOSIT FUNCTIONS
// ============================================

/**
 * Create a deposit hold (authorize but don't capture) on the renter's card.
 * Uses Stripe PaymentIntent with capture_method: 'manual'.
 */
export const createDepositHold = onRequest(
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
        rentalId,
        itemId,
        itemName,
        ownerId,
        amount, // in cents
        paymentMethodId,
      } = req.body;

      if (!rentalId || !amount || !ownerId || !paymentMethodId) {
        res.status(400).json({
          error: "rentalId, amount, ownerId, and paymentMethodId are required",
        });
        return;
      }

      const stripe = getStripe(stripeSecretKey.value());

      // Get or create Stripe customer
      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();
      let customerId = userData?.stripeCustomerId;

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

      // Get renter and owner names
      const renterName = userData?.firstName
        ? `${userData.firstName} ${userData.lastName || ""}`
        : "Renter";
      const ownerDoc = await db.collection("users").doc(ownerId).get();
      const ownerData = ownerDoc.data();
      const ownerName = ownerData?.firstName
        ? `${ownerData.firstName} ${ownerData.lastName || ""}`
        : "Owner";

      // Create PaymentIntent with manual capture (hold only)
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: "usd",
        customer: customerId,
        payment_method: paymentMethodId,
        payment_method_types: ["card"],
        capture_method: "manual", // KEY: hold but don't charge
        confirm: true,
        return_url: `${WEB_BASE_URL}/stripe-redirect.html?type=deposit&rentalId=${rentalId}`,
        metadata: {
          type: "security_deposit",
          firebaseUserId: userId,
          rentalId,
          itemId: itemId || "",
          itemName: itemName || "",
          ownerId,
        },
      });

      // Create Firestore record
      const depositRef = await db.collection("securityDeposits").add({
        rentalId,
        itemId: itemId || "",
        itemName: itemName || "",
        ownerId,
        ownerName,
        renterId: userId,
        renterName,
        amount: amount / 100, // Store in dollars
        amountClaimed: 0,
        amountReleased: 0,
        status: paymentIntent.status === "requires_capture" ? "held" : "pending",
        stripePaymentIntentId: paymentIntent.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        heldAt:
          paymentIntent.status === "requires_capture"
            ? admin.firestore.FieldValue.serverTimestamp()
            : null,
      });

      // Link deposit to rental
      await db.collection("rentals").doc(rentalId).set(
        {
          depositId: depositRef.id,
          depositStatus: paymentIntent.status === "requires_capture" ? "held" : "pending",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      res.json({
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        depositId: depositRef.id,
      });
    } catch (error: any) {
      console.error("createDepositHold error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * Release a deposit back to the renter (cancel the uncaptured PaymentIntent).
 * Called when return is confirmed with no damage.
 */
export const releaseDeposit = onRequest(
  { ...httpsOptions, secrets: [stripeSecretKey] },
  async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const idToken = authHeader.split("Bearer ")[1];
      await admin.auth().verifyIdToken(idToken);

      const { depositId } = req.body;

      if (!depositId) {
        res.status(400).json({ error: "depositId is required" });
        return;
      }

      const depositDoc = await db.collection("securityDeposits").doc(depositId).get();
      if (!depositDoc.exists) {
        res.status(404).json({ error: "Deposit not found" });
        return;
      }

      const deposit = depositDoc.data()!;

      if (deposit.status !== "held") {
        res.status(400).json({
          error: `Cannot release deposit in status: ${deposit.status}`,
        });
        return;
      }

      const stripe = getStripe(stripeSecretKey.value());

      // Cancel the uncaptured PaymentIntent (releases the hold)
      await stripe.paymentIntents.cancel(deposit.stripePaymentIntentId);

      // Update deposit record
      await db.collection("securityDeposits").doc(depositId).update({
        status: "released",
        amountReleased: deposit.amount,
        releasedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update rental
      await db.collection("rentals").doc(deposit.rentalId).set(
        {
          depositStatus: "released",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // Notify renter
      await db.collection("notifications").add({
        userId: deposit.renterId,
        title: "🔓 Deposit Released",
        body: `Your $${deposit.amount.toFixed(2)} security deposit for "${deposit.itemName}" has been released.`,
        data: { type: "deposit_released", rentalId: deposit.rentalId, screen: "Rentals" },
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("releaseDeposit error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * Claim part or all of a deposit for damages.
 * Captures the specified amount from the held PaymentIntent.
 */
export const claimDeposit = onRequest(
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

      const { depositId, claimAmount, reason, photos } = req.body;

      if (!depositId || !claimAmount || !reason) {
        res.status(400).json({
          error: "depositId, claimAmount (cents), and reason are required",
        });
        return;
      }

      const depositDoc = await db.collection("securityDeposits").doc(depositId).get();
      if (!depositDoc.exists) {
        res.status(404).json({ error: "Deposit not found" });
        return;
      }

      const deposit = depositDoc.data()!;

      // Only the owner can claim
      if (deposit.ownerId !== userId) {
        res.status(403).json({ error: "Only the item owner can claim a deposit" });
        return;
      }

      if (deposit.status !== "held") {
        res.status(400).json({
          error: `Cannot claim deposit in status: ${deposit.status}`,
        });
        return;
      }

      const depositAmountCents = Math.round(deposit.amount * 100);
      const claimCents = Math.min(claimAmount, depositAmountCents);
      const isFullClaim = claimCents >= depositAmountCents;

      const stripe = getStripe(stripeSecretKey.value());

      // Capture the claim amount from the held PaymentIntent
      await stripe.paymentIntents.capture(deposit.stripePaymentIntentId, {
        amount_to_capture: claimCents,
      });

      const claimedDollars = claimCents / 100;
      const releasedDollars = deposit.amount - claimedDollars;

      // Update deposit record
      await db.collection("securityDeposits").doc(depositId).update({
        status: isFullClaim ? "full_claim" : "partial_claim",
        amountClaimed: claimedDollars,
        amountReleased: releasedDollars,
        claimReason: reason,
        claimPhotos: photos || [],
        claimedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update rental
      await db.collection("rentals").doc(deposit.rentalId).set(
        {
          depositStatus: isFullClaim ? "full_claim" : "partial_claim",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // Notify renter about the claim
      await db.collection("notifications").add({
        userId: deposit.renterId,
        title: "⚠️ Deposit Claimed",
        body: `$${claimedDollars.toFixed(2)} of your $${deposit.amount.toFixed(2)} deposit for "${deposit.itemName}" was claimed for damages: ${reason}`,
        data: { type: "deposit_claimed", rentalId: deposit.rentalId, screen: "Rentals" },
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Notify owner about successful claim
      await db.collection("notifications").add({
        userId: deposit.ownerId,
        title: "✅ Deposit Claim Processed",
        body: `Your damage claim of $${claimedDollars.toFixed(2)} for "${deposit.itemName}" has been processed.`,
        data: { type: "deposit_claim_processed", rentalId: deposit.rentalId, screen: "Rentals" },
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.json({
        success: true,
        amountClaimed: claimedDollars,
        amountReleased: releasedDollars,
      });
    } catch (error: any) {
      console.error("claimDeposit error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);