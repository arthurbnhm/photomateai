"use client"

import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 py-16 md:py-32 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background/5 via-background/50 to-background z-0"></div>
        
        {/* Background decorative elements */}
        <div className="absolute top-0 left-0 right-0 h-[500px] bg-gradient-to-br from-purple-500/20 to-blue-500/20 blur-3xl opacity-50 -z-10"></div>
        
        <div className="max-w-4xl mx-auto z-10 mt-4 sm:mt-0">
          <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-blue-600 leading-tight py-1">
            Create Stunning AI Images
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Generate beautiful, unique images with our AI image generator. 
            From artistic creations to realistic scenes - bring your ideas to life.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg" className="font-medium">
              <Link href="/create">Start Creating</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="font-medium">
              <Link href="/create?tab=train">Train Your Model</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
