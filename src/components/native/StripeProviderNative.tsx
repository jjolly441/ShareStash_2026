// src/components/native/StripeProviderNative.tsx
// Native Stripe provider wrapper
import React from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';

const STRIPE_PUBLISHABLE_KEY = 'pk_test_51SuwcDCTtFP9wxSLgirWxC3gbmyMbh9QwrKfhxH9XXR5ELxbzez4BpE24mz2NuaBEsOYK8LackswXL8YYOFn4Y0E00j1emDqgm';

export default function StripeProviderWrapper({ children }: { children: React.ReactNode }) {
  return (
    <StripeProvider
      publishableKey={STRIPE_PUBLISHABLE_KEY}
      merchantIdentifier="merchant.com.peerrentalapp"
      urlScheme="peerrentalapp"
    >
      {children}
    </StripeProvider>
  );
}