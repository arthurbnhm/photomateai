import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ActionButtons } from "@/components/ActionButtons";
import { AuthProvider } from "@/contexts/AuthContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Photomate AI",
  description: "Transform your selfies into professional portraits",
  openGraph: {
    title: "Photomate AI",
    description: "Transform your selfies into professional portraits",
    images: [
      {
        url: "https://tt2qu1wvxjiuahsf.public.blob.vercel-storage.com/social.webp",
        width: 1200,
        height: 630,
        alt: "Photomate AI",
      },
    ],
  },
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
          <AuthProvider>
            <ActionButtons hideSignOutOnHomepage={true} />
            <main className="min-h-screen">
              {children}
            </main>
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
