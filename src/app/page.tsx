"use client"

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { motion } from "framer-motion";

export default function Home() {
  // Create a shuffled array of 5 images from the available ones
  const [sampleImages, setSampleImages] = useState<string[]>([]);
  
  // Shuffle images on component mount
  useEffect(() => {
    // Define all available landing images
    const availableImages = [
      "/landing/01.webp",
      "/landing/02.png",
      "/landing/03.webp",
      "/landing/04.webp",
    ];
    
    // Fisher-Yates shuffle algorithm
    const shuffleArray = (array: string[]) => {
      const newArray = [...array];
      for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
      }
      return newArray;
    };
    
    // Shuffle the available images
    const shuffled = shuffleArray(availableImages);
    
    // Pick 4 images - this may include duplicates if needed
    const selected = [];
    for (let i = 0; i < 4; i++) {
      selected.push(shuffled[i % shuffled.length]);
    }
    
    setSampleImages(selected);
  }, []);
  
  // Add effect to hide ActionButtons on this page
  useEffect(() => {
    // Add a class to the body to indicate this is the landing page
    document.body.classList.add('is-landing-page');
    
    // Cleanup function to remove the class when navigating away
    return () => {
      document.body.classList.remove('is-landing-page');
    };
  }, []);
  
  // Ensure page starts at the top
  useEffect(() => {
    // Scroll to top on component mount
    window.scrollTo(0, 0);
    
    // Clear any hash to prevent auto-scrolling to anchor
    if (window.location.hash) {
      history.pushState("", document.title, window.location.pathname + window.location.search);
    }
  }, []);
  
  // Get auth context and router
  const { user } = useAuth();
  const router = useRouter();
  
  // Handle navigation to app or auth
  const handleStartNow = () => {
    if (user) {
      router.push('/create');
    } else {
      router.push('/auth/login');
    }
  };
  
  // Handle anchor link clicks with smooth scrolling
  const handleAnchorClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    // Check if it's an anchor link
    if (href.startsWith('#')) {
      e.preventDefault();
      
      // Get the target element
      const targetId = href.substring(1);
      const targetElement = document.getElementById(targetId);
      
      if (targetElement) {
        // Scroll to the element
        targetElement.scrollIntoView({ 
          behavior: 'smooth',
          block: 'start'
        });
        
        // Update URL hash
        window.history.pushState(null, '', href);
      }
    }
  };

  // Animation variants
  const fadeIn = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.8 } }
  };

  const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8 } }
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.3
      }
    }
  };

  const imageVariant = {
    hidden: { opacity: 0, scale: 0.8, rotate: 0 },
    visible: ({ index }: { index: number }) => ({
      opacity: 1,
      scale: 1,
      rotate: (index % 2 === 0) ? 3 : -3,
      transition: { duration: 0.5, delay: 0.2 + index * 0.1 }
    })
  };

  return (
    <>
      <div className="flex flex-col min-h-screen overflow-x-hidden">
        {/* Navbar */}
        <Navbar showLandingLinks={true} hideSignOutOnHomepage={true} />

        {/* Hero Section */}
        <section id="hero" className="min-h-[calc(100vh-72px)] flex flex-col justify-center items-center py-12 md:py-20 px-4 text-center">
          <motion.div 
            className="max-w-4xl mx-auto"
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
          >
            <motion.h1 
              className="text-3xl sm:text-4xl md:text-6xl font-bold mb-4"
              variants={fadeUp}
            >
              Professional portraits, created instantly with AI
            </motion.h1>
            <motion.p 
              className="text-lg sm:text-xl md:text-2xl text-muted-foreground mb-8"
              variants={fadeUp}
            >
              Look professional online without the professional photoshoot
            </motion.p>
            <motion.div 
              className="flex flex-wrap justify-center gap-4"
              variants={fadeIn}
            >
              <Button size="lg" className="rounded-full px-6" onClick={handleStartNow}>
                Start Now
              </Button>
              <Button size="lg" variant="outline" className="rounded-full px-6">Demo (soon)</Button>
            </motion.div>
          </motion.div>
          
          {/* Sample Images */}
          <div className="mt-12 w-full max-w-4xl mx-auto">
            {/* Desktop View - Flex wrap */}
            <motion.div 
              className="hidden md:flex md:flex-wrap md:justify-center md:gap-6 min-h-[208px]"
              initial="hidden"
              animate="visible"
              variants={staggerContainer}
            >
              {sampleImages.map((imageSrc, i) => (
                <motion.div 
                  key={i} 
                  className="group w-48 h-48 rounded-xl overflow-hidden relative shadow-md transform hover:scale-105 hover:shadow-lg"
                  custom={{ index: i }}
                  variants={imageVariant}
                  style={{ 
                    border: '4px solid #E5E7EB',
                    boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.1)'
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <Image 
                    src={imageSrc}
                    alt={`Sample image ${i+1}`}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, 192px"
                    priority={true}
                  />
                </motion.div>
              ))}
            </motion.div>
            
            {/* Mobile View - Horizontal scroll with partially visible first image */}
            <motion.div 
              className="md:hidden w-screen -mx-4 overflow-x-auto scrollbar-hide py-4 relative snap-x snap-mandatory min-h-[208px]"
              initial="hidden"
              animate="visible"
              variants={staggerContainer}
              style={{ paddingLeft: '4px' }}
            >
              <div className="flex gap-6 pr-8">
                {sampleImages.map((imageSrc, i) => (
                  <motion.div 
                    key={i} 
                    className={`flex-none w-48 h-48 rounded-xl overflow-hidden relative shadow-md snap-center ${i === 0 ? 'ml-[-100px]' : ''}`}
                    custom={{ index: i }}
                    variants={imageVariant}
                    style={{ 
                      border: '4px solid #E5E7EB',
                      boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.1)'
                    }}
                  >
                    <Image 
                      src={imageSrc}
                      alt={`Sample image ${i+1}`}
                      fill
                      className="object-cover"
                      sizes="192px"
                      priority={true}
                    />
                  </motion.div>
                ))}
                {/* Add an invisible spacer at the end for better scrolling */}
                <div className="flex-none w-12 h-1"></div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-16 md:py-20 px-4 bg-background">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-8 md:mb-12">
              Features
            </h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 md:gap-8">
              {/* Feature 1 */}
              <div className="bg-gradient-to-br from-background to-muted/50 rounded-lg p-6 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border border-muted">
                <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center mb-4 shadow-inner">
                  <span className="text-2xl">📷</span>
                </div>
                <h3 className="text-xl font-bold mb-3">Studio-quality photos</h3>
                <p className="text-muted-foreground">Professional-grade portraits without expensive studio equipment</p>
              </div>
              
              {/* Feature 2 */}
              <div className="bg-gradient-to-br from-background to-muted/50 rounded-lg p-6 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border border-muted">
                <div className="w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center mb-4 shadow-inner">
                  <span className="text-2xl">👤</span>
                </div>
                <h3 className="text-xl font-bold mb-3">AI Avatar Generator</h3>
                <p className="text-muted-foreground">Create personalized AI avatars that truly look like you</p>
              </div>
              
              {/* Feature 3 */}
              <div className="bg-gradient-to-br from-background to-muted/50 rounded-lg p-6 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border border-muted">
                <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center mb-4 shadow-inner">
                  <span className="text-2xl">🤖</span>
                </div>
                <h3 className="text-xl font-bold mb-3">Instant Generation</h3>
                <p className="text-muted-foreground">Get your perfect headshots in seconds, not days or weeks</p>
              </div>
              
              {/* Feature 4 */}
              <div className="bg-gradient-to-br from-background to-muted/50 rounded-lg p-6 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border border-muted">
                <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center mb-4 shadow-inner">
                  <span className="text-2xl">✨</span>
                </div>
                <h3 className="text-xl font-bold mb-3">Multiple Styles</h3>
                <p className="text-muted-foreground">Choose from various professional styles for different contexts</p>
              </div>
              
              {/* Feature 5 */}
              <div className="bg-gradient-to-br from-background to-muted/50 rounded-lg p-6 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border border-muted">
                <div className="w-12 h-12 rounded-2xl bg-yellow-100 flex items-center justify-center mb-4 shadow-inner">
                  <span className="text-2xl">🖼️</span>
                </div>
                <h3 className="text-xl font-bold mb-3">Unlimited Variations</h3>
                <p className="text-muted-foreground">Generate multiple options to find your perfect portrait</p>
              </div>
              
              {/* Feature 6 */}
              <div className="bg-gradient-to-br from-background to-muted/50 rounded-lg p-6 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border border-muted relative">
                <div className="absolute top-2 right-2 bg-muted px-2 py-1 rounded text-xs">Coming Soon</div>
                <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center mb-4 shadow-inner">
                  <span className="text-2xl">🎞️</span>
                </div>
                <h3 className="text-xl font-bold mb-3">Background Customization</h3>
                <p className="text-muted-foreground">Choose from various professional backgrounds for your portraits</p>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="py-16 md:py-20 px-4 bg-background">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-8 md:mb-12">
              Choose your plan
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Basic Plan */}
              <div className="border rounded-lg bg-card overflow-hidden flex flex-col">
                <div className="p-6 pb-0">
                  <h3 className="text-2xl font-bold mb-2">Basic</h3>
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-3xl md:text-4xl font-bold">$19</span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                  <p className="mb-4">Perfect for individuals who need professional portraits</p>
                  <hr className="mb-4" />
                  
                  <ul className="space-y-3">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>Generate 50 AI portraits</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>Create 1 AI avatar model</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>Flux™ 1.1 photorealistic model</span>
                    </li>
                  </ul>
                </div>
                <div className="mt-auto p-6">
                  <Button className="w-full" variant="outline" onClick={handleStartNow}>Buy Now</Button>
                </div>
              </div>
              
              {/* Professional Plan */}
              <div className="border rounded-lg bg-card overflow-hidden relative flex flex-col">
                <div className="absolute top-0 left-0 right-0 bg-blue-500 text-white text-center py-1 text-sm font-medium">
                  Most Popular
                </div>
                <div className="p-6 pb-0 pt-8">
                  <h3 className="text-2xl font-bold mb-2">Professional</h3>
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-3xl md:text-4xl font-bold">$49</span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                  <p className="mb-4">Ideal for professionals who need varied portraits</p>
                  <hr className="mb-4" />
                  
                  <ul className="space-y-3">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>Generate 1,000 AI portraits</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>Create 3 AI avatar models</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>Flux™ 1.1 photorealistic model</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>Upscaler (coming soon)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>Multiple professional styles</span>
                    </li>
                  </ul>
                </div>
                <div className="mt-auto p-6">
                  <Button className="w-full" onClick={handleStartNow}>Buy Now</Button>
                </div>
              </div>
              
              {/* Executive Plan */}
              <div className="border rounded-lg bg-card overflow-hidden flex flex-col">
                <div className="p-6 pb-0">
                  <h3 className="text-2xl font-bold mb-2">Executive</h3>
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-3xl md:text-4xl font-bold">$79</span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                  <p className="mb-4">Best for teams or high-volume needs</p>
                  <hr className="mb-4" />
                  
                  <ul className="space-y-3">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>Generate 3,000 AI portraits</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>Create 10 AI avatar models</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>Flux™ 1.1 photorealistic model</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>Upscaler (coming soon)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>All available styles & backgrounds</span>
                    </li>
                  </ul>
                </div>
                <div className="mt-auto p-6">
                  <Button className="w-full" variant="outline" onClick={handleStartNow}>Buy Now</Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Comparison Section */}
        <section className="py-16 md:py-20 px-4 bg-background">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-8 md:mb-12">
              Alternatives are expensive.
            </h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 md:gap-8">
              {/* Professional Photographers */}
              <div className="bg-gradient-to-br from-red-50 to-background rounded-lg p-6 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border border-red-200">
                <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mb-4 shadow-inner">
                  <X className="h-6 w-6 text-red-500" />
                </div>
                <h3 className="text-xl font-bold mb-3">Professional Photographers</h3>
                <p className="text-red-700/90">Expensive, $300-1000 per session, requires scheduling, travel, and weeks of waiting for results</p>
              </div>
              
              {/* DIY */}
              <div className="bg-gradient-to-br from-red-50 to-background rounded-lg p-6 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border border-red-200">
                <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mb-4 shadow-inner">
                  <X className="h-6 w-6 text-red-500" />
                </div>
                <h3 className="text-xl font-bold mb-3">DIY Photoshoots</h3>
                <p className="text-red-700/90">Time-consuming, inconsistent results, requires expensive equipment and editing skills</p>
              </div>
              
              {/* Photomate */}
              <div className="bg-gradient-to-br from-green-50 to-background rounded-lg p-6 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border border-green-200">
                <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center mb-4 shadow-inner">
                  <Check className="h-6 w-6 text-green-500" />
                </div>
                <h3 className="text-xl font-bold mb-3">Photomate</h3>
                <p className="text-green-700/90">Instantly create professional portraits, no equipment needed, affordable monthly subscription</p>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-12 px-4 bg-background border-t">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
              <div>
                <div className="font-medium mb-4 flex items-center space-x-2">
                  <Image 
                    src="/logo.svg"
                    alt="PhotomateAI Logo"
                    width={24}
                    height={24}
                    priority
                  />
                  <span>PhotomateAI</span>
                </div>
              </div>
              
              <div>
                <h4 className="font-medium mb-4">Product</h4>
                <ul className="space-y-2">
                  <li>
                    <a 
                      href="#features" 
                      className="text-muted-foreground hover:text-foreground"
                      onClick={(e) => handleAnchorClick(e, '#features')}
                    >
                      Features
                    </a>
                  </li>
                  <li>
                    <a 
                      href="#pricing" 
                      className="text-muted-foreground hover:text-foreground"
                      onClick={(e) => handleAnchorClick(e, '#pricing')}
                    >
                      Pricing
                    </a>
                  </li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-medium mb-4">Company</h4>
                <ul className="space-y-2">
                  <li><Link href="#" className="text-muted-foreground hover:text-foreground">About</Link></li>
                  <li><Link href="mailto:arthurbnhm@gmail.com" className="text-muted-foreground hover:text-foreground">Contact</Link></li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-medium mb-4">Legal</h4>
                <ul className="space-y-2">
                  <li><Link href="#" className="text-muted-foreground hover:text-foreground">Privacy Policy</Link></li>
                  <li><Link href="#" className="text-muted-foreground hover:text-foreground">Terms of Service</Link></li>
                </ul>
              </div>
            </div>
            
            <div className="mt-12 text-center text-muted-foreground text-sm">
              © 2025 PhotomateAI. All rights reserved.
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
