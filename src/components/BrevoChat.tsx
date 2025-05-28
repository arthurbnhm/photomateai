"use client"

import { useEffect } from 'react'
import Script from 'next/script'
import { useAuth } from '@/contexts/AuthContext'

declare global {
  interface Window {
    BrevoConversations: (action: string, data?: Record<string, unknown>) => void
    BrevoConversationsSetup: {
      chatWidth?: number
      chatHeight?: number
      buttonPosition?: string
      zIndex?: number
      colors?: {
        buttonText?: string
        buttonBg?: string
      }
      visitorId?: string
    }
  }
}

export function BrevoChat() {
  const { user, credits, isAuthenticated } = useAuth()

  // Update user data when auth state changes
  useEffect(() => {
    if (typeof window !== 'undefined' && window.BrevoConversations && isAuthenticated && user) {
      // Generate a safe visitor ID based on user ID (hashed for security)
      const visitorId = btoa(user.id).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32)
      
      // Safely pass user data to Brevo
      window.BrevoConversations('updateIntegrationData', {
        email: user.email,
        // Only pass safe, non-sensitive data
        userId: user.id,
        plan: credits?.plan || 'free',
        subscriptionActive: credits?.subscription_active || false,
        creditsRemaining: credits?.credits_remaining || 0,
        modelsRemaining: credits?.models_remaining || 0,
        // Custom properties for support context
        userType: credits?.subscription_active ? 'subscriber' : 'free_user',
        signupDate: user.created_at ? new Date(user.created_at).toLocaleDateString() : null,
      })

      // Set visitor ID for conversation continuity
      if (window.BrevoConversationsSetup) {
        window.BrevoConversationsSetup.visitorId = visitorId
      }
    }
  }, [user, credits, isAuthenticated])

  return (
    <>
      {/* Brevo Conversations Setup */}
      <Script
        id="brevo-conversations-setup"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.BrevoConversationsSetup = {
              chatWidth: 400,
              chatHeight: 600,
              buttonPosition: 'br',
              zIndex: 9999,
              colors: {
                buttonText: '#ffffff',
                buttonBg: '#000000'
              }
            };
          `,
        }}
      />
      
      {/* Brevo Conversations Widget */}
      <Script
        id="brevo-conversations"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            (function(d, w, c) {
              w.BrevoConversationsID = '68356600e57fb931020e79eb';
              w[c] = w[c] || function() {
                (w[c].q = w[c].q || []).push(arguments);
              };
              var s = d.createElement('script');
              s.async = true;
              s.src = 'https://conversations-widget.brevo.com/brevo-conversations.js';
              if (d.head) d.head.appendChild(s);
            })(document, window, 'BrevoConversations');
          `,
        }}
      />
    </>
  )
} 