import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import Stripe from 'stripe';
import { SupabaseClient } from '@supabase/supabase-js';

// This is the Stripe webhook handler
export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature')!;

  // Verify webhook signature
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: unknown) {
    const error = err as Error;
    console.error(`Webhook signature verification failed: ${error.message}`);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Initialize Supabase admin client
  const supabase = createSupabaseAdminClient();

  // Process different event types
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        const checkoutSession = event.data.object as Stripe.Checkout.Session;
        
        // Skip if not a subscription
        if (checkoutSession.mode !== 'subscription') break;
        
        // Get customer & subscription data
        const customerId = checkoutSession.customer as string;
        const subscriptionId = checkoutSession.subscription as string;
        
        // Get subscription details from Stripe
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0].price.id;
        
        // Determine plan based on price ID
        let plan = 'basic';
        if (priceId === 'price_1R1VuRIvAcEHQuzpHBcYDBfN') {
          plan = 'professional';
        } else if (priceId === 'price_1R1VucIvAcEHQuzpk38ptDFA') {
          plan = 'executive';
        }
        
        // Find the user ID using various methods
        let userId: string | null = null;
        
        // 1. Check checkout session metadata
        if (checkoutSession.metadata && checkoutSession.metadata.userId) {
          userId = checkoutSession.metadata.userId;
        }
        
        // 2. If not found, check Stripe customer metadata
        if (!userId) {
          const customer = await stripe.customers.retrieve(customerId);
          if (customer && !customer.deleted && customer.metadata && customer.metadata.userId) {
            userId = customer.metadata.userId;
          }
        }
        
        // 3. If still not found, try to find user by email
        if (!userId) {
          const customer = await stripe.customers.retrieve(customerId);
          const customerEmail = customer.deleted ? null : customer.email;
          
          if (customerEmail) {
            const { data: userByEmail } = await supabase
              .from('users')
              .select('id')
              .eq('email', customerEmail)
              .single();
            
            if (userByEmail) {
              userId = userByEmail.id;
            }
          }
        }
        
        // If we couldn't find the user ID, log an error and stop
        if (!userId) {
          console.error(`No user found for customer ID ${customerId}`);
          break;
        }
        
        // Create or update subscription record
        const now = new Date().toISOString();
        await supabase
          .from('subscriptions')
          .upsert({
            user_id: userId,
            plan,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            is_active: true,
            subscription_start_date: now,
            // Credits and models remaining will be set by a database trigger
          }, {
            onConflict: 'user_id',
          });
        
        break;
      
      case 'invoice.payment_succeeded':
        const invoice = event.data.object as Stripe.Invoice;
        
        // Skip if not related to a subscription
        if (!invoice.subscription) break;
        
        // Get the subscription ID and customer ID
        const invoiceSubscriptionId = invoice.subscription as string;
        const invoiceCustomerId = invoice.customer as string;
        
        // Get the subscription details
        const invoiceSubscription = await stripe.subscriptions.retrieve(invoiceSubscriptionId);
        const invoicePriceId = invoiceSubscription.items.data[0].price.id;
        
        // Determine plan based on price ID
        let invoicePlan = 'basic';
        if (invoicePriceId === 'price_1R1VuRIvAcEHQuzpHBcYDBfN') {
          invoicePlan = 'professional';
        } else if (invoicePriceId === 'price_1R1VucIvAcEHQuzpk38ptDFA') {
          invoicePlan = 'executive';
        }
        
        // Check if this is a recurring payment by looking at the billing_reason
        const isRecurring = invoice.billing_reason === 'subscription_cycle';
        
        // Find the subscription in our database
        const { data: existingSubscription } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('stripe_subscription_id', invoiceSubscriptionId)
          .single();
        
        if (existingSubscription) {
          // Update the existing subscription
          const updateData: {
            plan: string;
            is_active: boolean;
            last_payment_date: string;
            current_period_end?: string;
          } = {
            plan: invoicePlan,
            is_active: true,
            last_payment_date: new Date().toISOString(),
          };
          
          // If it's a recurring payment, update the subscription period
          if (isRecurring) {
            // Calculate the next billing date based on the current period end
            updateData.current_period_end = new Date(invoiceSubscription.current_period_end * 1000).toISOString();
          }
          
          await supabase
            .from('subscriptions')
            .update(updateData)
            .eq('stripe_subscription_id', invoiceSubscriptionId);
        } else {
          // This is unusual - we should have a subscription record from checkout.session.completed
          // But just in case, try to find the user and create a subscription record
          
          // Try to find the user ID from customer metadata
          const customer = await stripe.customers.retrieve(invoiceCustomerId);
          let invoiceUserId: string | null = null;
          
          if (!customer.deleted && customer.metadata && customer.metadata.userId) {
            invoiceUserId = customer.metadata.userId;
          } else if (!customer.deleted && customer.email) {
            // Try to find user by email
            const { data: userByEmail } = await supabase
              .from('users')
              .select('id')
              .eq('email', customer.email)
              .single();
            
            if (userByEmail) {
              invoiceUserId = userByEmail.id;
            }
          }
          
          if (invoiceUserId) {
            // Create a new subscription record
            const now = new Date().toISOString();
            const periodEnd = new Date(invoiceSubscription.current_period_end * 1000).toISOString();
            
            await supabase
              .from('subscriptions')
              .insert({
                user_id: invoiceUserId,
                plan: invoicePlan,
                stripe_customer_id: invoiceCustomerId,
                stripe_subscription_id: invoiceSubscriptionId,
                is_active: true,
                subscription_start_date: now,
                last_payment_date: now,
                current_period_end: periodEnd,
              });
          } else {
            console.error(`No user found for customer ID ${invoiceCustomerId} in invoice.payment_succeeded`);
          }
        }
        
        break;
      
      case 'customer.subscription.updated':
        const updatedSubscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionChange(supabase, updatedSubscription);
        break;
      
      case 'customer.subscription.deleted':
        const deletedSubscription = event.data.object as Stripe.Subscription;
        
        // Mark subscription as inactive
        await supabase
          .from('subscriptions')
          .update({
            is_active: false,
          })
          .eq('stripe_subscription_id', deletedSubscription.id);
        
        break;
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// Helper to handle subscription updates
async function handleSubscriptionChange(supabase: SupabaseClient, subscription: Stripe.Subscription) {
  // Get the current price ID and status
  const priceId = subscription.items.data[0].price.id;
  const isActive = subscription.status === 'active' || subscription.status === 'trialing';
  
  // Determine plan based on price ID
  let plan = 'basic';
  if (priceId === 'price_1R1VuRIvAcEHQuzpHBcYDBfN') {
    plan = 'professional';
  } else if (priceId === 'price_1R1VucIvAcEHQuzpk38ptDFA') {
    plan = 'executive';
  }
  
  // Update subscription in database
  await supabase
    .from('subscriptions')
    .update({
      plan,
      is_active: isActive,
    })
    .eq('stripe_subscription_id', subscription.id);
} 