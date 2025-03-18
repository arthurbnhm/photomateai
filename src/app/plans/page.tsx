import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import SubscriptionButton from "./SubscriptionButton";

export default async function PlansPage() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError) {
    return <div>Error loading user data</div>;
  }

  // Check if user already has an active subscription
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user!.id)
    .eq('is_active', true)
    .single();

  // If they have an active and valid subscription, redirect to create page
  if (subscription) {
    const now = new Date();
    const endDate = new Date(subscription.subscription_end_date);
    
    if (now <= endDate) {
      redirect("/create");
    }
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-72px)] justify-center py-8 md:py-12">
      <div className="max-w-5xl mx-auto p-4 sm:p-8">
        <div className="flex flex-col items-center space-y-4 text-center mb-12">
          <div className="flex space-x-2">
            <div className="h-2 w-16 rounded bg-green-500"></div>
            <div className="h-2 w-16 rounded bg-green-500"></div>
            <div className="h-2 w-16 rounded bg-gray-200"></div>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Select a plan</h1>
          <p className="text-muted-foreground max-w-md">
            Subscribe monthly to create unlimited professional headshots.
            Cancel anytime, no hidden fees.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3 mb-12">
          {/* Basic Plan */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-baseline gap-x-2">
                <span className="text-2xl font-bold">$19</span>
                <span className="text-sm text-muted-foreground">• Basic</span>
              </CardTitle>
              <CardDescription className="space-y-2">
                <span className="block space-y-2">
                  <span className="flex items-center gap-x-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Take 50 AI Photos (credits)</span>
                  </span>
                  <span className="flex items-center gap-x-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Create 1 AI Model per month</span>
                  </span>
                  <span className="flex items-center gap-x-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Flux™ 1.1 photorealistic model</span>
                  </span>
                </span>
              </CardDescription>
            </CardHeader>
            <CardFooter className="mt-auto flex justify-end">
              <SubscriptionButton plan="basic" className="w-full sm:w-32" />
            </CardFooter>
          </Card>

          {/* Professional Plan */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-baseline gap-x-2">
                <span className="text-2xl font-bold">$49</span>
                <span className="text-sm text-muted-foreground">• Professional</span>
              </CardTitle>
              <CardDescription className="space-y-2">
                <span className="block space-y-2">
                  <span className="flex items-center gap-x-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Take 1,000 AI Photos (credits)</span>
                  </span>
                  <span className="flex items-center gap-x-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Create 3 AI Models per month</span>
                  </span>
                  <span className="flex items-center gap-x-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Flux™ 1.1 photorealistic model</span>
                  </span>
                  <span className="flex items-center gap-x-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Upscaler (coming soon)</span>
                  </span>
                  <span className="flex items-center gap-x-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Animate Images (coming soon)</span>
                  </span>
                </span>
              </CardDescription>
            </CardHeader>
            <CardFooter className="mt-auto flex justify-end">
              <SubscriptionButton plan="professional" className="w-full sm:w-32" variant="default" />
            </CardFooter>
          </Card>

          {/* Executive Plan */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-baseline gap-x-2">
                <span className="text-2xl font-bold">$79</span>
                <span className="text-sm text-muted-foreground">• Executive</span>
              </CardTitle>
              <CardDescription className="space-y-2">
                <span className="block space-y-2">
                  <span className="flex items-center gap-x-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Take 3,000 AI Photos (credits)</span>
                  </span>
                  <span className="flex items-center gap-x-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Create 10 AI Models per month</span>
                  </span>
                  <span className="flex items-center gap-x-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Flux™ 1.1 photorealistic model</span>
                  </span>
                  <span className="flex items-center gap-x-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Upscaler (coming soon)</span>
                  </span>
                  <span className="flex items-center gap-x-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Animate Images (coming soon)</span>
                  </span>
                </span>
              </CardDescription>
            </CardHeader>
            <CardFooter className="mt-auto flex justify-end">
              <SubscriptionButton plan="executive" className="w-full sm:w-32" />
            </CardFooter>
          </Card>
        </div>

        <div className="text-center text-sm text-muted-foreground">
          Used by 10,000+ happy customers
        </div>
      </div>
    </div>
  );
} 