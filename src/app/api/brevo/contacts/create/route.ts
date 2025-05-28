export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import * as brevo from '@getbrevo/brevo';
import { 
  createBrevoContactsClient, 
  validateEmail, 
  normalizeEmail, 
  isBrevoApiConfigured,
  handleBrevoError,
  type BrevoContactAttributes
} from '@/lib/brevo/client';

interface CreateContactRequest {
  email: string;
  firstName?: string;
  lastName?: string;
  attributes?: Record<string, unknown>;
  listIds?: number[];
  updateEnabled?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    // Create Supabase client
    const supabase = await createSupabaseServerClient();
    
    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    // Check if user is authenticated
    if (!user || userError) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be logged in to use this API' },
        { status: 401 }
      );
    }

    // Check if Brevo API key is configured
    if (!isBrevoApiConfigured()) {
      return NextResponse.json(
        { 
          error: 'Brevo API key not configured',
          details: 'Please add BREVO_API_KEY to your environment variables'
        },
        { status: 500 }
      );
    }

    // Parse request body
    const body: CreateContactRequest = await request.json();
    const { email, firstName, lastName, attributes = {}, listIds = [], updateEnabled = true } = body;

    // Validate required fields
    if (!email || !email.trim()) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Validate email format
    if (!validateEmail(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Normalize email
    const normalizedEmail = normalizeEmail(email);

    // Create Brevo client
    const apiInstance = createBrevoContactsClient();

    // Prepare contact data
    const contactData = new brevo.CreateContact();
    contactData.email = normalizedEmail;
    
    // Set attributes
    const contactAttributes: BrevoContactAttributes = { ...attributes };
    if (firstName) contactAttributes.FIRSTNAME = firstName;
    if (lastName) contactAttributes.LASTNAME = lastName;
    
    // Add user metadata
    contactAttributes.USER_ID = user.id;
    contactAttributes.CREATED_VIA = 'PhotomateAI_API';
    contactAttributes.CREATED_AT = new Date().toISOString();
    
    contactData.attributes = contactAttributes;
    
    // Set list IDs if provided
    if (listIds.length > 0) {
      contactData.listIds = listIds;
    }
    
    // Set update enabled
    contactData.updateEnabled = updateEnabled;

    // Create contact in Brevo
    const response = await apiInstance.createContact(contactData);

    return NextResponse.json({
      success: true,
      message: 'Contact created successfully',
      data: {
        id: response.body?.id,
        email: normalizedEmail,
        attributes: contactAttributes
      }
    });

  } catch (error: unknown) {
    console.error('Error creating Brevo contact:', error);
    
    const { message, status } = handleBrevoError(error);
    
    return NextResponse.json(
      { 
        error: status === 409 ? 'Contact already exists' : 'Failed to create contact',
        details: message
      },
      { status }
    );
  }
} 