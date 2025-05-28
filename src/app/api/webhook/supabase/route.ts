export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createBrevoContactsClient, isBrevoApiConfigured, normalizeEmail } from '@/lib/brevo/client';
import * as brevo from '@getbrevo/brevo';

interface SupabaseWebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: {
    id: string;
    user_id?: string;
    email?: string;
    email_confirmed_at?: string;
    confirmed_at?: string;
    is_sso_user?: boolean;
    is_active?: boolean;
    raw_app_meta_data?: {
      provider?: string;
      providers?: string[];
    };
    created_at: string;
    [key: string]: unknown;
  };
  old_record?: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  try {
    // Verify webhook signature if configured
    const webhookSecret = process.env.SUPABASE_WEBHOOK_SECRET;
    if (webhookSecret) {
      // Add signature verification logic here if needed
    }

    const payload: SupabaseWebhookPayload = await request.json();
    
    // Handle auth.users INSERT events (new user signups)
    if (payload.type === 'INSERT' && payload.table === 'users' && payload.schema === 'auth') {
      return await handleUserSignup(payload.record);
    }
    
    // Handle subscriptions UPDATE events (subscription changes)
    if (payload.type === 'UPDATE' && payload.table === 'subscriptions' && payload.schema === 'public') {
      return await handleSubscriptionUpdate(payload.record);
    }
    
    return NextResponse.json({ message: 'Event ignored' }, { status: 200 });

  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({ 
      error: 'Webhook processing failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

async function handleUserSignup(user: SupabaseWebhookPayload['record']) {
  if (!user.email) {
    return NextResponse.json({ message: 'No email provided' }, { status: 200 });
  }

  if (!isBrevoApiConfigured()) {
    console.error('Brevo API not configured');
    return NextResponse.json({ error: 'Brevo API not configured' }, { status: 500 });
  }

  try {
    const apiInstance = createBrevoContactsClient();
    const contactData = new brevo.CreateContact();
    contactData.email = normalizeEmail(user.email);
    contactData.extId = user.id;
    contactData.updateEnabled = true;
    contactData.attributes = {
      SUBSCRIPTION: false
    };
    
    const response = await apiInstance.createContact(contactData);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Brevo contact created',
      brevo_id: response.body?.id 
    });

  } catch (brevoError: unknown) {
    console.error('Failed to create Brevo contact:', {
      email: user.email,
      error: brevoError instanceof Error ? brevoError.message : String(brevoError)
    });

    return NextResponse.json({ 
      error: 'Failed to create Brevo contact',
      details: brevoError instanceof Error ? brevoError.message : 'Unknown error'
    }, { status: 500 });
  }
}

async function handleSubscriptionUpdate(subscription: SupabaseWebhookPayload['record']) {
  if (!subscription.user_id) {
    return NextResponse.json({ message: 'No user_id provided' }, { status: 200 });
  }

  if (!isBrevoApiConfigured()) {
    console.error('Brevo API not configured');
    return NextResponse.json({ error: 'Brevo API not configured' }, { status: 500 });
  }

  try {
    const brevoResponse = await fetch(`https://api.brevo.com/v3/contacts/${subscription.user_id}?identifierType=ext_id`, {
      method: 'PUT',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': process.env.BREVO_API_KEY!
      },
      body: JSON.stringify({
        attributes: {
          SUBSCRIPTION: subscription.is_active
        }
      })
    });
    
    if (!brevoResponse.ok) {
      const errorText = await brevoResponse.text();
      throw new Error(`Brevo API error: ${brevoResponse.status} - ${errorText}`);
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Brevo contact subscription updated',
      userId: subscription.user_id,
      subscription: subscription.is_active
    });

  } catch (brevoError: unknown) {
    console.error('Failed to update Brevo contact subscription:', {
      userId: subscription.user_id,
      error: brevoError instanceof Error ? brevoError.message : String(brevoError)
    });

    return NextResponse.json({ 
      error: 'Failed to update Brevo contact subscription',
      details: brevoError instanceof Error ? brevoError.message : 'Unknown error'
    }, { status: 500 });
  }
} 