"use client"

import { useState, useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
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
  const currentExample = examples.find(ex => ex.id === selectedExample) || examples[0];
  const modelImage = "/landing/image_reference_feature/models/1748166841435-bjfn44.jpg";

  // Import necessary hooks for navigation
  const { user } = useAuth();
  const router = useRouter();

  // Auto-rotation effect
  useEffect(() => {
    const interval = setInterval(() => {
      setSelectedExample(currentId => {
        const currentIndex = examples.findIndex(ex => ex.id === currentId);
        const nextIndex = (currentIndex + 1) % examples.length;
        return examples[nextIndex].id;
      });
    }, 3000); // Switch every 3 seconds

    return () => clearInterval(interval);
  }, []);

  // Handle manual selection (this will reset the auto-rotation timer)
  const handleExampleSelect = (exampleId: string) => {
    setSelectedExample(exampleId);
  };

  // Handle navigation to app or auth
  const handleTryImageReference = () => {
    if (user) {
      router.push('/create');
    } else {
      router.push('/auth/login');
    }
  };

  return (
    <section className="py-12 md:py-20 px-4 bg-gradient-to-b from-background to-muted/20 overflow-hidden">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 md:mb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 rounded-full border border-primary/20 mb-6 shadow-sm"
          >
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">New Feature</span>
          </motion.div>
          
          <motion.h2 
            className="text-2xl md:text-4xl font-bold mb-4 bg-gradient-to-r from-foreground via-foreground to-foreground/80 bg-clip-text text-transparent"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true }}
          >
            Image Reference Magic
          </motion.h2>
          
          <motion.p 
            className="text-sm md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            viewport={{ once: true }}
          >
            Upload any reference photo and transfer its style to your AI model.
          </motion.p>
        </div>

        {/* Style Selector */}
        <div className="flex justify-center gap-6 mb-8">
          {examples.map((example, index) => (
            <motion.button
              key={example.id}
              onClick={() => handleExampleSelect(example.id)}
              className="relative group cursor-pointer"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.95 }}
            >
              {/* Background glow effect - positioned behind everything */}
              {selectedExample === example.id && (
                <motion.div
                  className={cn(
                    "absolute -inset-6 rounded-3xl blur-2xl opacity-60",
                    example.id === "ariana" && "bg-gradient-to-r from-pink-400/40 via-rose-400/50 to-pink-400/40",
                    example.id === "black" && "bg-gradient-to-r from-purple-400/40 via-violet-400/50 to-purple-400/40", 
                    example.id === "eyes" && "bg-gradient-to-r from-blue-400/40 via-indigo-400/50 to-blue-400/40"
                  )}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 0.6, scale: 1 }}
                  transition={{ duration: 0.5 }}
                />
              )}
              
              {/* Image container with proper border */}
              <div className={cn(
                "relative w-16 h-16 md:w-20 md:h-20 rounded-2xl overflow-hidden transition-all duration-300",
                selectedExample === example.id
                  ? "shadow-2xl scale-110 ring-3 ring-white/80"
                  : "shadow-lg hover:shadow-xl hover:scale-105"
              )}>
                <Image
                  src={example.reference}
                  alt={example.name}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-110"
                  sizes="(max-width: 768px) 64px, 80px"
                />
              </div>
            </motion.button>
          ))}
        </div>

        {/* Enhanced Main Demo */}
        <div className="relative">
          {/* Background decoration - adjusted positioning */}
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 rounded-3xl blur-3xl -z-10" />
          
          {/* Main flow container */}
          <div className="relative bg-background/80 backdrop-blur-sm border border-border/40 rounded-2xl md:rounded-3xl p-4 md:p-8 lg:p-12 shadow-lg overflow-hidden">
            
            {/* Process flow - horizontal on all screen sizes */}
            <div className="flex items-center justify-center gap-2 md:gap-8 lg:gap-12">
              
              {/* Reference Image */}
              <div className="flex flex-col items-center space-y-2 md:space-y-4 flex-1">
                <div className="relative group">
                  <div className="absolute -inset-2 md:-inset-3 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-2xl blur-lg opacity-0 group-hover:opacity-100 transition-all duration-500" />
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={selectedExample}
                      initial={{ opacity: 0, scale: 0.9, rotateY: -5 }}
                      animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                      exit={{ opacity: 0, scale: 0.9, rotateY: 5 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-32 md:h-32 lg:w-40 lg:h-40 rounded-lg md:rounded-2xl overflow-hidden border-2 md:border-4 border-white shadow-lg md:shadow-2xl group-hover:shadow-3xl transition-all duration-500 mx-auto"
                    >
                      <Image
                        src={currentExample.reference}
                        alt="Reference"
                        fill
                        className="object-cover transition-transform duration-700 group-hover:scale-110"
                        sizes="(max-width: 640px) 64px, (max-width: 768px) 80px, (max-width: 1024px) 128px, 160px"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
                    </motion.div>
                  </AnimatePresence>
                </div>
                <div className="text-center">
                  <p className="text-xs md:text-sm font-semibold text-foreground">Reference Style</p>
                  <p className="text-xs text-muted-foreground hidden sm:block">Upload any photo</p>
                </div>
              </div>

              {/* Plus symbol */}
              <div className="flex items-center justify-center">
                <div className="relative">
                  <div className="w-6 h-6 md:w-12 md:h-12 bg-gradient-to-r from-primary to-primary/80 rounded-full flex items-center justify-center shadow-lg">
                    <span className="text-white font-bold text-xs md:text-xl">+</span>
                  </div>
                  <div className="absolute inset-0 bg-primary/30 rounded-full blur-md animate-pulse" />
                </div>
              </div>

              {/* Your Model */}
              <div className="flex flex-col items-center space-y-2 md:space-y-4 flex-1">
                <div className="relative group">
                  <div className="absolute -inset-2 md:-inset-3 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-2xl blur-lg opacity-0 group-hover:opacity-100 transition-all duration-500" />
                  <div className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-32 md:h-32 lg:w-40 lg:h-40 rounded-lg md:rounded-2xl overflow-hidden border-2 md:border-4 border-white shadow-lg md:shadow-2xl group-hover:shadow-3xl transition-all duration-500 mx-auto">
                    <Image
                      src={modelImage}
                      alt="Your model"
                      fill
                      className="object-cover transition-transform duration-700 group-hover:scale-110"
                      sizes="(max-width: 640px) 64px, (max-width: 768px) 80px, (max-width: 1024px) 128px, 160px"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-xs md:text-sm font-semibold text-foreground">Your AI Model</p>
                  <p className="text-xs text-muted-foreground hidden sm:block">Trained on your photos</p>
                </div>
              </div>

              {/* Equals symbol */}
              <div className="flex items-center justify-center">
                <div className="relative">
                  <div className="w-6 h-6 md:w-12 md:h-12 bg-gradient-to-r from-primary to-primary/80 rounded-full flex items-center justify-center shadow-lg">
                    <span className="text-white font-bold text-xs md:text-xl">=</span>
                  </div>
                  <div className="absolute inset-0 bg-primary/30 rounded-full blur-md animate-pulse" />
                </div>
              </div>

              {/* Result */}
              <div className="flex flex-col items-center space-y-2 md:space-y-4 flex-1">
                <div className="relative group">
                  <div className="absolute -inset-2 md:-inset-4 bg-gradient-to-r from-orange-500/20 via-yellow-500/20 to-orange-500/20 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-700" />
                  <div className="relative">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={selectedExample}
                        initial={{ opacity: 0, scale: 0.9, rotateY: 5 }}
                        animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                        exit={{ opacity: 0, scale: 0.9, rotateY: -5 }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                        className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-32 md:h-32 lg:w-40 lg:h-40 rounded-lg md:rounded-2xl overflow-hidden border-2 md:border-4 border-white shadow-lg md:shadow-2xl group-hover:shadow-3xl transition-all duration-500 mx-auto"
                      >
                        <Image
                          src={currentExample.result}
                          alt="AI result"
                          fill
                          className="object-cover transition-transform duration-700 group-hover:scale-105"
                          sizes="(max-width: 640px) 64px, (max-width: 768px) 80px, (max-width: 1024px) 128px, 160px"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent" />
                        
                        {/* Magic sparkle effect */}
                        <div className="absolute top-1 right-1 md:top-2 md:right-2 w-3 h-3 md:w-6 md:h-6 bg-primary/90 rounded-full flex items-center justify-center">
                          <Sparkles className="w-1.5 h-1.5 md:w-3 md:h-3 text-white" />
                        </div>
                      </motion.div>
                    </AnimatePresence>
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
        </div>

        {/* Enhanced CTA */}
        <motion.div 
          className="text-center mt-8"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          viewport={{ once: true }}
        >
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
        </motion.div>
      </div>
    </section>
  );
} 