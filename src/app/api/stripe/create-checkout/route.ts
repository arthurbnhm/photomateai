import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateStripeCustomer, createCheckoutSession, PRICE_IDS } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  try {
    console.log('🚀 Starting checkout session creation...');
    
    // Get the plan from the request body
    const { plan } = await req.json();
    console.log('📋 Plan requested:', plan);
    
    if (!plan || !PRICE_IDS[plan as keyof typeof PRICE_IDS]) {
      console.error('❌ Invalid plan specified:', plan);
      return NextResponse.json(
        { error: 'Invalid plan specified', details: `Plan "${plan}" is not valid. Available plans: ${Object.keys(PRICE_IDS).join(', ')}` },
        { status: 400 }
      );
    }
    
    // Get the current user
    console.log('🔍 Getting user from Supabase...');
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError) {
      console.error('❌ Supabase auth error:', userError);
      return NextResponse.json(
        { error: 'Authentication error', details: userError.message },
        { status: 401 }
      );
    }
    
    if (!user) {
      console.error('❌ No user found in session');
      return NextResponse.json(
        { error: 'Authentication required', details: 'No user session found' },
        { status: 401 }
      );
    }
    
    console.log('✅ User authenticated:', user.id, user.email);
    
    // Get the user's email
    const email = user.email;
    if (!email) {
      console.error('❌ User email not found for user:', user.id);
      return NextResponse.json(
        { error: 'User email not found', details: 'User account missing email address' },
        { status: 400 }
      );
    }
    
    // Get or create Stripe customer
    console.log('💳 Creating/getting Stripe customer...');
    const customerId = await getOrCreateStripeCustomer(user.id, email);
    console.log('✅ Stripe customer ID:', customerId);
    
    // Get the price ID for the selected plan
    const priceId = PRICE_IDS[plan as keyof typeof PRICE_IDS];
    console.log('💰 Price ID for plan:', priceId);
    
    // Set up success and cancel URLs
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const successUrl = `${baseUrl}/create?subscription_success=true`;
    const cancelUrl = `${baseUrl}/plans?subscription_canceled=true`;
    
    console.log('🔗 URLs configured:', { baseUrl, successUrl, cancelUrl });
    
    // Create Stripe checkout session
    console.log('🏪 Creating Stripe checkout session...');
    const session = await createCheckoutSession({
      customerId,
      priceId,
      successUrl,
      cancelUrl,
      userId: user.id,
    });
    
    console.log('✅ Checkout session created:', session.id, session.url);
    
    // Return the checkout URL
    return NextResponse.json({ url: session.url });
    
  } catch (error) {
    console.error('💥 Error creating checkout session:', error);
    
    // More detailed error reporting
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    console.error('Error details:', {
      message: errorMessage,
      stack: errorStack,
      name: error instanceof Error ? error.name : 'Unknown',
    });
    
    return NextResponse.json(
      { 
        error: 'Failed to create checkout session',
        details: errorMessage,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
} 