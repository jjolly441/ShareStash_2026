// src/components/NativeStripe.web.tsx
// Web stub — no Stripe native imports
export const CardField = () => null;
export const useStripe = () => ({
  confirmPayment: async () => ({ error: { message: 'Stripe not available on web' } }),
  createToken: async () => ({ error: { message: 'Stripe not available on web' } }),
});