import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateStripeCustomer, createCheckoutSession, PRICE_IDS } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  try {
    // Get the plan from the request body
    const { plan } = await req.json();
    
    if (!plan || !PRICE_IDS[plan as keyof typeof PRICE_IDS]) {
      return NextResponse.json(
        { error: 'Invalid plan specified' },
        { status: 400 }
      );
    }
    
    // Get the current user
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (!user || userError) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    // Get the user's email
    const email = user.email;
    if (!email) {
      return NextResponse.json(
        { error: 'User email not found' },
        { status: 400 }
      );
    }
    
    // Get or create Stripe customer
    const customerId = await getOrCreateStripeCustomer(user.id, email);
    
    // Get the price ID for the selected plan
    const priceId = PRICE_IDS[plan as keyof typeof PRICE_IDS];
    
    // Set up success and cancel URLs
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const successUrl = `${baseUrl}/create?subscription_success=true`;
    const cancelUrl = `${baseUrl}/plans?subscription_canceled=true`;
    
    // Create Stripe checkout session
    const session = await createCheckoutSession({
      customerId,
      priceId,
      successUrl,
      cancelUrl,
      userId: user.id,
    });
    
    // Return the checkout URL
    return NextResponse.json({ url: session.url });
    
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
} 