"use client"

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePathname, useRouter } from "next/navigation";
import { CreditCounter } from "@/components/CreditCounter";
import { ModeToggle } from "@/components/ModeToggle";

type NavbarProps = {
  /**
   * Whether to show features and pricing links (for landing page)
   */
  showLandingLinks?: boolean;
  
  /**
   * Whether to hide sign-out button on homepage when user is signed in
   */
  hideSignOutOnHomepage?: boolean;
}

export function Navbar({ 
  showLandingLinks = false,
  hideSignOutOnHomepage = false 
}: NavbarProps) {
  // State for mobile menu
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Add debounce state to prevent rapid clicks
  const [isMenuButtonDisabled, setIsMenuButtonDisabled] = useState(false);
  
  // Get auth context, router and pathname
  const { user, isAuthReady, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isHomePage = pathname === '/';
  const isCreatePage = pathname?.startsWith('/create');
  const isPlansPage = pathname === '/plans';
  
  // Handle sign out with redirect
  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  // Function to handle menu toggle with debounce
  const handleMenuToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isMenuButtonDisabled) {
      setIsMenuButtonDisabled(true);
      setMobileMenuOpen(!mobileMenuOpen);
      
      // Enable the button after a short delay
      setTimeout(() => {
        setIsMenuButtonDisabled(false);
      }, 300); // Match this with transition duration
    }
  };
  
  // Handle anchor link clicks with smooth scrolling (for landing page)
  const handleAnchorClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    // Check if it's an anchor link
    if (href.startsWith('#')) {
      e.preventDefault();
      
      // Get the target element
      const targetId = href.substring(1);
      const targetElement = document.getElementById(targetId);
      
      if (targetElement) {
        // Close mobile menu first
        setMobileMenuOpen(false);
        
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

  // Add effect to prevent scrolling when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);
  
  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // If clicking outside the mobile menu and it's open, close it
      if (mobileMenuOpen && !target.closest('.mobile-menu-items') && !target.closest('.menu-button')) {
        setMobileMenuOpen(false);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [mobileMenuOpen]);

  return (
    <>
      {/* Logo animation styles - only needed when mobile menu is open */}
      {mobileMenuOpen && (
        <style jsx global>{`
          @keyframes pulse {
            0% { opacity: 0.6; r: 10; }
            50% { opacity: 1; r: 12; }
            100% { opacity: 0.6; r: 10; }
          }
          
          @keyframes glow {
            0% { opacity: 0.2; r: 15; }
            50% { opacity: 0.4; r: 20; }
            100% { opacity: 0.2; r: 15; }
          }
          
          .red-dot {
            animation: pulse 2s infinite ease-in-out;
          }
          
          .red-glow {
            animation: glow 2s infinite ease-in-out;
          }
          
          /* Menu item staggered animation */
          .menu-item {
            opacity: 0;
            transform: translateY(10px);
            transition: opacity 0.3s ease, transform 0.3s ease;
            will-change: opacity, transform;
          }
          
          .mobile-menu.open .menu-item:nth-child(1) {
            transition-delay: 0.05s;
          }
          
          .mobile-menu.open .menu-item:nth-child(2) {
            transition-delay: 0.1s;
          }
          
          .mobile-menu.open .menu-item:nth-child(3) {
            transition-delay: 0.15s;
          }
          
          .mobile-menu.open .menu-item:nth-child(4) {
            transition-delay: 0.2s;
          }
          
          .mobile-menu.open .menu-item {
            opacity: 1;
            transform: translateY(0);
          }
          
          .menu-cta {
            opacity: 0;
            transform: translateY(10px);
            transition: opacity 0.3s ease, transform 0.3s ease;
            transition-delay: 0.25s;
            will-change: opacity, transform;
          }
          
          .mobile-menu.open .menu-cta {
            opacity: 1;
            transform: translateY(0);
          }
        `}</style>
      )}
      
      <header className="py-4 px-6 bg-background relative z-30">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center space-x-2">
            <Image 
              src="/logo.svg"
              alt="PhotomateAI Logo"
              width={32}
              height={32}
              priority
            />
            <span className="font-bold text-xl">PhotomateAI</span>
          </Link>
          
          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center">
            {showLandingLinks && (
              <ul className="flex space-x-8 mr-8">
                <li>
                  <a 
                    href="#features" 
                    className="hover:text-blue-500"
                    onClick={(e) => handleAnchorClick(e, '#features')}
                  >
                    Features
                  </a>
                </li>
                <li>
                  <a 
                    href="#pricing" 
                    className="hover:text-blue-500"
                    onClick={(e) => handleAnchorClick(e, '#pricing')}
                  >
                    Pricing
                  </a>
                </li>
              </ul>
            )}
          
            {/* Auth/Navigation Buttons */}
            {isAuthReady && (
              <>
                {user ? (
                  <>
                    {isHomePage ? (
                      <div className="flex items-center gap-4">
                        <Button 
                          variant="outline" 
                          className="h-9 w-auto px-3"
                          asChild
                        >
                          <Link href="/create">Go to App</Link>
                        </Button>
                      </div>
                    ) : isCreatePage ? (
                      <div className="flex gap-4 items-center">
                        <CreditCounter />
                        <Button 
                          variant="outline" 
                          className="h-9 w-auto px-3"
                          asChild
                        >
                          <Link href="https://billing.stripe.com/p/login/6oE14c04k7BpeFGfYY" target="_blank" rel="noopener noreferrer">
                            Billing
                          </Link>
                        </Button>
                        {(!isHomePage || !hideSignOutOnHomepage) && (
                          <Button 
                            variant="outline" 
                            className="h-9 w-auto px-3"
                            onClick={handleSignOut}
                          >
                            Sign out
                          </Button>
                        )}
                        <ModeToggle />
                      </div>
                    ) : isPlansPage ? (
                      <div className="flex items-center gap-4">
                        <Button 
                          variant="outline" 
                          className="h-9 w-auto px-3"
                          onClick={handleSignOut}
                        >
                          Sign out
                        </Button>
                        <ModeToggle />
                      </div>
                    ) : (
                      <div className="flex items-center gap-4">
                        <Button 
                          variant="outline" 
                          className="h-9 w-auto px-3"
                          onClick={handleSignOut}
                        >
                          Sign out
                        </Button>
                        <ModeToggle />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-4">
                    <Button 
                      variant="outline" 
                      className="h-9 w-auto px-3"
                      onClick={() => router.push('/auth/login')}
                    >
                      Sign in
                    </Button>
                    {!isHomePage && <ModeToggle />}
                  </div>
                )}
              </>
            )}
          </nav>
          
          {/* Mobile Menu Button - Only visible on mobile */}
          <div className="flex items-center gap-4 md:hidden">
            {!isHomePage && <ModeToggle />}
            <button 
              className="menu-button p-2"
              onClick={handleMenuToggle}
              aria-label="Toggle menu"
              style={{ zIndex: 60 }}
              disabled={isMenuButtonDisabled}
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </div>
      </header>
      
      {/* Mobile Menu - Only visible on mobile */}
      <div 
        className={`mobile-menu block md:hidden ${mobileMenuOpen ? 'open' : 'closed'}`}
      >
        <div className="mobile-menu-items">
          <div className="mb-12">
            {/* Make logo clickable to close menu */}
            <div 
              className="cursor-pointer"
              onClick={() => {
                setMobileMenuOpen(false);
                router.push('/');
              }}
              aria-label="Close menu"
            >
              <Image 
                src="/logo.svg"
                alt="PhotomateAI Logo"
                width={64}
                height={64}
                className="mx-auto mb-4"
                priority
              />
              <span className="font-bold text-2xl">PhotomateAI</span>
            </div>
          </div>
          
          <nav>
            <ul className="space-y-8">
              {/* Landing page links - same as desktop */}
              {showLandingLinks && (
                <>
                  <li className="menu-item">
                    <a 
                      href="#features" 
                      className="hover:text-blue-500" 
                      onClick={(e) => handleAnchorClick(e, '#features')}
                    >
                      Features
                    </a>
                  </li>
                  <li className="menu-item">
                    <a 
                      href="#pricing" 
                      className="hover:text-blue-500" 
                      onClick={(e) => handleAnchorClick(e, '#pricing')}
                    >
                      Pricing
                    </a>
                  </li>
                </>
              )}
              
              {/* Auth/Navigation Buttons - exactly matching desktop */}
              {isAuthReady && user ? (
                <>
                  {/* Home page shows Go to App */}
                  {isHomePage && (
                    <li className="menu-item">
                      <Link 
                        href="/create" 
                        className="hover:text-blue-500" 
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Go to App
                      </Link>
                    </li>
                  )}
                  
                  {/* Create page shows Credits + Billing */}
                  {isCreatePage && (
                    <>
                      <li className="menu-item">
                        <div className="flex justify-center mb-2">
                          <CreditCounter />
                        </div>
                      </li>
                      <li className="menu-item">
                        <Link 
                          href="https://billing.stripe.com/p/login/6oE14c04k7BpeFGfYY" 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="hover:text-blue-500"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          Billing
                        </Link>
                      </li>
                    </>
                  )}
                  
                  {/* Sign out button (conditional on home page) */}
                  {(!isHomePage || !hideSignOutOnHomepage) && (
                    <li className="menu-item">
                      <button 
                        onClick={() => {
                          setMobileMenuOpen(false);
                          handleSignOut();
                        }}
                        className="hover:text-blue-500"
                      >
                        Sign out
                      </button>
                    </li>
                  )}
                </>
              ) : (
                <li className="menu-item">
                  <Link 
                    href="/auth/login" 
                    className="hover:text-blue-500" 
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Sign in
                  </Link>
                </li>
              )}
            </ul>
          </nav>
          
          {/* Start Now button - keep this special CTA for the homepage */}
          {isHomePage && (
            <div className="mt-16 menu-cta">
              <Button 
                size="lg" 
                className="rounded-full px-8 py-6 text-lg"
                onClick={() => {
                  setMobileMenuOpen(false);
                  if (user) {
                    router.push('/create');
                  } else {
                    router.push('/auth/login');
                  }
                }}
              >
                Start Now
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
} 