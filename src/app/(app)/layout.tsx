import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/Navbar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side protection for app pages
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (!user || userError) {
    redirect("/auth/login");
  }

  // Check if user has an active subscription
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single();

  // If no active subscription found, redirect to plans page
  if (!subscription) {
    redirect("/plans");
  }

  // Validate that subscription is still valid (not expired)
  const now = new Date();
  const startDate = new Date(subscription.subscription_start_date);
  const endDate = new Date(subscription.subscription_end_date);

  if (now < startDate || now > endDate) {
    // Update subscription to inactive if expired
    if (now > endDate) {
      await supabase
        .from('subscriptions')
        .update({ is_active: false })
        .eq('user_id', user.id);
    }
    
    redirect("/plans");
  }

  return (
    <>
      <Navbar />
      <div className="pt-16 md:pt-20">
        {children}
      </div>
    </>
  );
} 