'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useRouter } from 'next/navigation';

interface PlanFormProps {
  plan: string;
  className?: string;
  variant?: 'default' | 'outline';
}

export default function PlanForm({ plan, className, variant = 'outline' }: PlanFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Call the API endpoint to create a checkout session
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      // Redirect to Stripe checkout
      if (data.url) {
        router.push(data.url);
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      alert('Failed to create checkout session. Please try again.');
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