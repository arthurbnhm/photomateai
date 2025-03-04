import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/NavBar";
import { GenerationProvider } from "@/context/GenerationContext";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AI Image Generator",
  description: "Generate stunning images with AI using simple text prompts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <GenerationProvider>
          <div className="flex min-h-screen flex-col">
            <NavBar />
            <main className="flex-1">
              {children}
            </main>
          </div>
          <Toaster />
        </GenerationProvider>
      </body>
    </html>
  );
}
