import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { ActionButtons } from "@/components/ActionButtons";

export const metadata: Metadata = {
  title: "Photomate AI - App",
  description: "Create and manage your AI-generated images",
};

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen flex-col relative">
      <ActionButtons position="top-right" showAuthButton={false} />
      
      <main className="flex-1">
        {children}
      </main>
      
      <Toaster />
    </div>
  );
} 