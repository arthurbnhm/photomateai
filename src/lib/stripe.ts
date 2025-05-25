import Stripe from 'stripe';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

// Initialize Stripe with the secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
});

// Price IDs for each plan
export const PRICE_IDS = {
  basic: 'price_1R2INxIrYxGc1sVMBYxciEI4',
  professional: 'price_1R2INvIrYxGc1sVM9YvoxVjv',
  executive: 'price_1R2INsIrYxGc1sVMzPna3T3I'
};

// Get or create a Stripe customer for a user
export async function getOrCreateStripeCustomer(userId: string, email: string): Promise<string> {
  console.log('🔍 getOrCreateStripeCustomer called:', { userId, email });
  
  const supabase = createSupabaseAdminClient();
  
  // Check if user already has a Stripe customer ID
  console.log('🔍 Checking existing customer in database...');
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .single();
  
  console.log('🔍 Database query result:', { 
    hasSubscription: !!subscription, 
    hasCustomerId: !!subscription?.stripe_customer_id 
  });
  
  if (subscription?.stripe_customer_id) {
    console.log('✅ Found existing Stripe customer ID:', subscription.stripe_customer_id);
    return subscription.stripe_customer_id;
  }
  
  // Create a new Stripe customer
  console.log('🆕 Creating new Stripe customer...');
  try {
    const customer = await stripe.customers.create({
      email,
      metadata: {
        userId,
      },
    });
    
    console.log('✅ Stripe customer created:', { 
      customerId: customer.id, 
      email: customer.email 
    });
    
    return customer.id;
  } catch (error) {
    console.error('❌ Error creating Stripe customer:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
      email
    });
    throw error;
  }
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
  console.log('🔍 createCheckoutSession called:', {
    customerId,
    priceId,
    successUrl,
    cancelUrl,
    userId
  });
  
  try {
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
    
    console.log('✅ Stripe checkout session created:', {
      sessionId: session.id,
      customerId: session.customer,
      url: session.url,
      mode: session.mode
    });
    
    return session;
  } catch (error) {
    console.error('❌ Error creating Stripe checkout session:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stripeErrorType: error instanceof Stripe.errors.StripeError ? error.type : undefined,
      stripeErrorCode: error instanceof Stripe.errors.StripeError ? error.code : undefined,
      customerId,
      priceId
    });
    throw error;
  }
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