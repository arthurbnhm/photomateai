"use client"

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ArrowRight, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

interface ReferenceExample {
  id: string;
  name: string;
  reference: string;
  result: string;
  description: string;
  accent: string;
}

const examples: ReferenceExample[] = [
  {
    id: "ariana",
    name: "Elegant",
    reference: "/landing/image_reference_feature/references/ariana.jpeg",
    result: "/landing/image_reference_feature/results/ariana.jpeg",
    description: "Soft lighting",
    accent: "bg-pink-500/10 border-pink-500/30 text-pink-700 dark:text-pink-300"
  },
  {
    id: "black",
    name: "Dramatic",
    reference: "/landing/image_reference_feature/references/black.jpg",
    result: "/landing/image_reference_feature/results/black.jpg",
    description: "Bold contrast",
    accent: "bg-slate-500/10 border-slate-500/30 text-slate-700 dark:text-slate-300"
  },
  {
    id: "eyes",
    name: "Artistic",
    reference: "/landing/image_reference_feature/references/eyes.png",
    result: "/landing/image_reference_feature/results/eyes.jpg",
    description: "Creative focus",
    accent: "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300"
  }
];

export function ImageReferenceShowcase() {
  const [selectedExample, setSelectedExample] = useState<string>(examples[0].id);
  const [autoRotate, setAutoRotate] = useState(true);
  const currentExample = examples.find(ex => ex.id === selectedExample) || examples[0];
  const modelImage = "/landing/image_reference_feature/models/1748166841435-bjfn44.jpg";

  const { user } = useAuth();
  const router = useRouter();

  // Auto-rotation effect - only when autoRotate is true
  useEffect(() => {
    if (!autoRotate) return;

    const interval = setInterval(() => {
      setSelectedExample(currentId => {
        const currentIndex = examples.findIndex(ex => ex.id === currentId);
        const nextIndex = (currentIndex + 1) % examples.length;
        return examples[nextIndex].id;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [autoRotate]);

  // Handle manual selection - stops auto-rotation
  const handleExampleSelect = useCallback((exampleId: string) => {
    setSelectedExample(exampleId);
    setAutoRotate(false);
  }, []);

  // Handle navigation to app or auth
  const handleTryImageReference = useCallback(() => {
    if (user) {
      router.push('/create');
    } else {
      router.push('/auth/login');
    }
  }, [user, router]);

  return (
    <section className="py-12 md:py-20 px-4 bg-gradient-to-b from-background to-muted/20">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 md:mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 rounded-full border border-primary/20 mb-6 shadow-sm">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">New Feature</span>
          </div>
          
          <h2 className="text-2xl md:text-4xl font-bold mb-4 bg-gradient-to-r from-foreground via-foreground to-foreground/80 bg-clip-text text-transparent">
            Image Reference Magic
          </h2>
          
          <p className="text-sm md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Upload any reference photo and transfer its style to your AI model.
          </p>
        </div>

        {/* Style Selector */}
        <div className="flex justify-center gap-4 md:gap-6 mb-8">
          {examples.map((example) => (
            <button
              key={example.id}
              onClick={() => handleExampleSelect(example.id)}
              className={cn(
                "relative w-12 h-12 md:w-16 md:h-16 rounded-xl overflow-hidden transition-all duration-300",
                selectedExample === example.id
                  ? "shadow-lg scale-110 ring-2 ring-primary/50"
                  : "shadow-md hover:shadow-lg hover:scale-105"
              )}
            >
              <Image
                src={example.reference}
                alt={example.name}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 48px, 64px"
              />
            </button>
          ))}
        </div>

        {/* Main Demo */}
        <div className="bg-background/80 backdrop-blur-sm border border-border/40 rounded-2xl md:rounded-3xl p-4 md:p-8 shadow-lg">
          
          {/* Process flow */}
          <div className="flex items-center justify-center gap-3 md:gap-8">
            
            {/* Reference Image */}
            <div className="flex flex-col items-center space-y-2 md:space-y-3 flex-1">
              <div 
                key={`ref-${selectedExample}`}
                className="relative w-16 h-16 md:w-24 md:h-24 lg:w-32 lg:h-32 rounded-lg md:rounded-xl overflow-hidden border-2 border-white shadow-lg transition-all duration-300"
              >
                <Image
                  src={currentExample.reference}
                  alt="Reference"
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 64px, (max-width: 1024px) 96px, 128px"
                />
              </div>
              <div className="text-center">
                <p className="text-xs md:text-sm font-semibold text-foreground">Reference Style</p>
                <p className="text-xs text-muted-foreground hidden sm:block">Upload any photo</p>
              </div>
            </div>

            {/* Plus symbol */}
            <div className="flex items-center justify-center">
              <div className="w-6 h-6 md:w-8 md:h-8 bg-primary rounded-full flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-xs md:text-sm">+</span>
              </div>
            </div>

            {/* Your Model */}
            <div className="flex flex-col items-center space-y-2 md:space-y-3 flex-1">
              <div className="relative w-16 h-16 md:w-24 md:h-24 lg:w-32 lg:h-32 rounded-lg md:rounded-xl overflow-hidden border-2 border-white shadow-lg">
                <Image
                  src={modelImage}
                  alt="Your model"
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 64px, (max-width: 1024px) 96px, 128px"
                />
              </div>
              <div className="text-center">
                <p className="text-xs md:text-sm font-semibold text-foreground">Your AI Model</p>
                <p className="text-xs text-muted-foreground hidden sm:block">Trained on your photos</p>
              </div>
            </div>

            {/* Equals symbol */}
            <div className="flex items-center justify-center">
              <div className="w-6 h-6 md:w-8 md:h-8 bg-primary rounded-full flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-xs md:text-sm">=</span>
              </div>
            </div>

            {/* Result */}
            <div className="flex flex-col items-center space-y-2 md:space-y-3 flex-1">
              <div className="relative">
                <div 
                  key={`result-${selectedExample}`}
                  className="relative w-16 h-16 md:w-24 md:h-24 lg:w-32 lg:h-32 rounded-lg md:rounded-xl overflow-hidden border-2 border-white shadow-lg transition-all duration-300"
                >
                  <Image
                    src={currentExample.result}
                    alt="AI result"
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 64px, (max-width: 1024px) 96px, 128px"
                  />
                  
                  {/* Magic sparkle effect */}
                  <div className="absolute top-1 right-1 w-3 h-3 md:w-4 md:h-4 bg-primary/90 rounded-full flex items-center justify-center">
                    <Sparkles className="w-1.5 h-1.5 md:w-2 md:h-2 text-white" />
                  </div>
                </div>
              </div>
              <div className="text-center">
                <p className="text-xs md:text-sm font-semibold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">Perfect Result</p>
                <p className="text-xs text-muted-foreground hidden sm:block">Style transferred seamlessly</p>
              </div>
            </div>
          </div>

          {/* Bottom explanation */}
          <div className="mt-6 md:mt-8 pt-4 md:pt-6 border-t border-border/30">
            <div className="text-center max-w-2xl mx-auto">
              <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                See a photo with the perfect vibe? Our AI captures what makes it special – the mood, lighting, and style – then works its magic to recreate that same energy with your face! ✨
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-8">
          <p className="text-sm md:text-base text-muted-foreground mb-4 font-medium">
            Ready to create your own magic?
          </p>
          <motion.button 
            className="group inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-primary via-primary to-primary/90 hover:from-primary/90 hover:via-primary/95 hover:to-primary/80 text-primary-foreground rounded-full font-semibold text-sm shadow-lg hover:shadow-xl transition-all duration-300"
            whileHover={{ scale: 1.05, y: -1 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleTryImageReference}
          >
            Try Image Reference
            <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
          </motion.button>
        </div>
      </div>
    </section>
  );
} 