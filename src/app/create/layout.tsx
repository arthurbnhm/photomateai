import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { ModeToggle } from "@/components/ModeToggle";

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
      <div className="fixed top-6 right-6 z-[100] pointer-events-auto">
        <ModeToggle />
      </div>
      
      <main className="flex-1">
        {children}
      </main>
      
      <Toaster />
    </div>
  );
} 