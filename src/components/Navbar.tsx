"use client"

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePathname, useRouter } from "next/navigation";
/* Credit counter temporarily hidden
import { CreditCounter } from "@/components/CreditCounter";
*/
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
  const { user, isLoading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isHomePage = pathname === '/';
  const isCreatePage = pathname?.startsWith('/create');
  const isTrainPage = pathname?.startsWith('/train');
  const isFavoritesPage = pathname?.startsWith('/favorites');
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
      {/* Logo animation styles - MOVED HERE so they are not conditionally rendered */}
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
        
        @keyframes heartbeat {
          0% { transform: scale(1); }
          14% { transform: scale(1.1); }
          28% { transform: scale(1); }
          42% { transform: scale(1.1); }
          70% { transform: scale(1); }
          100% { transform: scale(1); }
        }
        
        .red-dot {
          animation: pulse 2s infinite ease-in-out;
        }
        
        .red-glow {
          animation: glow 2s infinite ease-in-out;
        }
        
        .heart-beat {
          animation: heartbeat 1.5s infinite ease-in-out;
        }
        
        /* Menu item staggered animation */
        .menu-item {
          opacity: 0;
          transform: translateY(10px);
          transition: opacity 0.3s ease, transform 0.3s ease;
          /* will-change: opacity, transform; */
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
        
        /* Combined rule for items when menu is open */
        .mobile-menu.open .menu-item,
        .mobile-menu.open .menu-cta {
          opacity: 1;
          transform: translateY(0);
        }
        
        .menu-cta {
          opacity: 0;
          transform: translateY(10px);
          transition: opacity 0.3s ease, transform 0.3s ease;
          transition-delay: 0.25s; /* Delay for CTA to animate in */
          /* will-change: opacity, transform; */
        }
      `}</style>
      
      <header className="py-4 px-6 bg-background relative z-30">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center space-x-2">
            <Image 
              src="/logo.svg"
              alt="PhotomateAI Logo"
              width={32}
              height={32}
              priority
              className="hidden md:inline-block"
            />
            <span className="font-bold text-xl">PhotomateAI</span>
          </Link>
          
          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-2">
            {showLandingLinks && (
              <ul className="flex space-x-2">
                <li>
                  <Button 
                    variant="ghost" 
                    className="h-9 w-auto px-3"
                    asChild
                  >
                    <a 
                      href="#features" 
                      onClick={(e) => handleAnchorClick(e, '#features')}
                    >
                      Features
                    </a>
                  </Button>
                </li>
                <li>
                  <Button 
                    variant="ghost" 
                    className="h-9 w-auto px-3"
                    asChild
                  >
                    <a 
                      href="#pricing" 
                      onClick={(e) => handleAnchorClick(e, '#pricing')}
                    >
                      Pricing
                    </a>
                  </Button>
                </li>
                <li>
                  <Button 
                    variant="ghost" 
                    className="h-9 w-auto px-3"
                    asChild
                  >
                    <a href="mailto:arthurbnhm@gmail.com?subject=PhotomateAI">Contact</a>
                  </Button>
                </li>
              </ul>
            )}
          
            {/* Auth/Navigation Buttons */}
            {!isLoading && (
              <>
                {user ? (
                  <>
                    {isHomePage ? (
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          className="h-9 w-auto px-3"
                          asChild
                        >
                          <Link href="/create">Go to App</Link>
                        </Button>
                      </div>
                    ) : isCreatePage ? (
                      <div className="flex gap-2 items-center">
                        {/* Credit counter temporarily hidden
                        <CreditCounter />
                        */}
                        <Button 
                          variant="ghost" 
                          className="h-9 w-auto px-3"
                          asChild
                        >
                          <Link href="/train">Train</Link>
                        </Button>
                        <Button 
                          variant="ghost" 
                          className="h-9 w-auto px-3"
                          asChild
                        >
                          <a href="mailto:arthurbnhm@gmail.com?subject=PhotomateAI">Contact</a>
                        </Button>
                        <Button 
                          variant="ghost" 
                          className="h-9 w-auto px-3"
                          asChild
                        >
                          <Link href="https://billing.stripe.com/p/login/6oE14c04k7BpeFGfYY" target="_blank" rel="noopener noreferrer">
                            Billing
                          </Link>
                        </Button>
                        {(!isHomePage || !hideSignOutOnHomepage) && (
                          <Button 
                            variant="ghost" 
                            className="h-9 w-auto px-3"
                            onClick={handleSignOut}
                          >
                            Sign Out
                          </Button>
                        )}
                        <Button 
                          variant="outline" 
                          className="h-9 w-auto px-3 flex items-center gap-2"
                          asChild
                          title="Favorites"
                        >
                          <Link href="/favorites">
                            <svg 
                              xmlns="http://www.w3.org/2000/svg" 
                              width="16" 
                              height="16" 
                              viewBox="0 0 24 24" 
                              fill="currentColor" 
                              stroke="none" 
                              className="text-red-500"
                            >
                              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                            </svg>
                            Favorites
                          </Link>
                        </Button>
                        <ModeToggle />
                      </div>
                    ) : isTrainPage ? (
                      <div className="flex gap-2 items-center">
                        {/* Credit counter temporarily hidden
                        <CreditCounter />
                        */}
                        <Button 
                          variant="ghost" 
                          className="h-9 w-auto px-3"
                          asChild
                        >
                          <Link href="/create">Create</Link>
                        </Button>
                        <Button 
                          variant="ghost" 
                          className="h-9 w-auto px-3"
                          asChild
                        >
                          <a href="mailto:arthurbnhm@gmail.com?subject=PhotomateAI">Contact</a>
                        </Button>
                        <Button 
                          variant="ghost" 
                          className="h-9 w-auto px-3"
                          asChild
                        >
                          <Link href="https://billing.stripe.com/p/login/6oE14c04k7BpeFGfYY" target="_blank" rel="noopener noreferrer">
                            Billing
                          </Link>
                        </Button>
                        {(!isHomePage || !hideSignOutOnHomepage) && (
                          <Button 
                            variant="ghost" 
                            className="h-9 w-auto px-3"
                            onClick={handleSignOut}
                          >
                            Sign Out
                          </Button>
                        )}
                        <Button 
                          variant="outline" 
                          className="h-9 w-auto px-3 flex items-center gap-2"
                          asChild
                          title="Favorites"
                        >
                          <Link href="/favorites">
                            <svg 
                              xmlns="http://www.w3.org/2000/svg" 
                              width="16" 
                              height="16" 
                              viewBox="0 0 24 24" 
                              fill="currentColor" 
                              stroke="none" 
                              className="text-red-500"
                            >
                              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                            </svg>
                            Favorites
                          </Link>
                        </Button>
                        <ModeToggle />
                      </div>
                    ) : isPlansPage ? (
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          className="h-9 w-auto px-3"
                          onClick={handleSignOut}
                        >
                          Sign out
                        </Button>
                        <ModeToggle />
                      </div>
                    ) : isFavoritesPage ? (
                      <div className="flex gap-2 items-center">
                        {/* Credit counter temporarily hidden
                        <CreditCounter />
                        */}
                        <Button 
                          variant="ghost" 
                          className="h-9 w-auto px-3"
                          asChild
                        >
                          <Link href="/create">Create</Link>
                        </Button>
                        <Button 
                          variant="ghost" 
                          className="h-9 w-auto px-3"
                          asChild
                        >
                          <Link href="/train">Train</Link>
                        </Button>
                        <Button 
                          variant="ghost" 
                          className="h-9 w-auto px-3"
                          asChild
                        >
                          <a href="mailto:arthurbnhm@gmail.com?subject=PhotomateAI">Contact</a>
                        </Button>
                        <Button 
                          variant="ghost" 
                          className="h-9 w-auto px-3"
                          asChild
                        >
                          <Link href="https://billing.stripe.com/p/login/6oE14c04k7BpeFGfYY" target="_blank" rel="noopener noreferrer">
                            Billing
                          </Link>
                        </Button>
                        {(!isHomePage || !hideSignOutOnHomepage) && (
                          <Button 
                            variant="ghost" 
                            className="h-9 w-auto px-3"
                            onClick={handleSignOut}
                          >
                            Sign Out
                          </Button>
                        )}
                        <ModeToggle />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
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
                  <div className="flex items-center gap-2">
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
        className={`
          mobile-menu block md:hidden fixed inset-0 bg-background z-50
          flex items-center justify-center text-center
          transition-opacity duration-300 ease-in-out
          ${mobileMenuOpen ? 'opacity-100 open' : 'opacity-0 pointer-events-none closed'}
        `}
        // 'open' and 'closed' classes are kept for the .mobile-menu.open selectors
        // used by child item animations in the <style jsx global> block.
        // The main container's visibility/fade is now handled by opacity/visible classes.
      >
        <div className="mobile-menu-items flex flex-col justify-center items-center p-4">
          <nav>
            <ul className="space-y-8">
              {/* Landing page links - same as desktop */}
              {showLandingLinks && (
                <>
                  <li className="menu-item">
                    <a 
                      href="#features" 
                      className="hover:text-blue-500 font-bold"
                      onClick={(e) => handleAnchorClick(e, '#features')}
                    >
                      Features
                    </a>
                  </li>
                  <li className="menu-item">
                    <a 
                      href="#pricing" 
                      className="hover:text-blue-500 font-bold"
                      onClick={(e) => handleAnchorClick(e, '#pricing')}
                    >
                      Pricing
                    </a>
                  </li>
                  <li className="menu-item">
                    <a 
                      href="mailto:arthurbnhm@gmail.com?subject=PhotomateAI" 
                      className="hover:text-blue-500 font-bold"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Contact
                    </a>
                  </li>
                </>
              )}
              
              {/* Auth/Navigation Buttons - exactly matching desktop */}
              {!isLoading && user ? (
                <>
                  {/* Home page shows Go to App */}
                  {isHomePage ? (
                    <li className="menu-item">
                      <Link 
                        href="/create" 
                        className="hover:text-blue-500 font-bold"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Go to App
                      </Link>
                    </li>
                  ) : isCreatePage ? (
                    <>
                      <li className="menu-item">
                        <div className="flex justify-center mb-2">
                          {/* Credit counter temporarily hidden
                          <CreditCounter />
                          */}
                        </div>
                      </li>
                      <li className="menu-item">
                        <Link 
                          href="/train" 
                          className="hover:text-blue-500 font-bold"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          Train
                        </Link>
                      </li>
                      <li className="menu-item">
                        <a 
                          href="mailto:arthurbnhm@gmail.com?subject=PhotomateAI" 
                          className="hover:text-blue-500 font-bold"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          Contact
                        </a>
                      </li>
                      <li className="menu-item">
                        <Link 
                          href="/favorites" 
                          className="hover:text-blue-500 font-bold flex items-center justify-center gap-2 group"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          <svg 
                            xmlns="http://www.w3.org/2000/svg" 
                            width="18" 
                            height="18" 
                            viewBox="0 0 24 24" 
                            fill="currentColor" 
                            stroke="none" 
                            className="text-red-500 group-hover:scale-110 transition-transform duration-200 heart-beat"
                          >
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                          </svg>
                          Favorites
                        </Link>
                      </li>
                    </>
                  ) : isTrainPage ? (
                    <>
                      <li className="menu-item">
                        <div className="flex justify-center mb-2">
                          {/* Credit counter temporarily hidden
                          <CreditCounter />
                          */}
                        </div>
                      </li>
                      <li className="menu-item">
                        <Link 
                          href="/create" 
                          className="hover:text-blue-500 font-bold"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          Create
                        </Link>
                      </li>
                      <li className="menu-item">
                        <a 
                          href="mailto:arthurbnhm@gmail.com?subject=PhotomateAI" 
                          className="hover:text-blue-500 font-bold"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          Contact
                        </a>
                      </li>
                      <li className="menu-item">
                        <Link 
                          href="/favorites" 
                          className="hover:text-blue-500 font-bold flex items-center justify-center gap-2 group"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          <svg 
                            xmlns="http://www.w3.org/2000/svg" 
                            width="18" 
                            height="18" 
                            viewBox="0 0 24 24" 
                            fill="currentColor" 
                            stroke="none" 
                            className="text-red-500 group-hover:scale-110 transition-transform duration-200 heart-beat"
                          >
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                          </svg>
                          Favorites
                        </Link>
                      </li>
                    </>
                  ) : isFavoritesPage ? (
                    <>
                      <li className="menu-item">
                        <div className="flex justify-center mb-2">
                          {/* Credit counter temporarily hidden
                          <CreditCounter />
                          */}
                        </div>
                      </li>
                      <li className="menu-item">
                        <Link 
                          href="/create" 
                          className="hover:text-blue-500 font-bold"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          Create
                        </Link>
                      </li>
                      <li className="menu-item">
                        <Link 
                          href="/train" 
                          className="hover:text-blue-500 font-bold"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          Train
                        </Link>
                      </li>
                      <li className="menu-item">
                        <a 
                          href="mailto:arthurbnhm@gmail.com?subject=PhotomateAI" 
                          className="hover:text-blue-500 font-bold"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          Contact
                        </a>
                      </li>
                    </>
                  ) : null}
                  
                  {/* Sign out button (conditional on home page) */}
                  {(!isHomePage || !hideSignOutOnHomepage) && (
                    <li className="menu-item">
                      <button 
                        onClick={() => {
                          setMobileMenuOpen(false);
                          handleSignOut();
                        }}
                        className="hover:text-blue-500 font-bold"
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
                    className="hover:text-blue-500 font-bold"
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