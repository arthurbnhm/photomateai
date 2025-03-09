import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ActionButtons } from "@/components/ActionButtons";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Photomate AI",
  description: "Generate stunning images with AI using simple text prompts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
        >
          <ActionButtons hideSignOutOnHomepage={true} />
          <main className="min-h-screen pt-16 md:pt-12">
            {children}
          </main>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
