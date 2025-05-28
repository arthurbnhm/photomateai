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

interface UpdateContactRequest {
  email?: string;
  contactId?: string;
  attributes?: Record<string, unknown>;
  listIds?: number[];
  unlinkListIds?: number[];
}

export async function PUT(request: NextRequest) {
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
    const body: UpdateContactRequest = await request.json();
    const { email, contactId, attributes = {}, listIds = [], unlinkListIds = [] } = body;

    // Validate that either email or contactId is provided
    if (!email && !contactId) {
      return NextResponse.json(
        { error: 'Either email or contactId is required' },
        { status: 400 }
      );
    }

    // Validate email format if provided
    if (email && !validateEmail(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Normalize email if provided
    const normalizedEmail = email ? normalizeEmail(email) : undefined;

    // Create Brevo client
    const apiInstance = createBrevoContactsClient();

    // Prepare contact data
    const updateContact = new brevo.UpdateContact();
    
    // Set attributes with metadata
    const contactAttributes: BrevoContactAttributes = { ...attributes };
    contactAttributes.UPDATED_VIA = 'PhotomateAI_API';
    contactAttributes.UPDATED_AT = new Date().toISOString();
    contactAttributes.UPDATED_BY_USER_ID = user.id;
    
    updateContact.attributes = contactAttributes;
    
    // Set list operations if provided
    if (listIds.length > 0) {
      updateContact.listIds = listIds;
    }
    
    if (unlinkListIds.length > 0) {
      updateContact.unlinkListIds = unlinkListIds;
    }

    // Determine the identifier to use
    const identifier = contactId || normalizedEmail!;

    // Update contact in Brevo
    await apiInstance.updateContact(identifier, updateContact);

    return NextResponse.json({
      success: true,
      message: 'Contact updated successfully',
      data: {
        identifier,
        attributes: contactAttributes
      }
    });

  } catch (error: unknown) {
    console.error('Error updating Brevo contact:', error);
    
    const { message, status } = handleBrevoError(error);
    
    return NextResponse.json(
      { 
        error: status === 404 ? 'Contact not found' : 'Failed to update contact',
        details: message
      },
      { status }
    );
  }
} 