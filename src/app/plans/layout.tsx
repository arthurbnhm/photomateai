import { createClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/Navbar";

export default async function PlansLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side protection for the plans page
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (!user || userError) {
    redirect("/auth/login");
  }

  return (
    <>
      <Navbar />
      {children}
    </>
  );
} 