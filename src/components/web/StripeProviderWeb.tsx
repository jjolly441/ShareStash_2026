// src/components/web/StripeProviderWeb.tsx
// Web-safe Stripe provider — just passes through children (no native Stripe on web)
import React from 'react';

export default function StripeProviderWrapper({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}