import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/NavBar";
import { GenerationProvider } from "@/context/GenerationContext";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { ModeToggle } from "@/components/mode-toggle";

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
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange={false}
        >
          <GenerationProvider>
            <div className="fixed top-6 right-6 z-[100] pointer-events-auto">
              <ModeToggle />
            </div>
            
            <div className="flex min-h-screen flex-col relative">
              <NavBar />
              <main className="flex-1">
                {children}
              </main>
            </div>
            <Toaster />
          </GenerationProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
