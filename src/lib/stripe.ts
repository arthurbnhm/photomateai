import Stripe from 'stripe';
import { createSupabaseAdmin } from './supabase-server';

// Initialize Stripe with the secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
});

// Price IDs for each plan
export const PRICE_IDS = {
  basic: 'price_1R1EAcIvAcEHQuzp84dffBAi',
  professional: 'price_1R1VuRIvAcEHQuzpHBcYDBfN',
  executive: 'price_1R1VucIvAcEHQuzpk38ptDFA'
};

// Get or create a Stripe customer for a user
export async function getOrCreateStripeCustomer(userId: string, email: string): Promise<string> {
  const supabase = createSupabaseAdmin();
  
  // Check if user already has a Stripe customer ID
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .single();
  
  if (subscription?.stripe_customer_id) {
    return subscription.stripe_customer_id;
  }
  
  // Create a new Stripe customer
  const customer = await stripe.customers.create({
    email,
    metadata: {
      userId,
    },
  });
  
  // We no longer create an initial subscription row here
  // The row will be created after successful payment
  
  return customer.id;
}

// Create a checkout session for subscription
export async function createCheckoutSession({
  customerId,
  priceId,
  successUrl,
  cancelUrl,
  userId,
}: {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  userId: string;
}) {
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    mode: 'subscription',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId,
    },
  });
  
  return session;
}

// Retrieve subscription details
export async function getSubscription(subscriptionId: string) {
  return stripe.subscriptions.retrieve(subscriptionId);
}

// Cancel a subscription
export async function cancelSubscription(subscriptionId: string) {
  return stripe.subscriptions.cancel(subscriptionId);
}

export { stripe }; 