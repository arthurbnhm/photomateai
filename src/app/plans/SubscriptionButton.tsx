'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

interface PlanFormProps {
  plan: string;
  className?: string;
  variant?: 'default' | 'outline';
}

export default function PlanForm({ plan, className, variant = 'outline' }: PlanFormProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      console.log('🚀 Starting checkout for plan:', plan);
      
      // Call the API endpoint to create a checkout session
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan }),
      });

      const data = await response.json();
      console.log('📝 API Response:', { status: response.status, data });

      if (!response.ok) {
        const errorMessage = data.details ? `${data.error}: ${data.details}` : (data.error || 'Failed to create checkout session');
        console.error('❌ API Error:', errorMessage);
        throw new Error(errorMessage);
      }

      // Redirect to Stripe checkout
      if (data.url) {
        console.log('✅ Redirecting to:', data.url);
        
        // Try multiple redirect methods for better browser compatibility
        try {
          // Method 1: Direct location assignment (most reliable)
          window.location.href = data.url;
        } catch (redirectError) {
          console.error('❌ Direct redirect failed, trying alternatives:', redirectError);
          
          // Method 2: Try window.open as backup
          try {
            const newWindow = window.open(data.url, '_self');
            if (!newWindow) {
              throw new Error('Popup blocked');
            }
          } catch (popupError) {
            console.error('❌ Popup redirect failed:', popupError);
            
            // Method 3: Show manual link as last resort
            alert(`Please click this link to complete your subscription: ${data.url}`);
          }
        }
      } else {
        throw new Error('No checkout URL returned from server');
      }
    } catch (error) {
      console.error('💥 Checkout error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to create checkout session';
      
      // Show a more user-friendly error message
      if (errorMessage.includes('Authentication required') || errorMessage.includes('No user session')) {
        alert('Please log in again and try subscribing. Your session may have expired.');
      } else if (errorMessage.includes('User email not found')) {
        alert('There was an issue with your account. Please contact support.');
      } else {
        alert(`Error: ${errorMessage}\n\nPlease try again or contact support if the issue persists.`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={className}>
      <Button 
        variant={variant} 
        type="submit" 
        className="w-full group"
        disabled={isLoading}
      >
        {isLoading ? 'Loading...' : 'Select'}
        {!isLoading && (
          <ArrowRight className="w-4 h-4 ml-2 relative top-[1px] group-hover:translate-x-0.5 transition-transform duration-150" />
        )}
      </Button>
    </form>
  );
} 