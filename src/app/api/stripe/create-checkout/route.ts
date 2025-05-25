import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateStripeCustomer, createCheckoutSession, PRICE_IDS } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  console.log('🚀 Starting checkout session creation...');
  
  try {
    // Get the plan from the request body
    console.log('📦 Parsing request body...');
    const { plan } = await req.json();
    console.log('📦 Request body parsed, plan:', plan);
    
    if (!plan || !PRICE_IDS[plan as keyof typeof PRICE_IDS]) {
      console.error('❌ Invalid plan specified:', plan);
      console.log('📋 Available plans:', Object.keys(PRICE_IDS));
      return NextResponse.json(
        { error: 'Invalid plan specified' },
        { status: 400 }
      );
    }
    
    console.log('✅ Plan validation passed');
    
    // Get the current user
    console.log('👤 Getting current user from Supabase...');
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    console.log('👤 Supabase auth result:', {
      hasUser: !!user,
      userId: user?.id,
      userEmail: user?.email,
      userError: userError?.message || null
    });
    
    if (!user || userError) {
      console.error('❌ Authentication failed:', {
        hasUser: !!user,
        userError: userError?.message || 'No error message'
      });
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    console.log('✅ User authentication passed');
    
    // Get the user's email
    const email = user.email;
    console.log('📧 User email:', email ? 'exists' : 'missing');
    
    if (!email) {
      console.error('❌ User email not found for user:', user.id);
      return NextResponse.json(
        { error: 'User email not found' },
        { status: 400 }
      );
    }
    
    console.log('✅ User email validation passed');
    
    // Get or create Stripe customer
    console.log('💳 Getting or creating Stripe customer...');
    const customerId = await getOrCreateStripeCustomer(user.id, email);
    console.log('💳 Stripe customer ID:', customerId);
    
    // Get the price ID for the selected plan
    const priceId = PRICE_IDS[plan as keyof typeof PRICE_IDS];
    console.log('💰 Price ID for plan:', priceId);
    
    // Set up success and cancel URLs
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const successUrl = `${baseUrl}/create?subscription_success=true`;
    const cancelUrl = `${baseUrl}/plans?subscription_canceled=true`;
    
    console.log('🔗 Checkout URLs:', {
      baseUrl,
      successUrl,
      cancelUrl
    });
    
    // Create Stripe checkout session
    console.log('🛒 Creating Stripe checkout session...');
    const session = await createCheckoutSession({
      customerId,
      priceId,
      successUrl,
      cancelUrl,
      userId: user.id,
    });
    
    console.log('🛒 Stripe session created:', {
      sessionId: session.id,
      hasUrl: !!session.url,
      url: session.url
    });
    
    // Return the checkout URL
    console.log('✅ Checkout session creation successful, returning URL');
    return NextResponse.json({ url: session.url });
    
  } catch (error) {
    console.error('💥 Error creating checkout session:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace',
      errorType: typeof error,
      errorConstructor: error?.constructor?.name
    });
    
    // Log additional context
    console.error('🔍 Error context:', {
      timestamp: new Date().toISOString(),
      userAgent: req.headers.get('user-agent'),
      origin: req.headers.get('origin'),
      referer: req.headers.get('referer')
    });
    
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
} 