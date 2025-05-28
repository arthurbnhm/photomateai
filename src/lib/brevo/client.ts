import * as brevo from '@getbrevo/brevo';

// Initialize Brevo API clients
export const createBrevoContactsClient = () => {
  const apiInstance = new brevo.ContactsApi();
  apiInstance.setApiKey(brevo.ContactsApiApiKeys.apiKey, process.env.BREVO_API_KEY || '');
  return apiInstance;
};

export const createBrevoEmailCampaignsClient = () => {
  const apiInstance = new brevo.EmailCampaignsApi();
  apiInstance.setApiKey(brevo.EmailCampaignsApiApiKeys.apiKey, process.env.BREVO_API_KEY || '');
  return apiInstance;
};

export const createBrevoTransactionalEmailsClient = () => {
  const apiInstance = new brevo.TransactionalEmailsApi();
  apiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY || '');
  return apiInstance;
};

// Shared types for API routes
export interface BrevoContactAttributes {
  FIRSTNAME?: string;
  LASTNAME?: string;
  USER_ID?: string;
  CREATED_VIA?: string;
  CREATED_AT?: string;
  UPDATED_VIA?: string;
  UPDATED_AT?: string;
  UPDATED_BY_USER_ID?: string;
  [key: string]: unknown;
}

// Utility functions
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const normalizeEmail = (email: string): string => {
  return email.toLowerCase().trim();
};

export const isBrevoApiConfigured = (): boolean => {
  return !!process.env.BREVO_API_KEY;
};

// Error handling utilities
export interface BrevoApiError {
  response?: {
    status?: number;
    body?: {
      message?: string;
      code?: string;
    };
  };
}

export const handleBrevoError = (error: unknown): { message: string; status: number } => {
  if (error && typeof error === 'object' && 'response' in error) {
    const brevoError = error as BrevoApiError;
    
    if (brevoError.response?.status === 404) {
      return {
        message: 'Contact not found',
        status: 404
      };
    }
    
    if (brevoError.response?.status === 400 && brevoError.response.body?.code === 'duplicate_parameter') {
      return {
        message: 'Contact already exists',
        status: 409
      };
    }
    
    return {
      message: brevoError.response?.body?.message || 'Brevo API error',
      status: brevoError.response?.status || 500
    };
  }
  
  const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
  return {
    message: errorMessage,
    status: 500
  };
}; 