import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/contexts/AuthContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Photomate AI",
  description: "Transform your selfies into professional portraits",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL!),
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" }, // More accurate approximation of oklch(0.145 0 0)
  ],
  openGraph: {
    title: "Photomate AI",
    description: "Transform your selfies into professional portraits",
    images: [
      {
        url: "/social.png",
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
            <main className="min-h-screen">
              {children}
            </main>
            <Toaster />
            <Analytics />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
