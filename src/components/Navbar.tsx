"use client"

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  LogOut, 
  Heart, 
  Mail, 
  CreditCard,
  Sparkles,
  Camera,
  Menu,
  Moon,
  Sun
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import CryptoJS from 'crypto-js';

type NavbarProps = {
  /**
   * Whether to show features and pricing links (for landing page)
   */
  showLandingLinks?: boolean;
  
  /**
   * Whether to hide sign-out button on homepage when user is signed in
   */
  hideSignOutOnHomepage?: boolean;
  
  /**
   * Whether to hide app navigation (like Get Started button) - useful for subscription-required pages
   */
  hideAppNavigation?: boolean;
  
  /**
   * Whether to hide theme toggle - useful for landing pages with forced themes
   */
  hideThemeToggle?: boolean;
}

export function Navbar({ 
  showLandingLinks = false,
  hideSignOutOnHomepage = false,
  hideAppNavigation = false,
  hideThemeToggle = false
}: NavbarProps) {
  const { user, isLoading, signOut, mounted } = useAuth();
  const { setTheme, resolvedTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const isHomePage = pathname === '/';
  const isPlansPage = pathname === '/plans';
  
  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  const handleAnchorClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (href.startsWith('#')) {
      e.preventDefault();
      const targetId = href.substring(1);
      const targetElement = document.getElementById(targetId);
      
      if (targetElement) {
        targetElement.scrollIntoView({ 
          behavior: 'smooth',
          block: 'start'
        });
        window.history.pushState(null, '', href);
      }
    }
  };

  const getUserInitials = () => {
    if (!user) return 'U';
    
    const displayName = getUserDisplayName();
    
    // If we have a full name, use first letter of first and last name
    if (displayName && displayName.includes(' ')) {
      const names = displayName.trim().split(' ');
      const firstInitial = names[0]?.charAt(0)?.toUpperCase() || '';
      const lastInitial = names[names.length - 1]?.charAt(0)?.toUpperCase() || '';
      return firstInitial + lastInitial;
    }
    
    // Otherwise use first letter of display name or email
    return displayName?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || 'U';
  };

  const getUserDisplayName = () => {
    if (!user) return '';
    
    // Try to get name from user metadata first (for OAuth providers)
    if (user.user_metadata?.full_name) {
      return user.user_metadata.full_name;
    }
    
    if (user.user_metadata?.name) {
      return user.user_metadata.name;
    }
    
    // Fallback to email
    return user.email || '';
  };

  const getUserAvatarUrl = () => {
    if (!user) return undefined;
    
    // Try to get avatar from user metadata (for OAuth providers like Google)
    if (user.user_metadata?.avatar_url) {
      return user.user_metadata.avatar_url;
    }
    
    // Try to get avatar from app metadata
    if (user.app_metadata?.avatar_url) {
      return user.app_metadata.avatar_url;
    }
    
    // Try to get picture from user metadata (alternative field name)
    if (user.user_metadata?.picture) {
      return user.user_metadata.picture;
    }
    
    // Generate Gravatar URL based on email
    if (user.email) {
      const emailHash = CryptoJS.MD5(user.email.toLowerCase().trim()).toString();
      return `https://www.gravatar.com/avatar/${emailHash}?d=identicon&s=128`;
    }
    
    return undefined;
  };

  return (
    <header className="py-4 px-6 bg-background/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
        {/* Logo */}
        <Link href="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
          <div className="relative">
            <Image 
              src="/logo.svg"
              alt="PhotomateAI Logo"
              width={32}
              height={32}
              priority
              className="hidden md:inline-block"
            />
          </div>
          <span className="font-bold text-xl bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            PhotomateAI
          </span>
          </Link>
          
        <div className="flex items-center gap-3">
          {/* Landing page links for desktop */}
            {showLandingLinks && (
            <nav className="hidden md:flex items-center gap-1">
              <Button variant="ghost" size="sm" asChild>
                <a href="#features" onClick={(e) => handleAnchorClick(e, '#features')}>
                      Features
                    </a>
                  </Button>
              <Button variant="ghost" size="sm" asChild>
                <a href="#pricing" onClick={(e) => handleAnchorClick(e, '#pricing')}>
                      Pricing
                    </a>
                  </Button>
            </nav>
          )}

          {/* Only render auth-dependent content after mounting to prevent hydration mismatch */}
          {mounted && !isLoading && (
              <>
                {user ? (
                <div className="flex items-center gap-2">
                  {/* Only show app navigation if not on plans page and not explicitly hidden */}
                  {!isPlansPage && !hideAppNavigation && (
                    <>
                      {/* Primary action buttons for desktop */}
                      <div className="hidden md:flex items-center gap-2">
                        {isHomePage ? (
                          <Button size="sm" asChild>
                            <Link href="/create">
                              <Camera className="w-4 h-4 mr-2" />
                              Get Started
                            </Link>
                          </Button>
                        ) : (
                          <>
                            <Button 
                              size="sm" 
                              variant={pathname?.startsWith('/create') ? "default" : "outline"}
                              asChild
                            >
                              <Link href="/create">
                                <Camera className="w-4 h-4 mr-2" />
                                Create
                              </Link>
                            </Button>
                            <Button 
                              size="sm" 
                              variant={pathname?.startsWith('/train') ? "default" : "outline"}
                              asChild
                            >
                              <Link href="/train">
                                <Sparkles className="w-4 h-4 mr-2" />
                                Train
                              </Link>
                            </Button>
                            <Button 
                              size="sm" 
                              variant={pathname?.startsWith('/favorites') ? "default" : "outline"}
                              asChild
                            >
                              <Link href="/favorites">
                                <Heart 
                                  className={`w-4 h-4 mr-2 text-red-500 ${
                                    pathname?.startsWith('/favorites') ? 'fill-current' : ''
                                  }`} 
                                />
                                Favorites
                              </Link>
                            </Button>
                          </>
                        )}
                      </div>
                    </>
                  )}

                  {/* User Menu Dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={getUserAvatarUrl()} alt="User avatar" />
                          <AvatarFallback className="text-sm font-medium">
                            {getUserInitials()}
                          </AvatarFallback>
                        </Avatar>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="end" forceMount>
                      {/* User info */}
                      <div className="flex items-center justify-start gap-2 p-2">
                        <div className="flex flex-col space-y-1 leading-none">
                          <p className="font-medium text-sm">{getUserDisplayName()}</p>
                          {getUserDisplayName() !== user?.email && user?.email && (
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                          )}
                        </div>
                      </div>
                      <DropdownMenuSeparator />
                      
                      {/* Only show app navigation in dropdown if not on plans page and not explicitly hidden */}
                      {!isPlansPage && !hideAppNavigation && (
                        <>
                          {/* Navigation Links */}
                          <DropdownMenuItem asChild>
                            <Link href="/create" className="w-full">
                              <Camera className="mr-2 h-4 w-4" />
                              Create
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href="/train" className="w-full">
                              <Sparkles className="mr-2 h-4 w-4" />
                              Train
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href="/favorites" className="w-full">
                              <Heart 
                                className={`w-4 h-4 mr-2 text-red-500 ${
                                  pathname?.startsWith('/favorites') ? 'fill-current' : ''
                                }`} 
                              />
                              Favorites
                            </Link>
                          </DropdownMenuItem>
                          
                          <DropdownMenuSeparator />
                          
                          {/* Settings & Support */}
                          <DropdownMenuItem asChild>
                            <Link 
                              href="https://billing.stripe.com/p/login/6oE14c04k7BpeFGfYY" 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="w-full"
                            >
                              <CreditCard className="mr-2 h-4 w-4" />
                              Billing
                            </Link>
                          </DropdownMenuItem>
                        </>
                      )}
                      
                      <DropdownMenuItem asChild>
                        <a href="mailto:arthurbnhm@gmail.com?subject=PhotomateAI" className="w-full">
                          <Mail className="mr-2 h-4 w-4" />
                          Contact
                        </a>
                      </DropdownMenuItem>
                      
                      {/* Theme toggle */}
                      {!hideThemeToggle && (
                        <DropdownMenuItem 
                          onClick={toggleTheme}
                          onSelect={(e) => e.preventDefault()}
                        >
                          <div className="mr-2 h-4 w-4 relative">
                            <Sun className={`h-4 w-4 absolute transition-all duration-300 ${
                              mounted && resolvedTheme === 'dark' 
                                ? 'rotate-90 scale-0 opacity-0' 
                                : 'rotate-0 scale-100 opacity-100'
                            }`} />
                            <Moon className={`h-4 w-4 absolute transition-all duration-300 ${
                              mounted && resolvedTheme === 'dark' 
                                ? 'rotate-0 scale-100 opacity-100' 
                                : '-rotate-90 scale-0 opacity-0'
                            }`} />
                          </div>
                          <span>Theme</span>
                        </DropdownMenuItem>
                      )}
                      
                      <DropdownMenuSeparator />
                      
                      {/* Sign out */}
                      {(!isHomePage || !hideSignOutOnHomepage) && (
                        <DropdownMenuItem onClick={handleSignOut} className="text-red-600 focus:text-red-600">
                          <LogOut className="mr-2 h-4 w-4" />
                          Sign out
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {/* Mobile menu for landing page */}
                  {showLandingLinks && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild className="md:hidden">
                        <Button variant="ghost" size="sm">
                          <Menu className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-48" align="end">
                        <DropdownMenuItem asChild>
                          <a href="#features" onClick={(e) => handleAnchorClick(e, '#features')}>
                            Features
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <a href="#pricing" onClick={(e) => handleAnchorClick(e, '#pricing')}>
                            Pricing
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <a href="mailto:arthurbnhm@gmail.com?subject=PhotomateAI">
                            Contact
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {!hideThemeToggle && (
                          <DropdownMenuItem className="p-0">
                            <div className="flex items-center w-full px-2 py-1.5">
                              <div className="mr-2 h-4 w-4 relative">
                                <Sun className={`h-4 w-4 absolute transition-all duration-300 ${
                                  mounted && resolvedTheme === 'dark' 
                                    ? 'rotate-90 scale-0 opacity-0' 
                                    : 'rotate-0 scale-100 opacity-100'
                                }`} />
                                <Moon className={`h-4 w-4 absolute transition-all duration-300 ${
                                  mounted && resolvedTheme === 'dark' 
                                    ? 'rotate-0 scale-100 opacity-100' 
                                    : '-rotate-90 scale-0 opacity-0'
                                }`} />
                              </div>
                              <span className="flex-1">Theme</span>
                              <div className="ml-auto">
                                <Button 
                                  variant="outline" 
                                  size="icon"
                                  className="h-9 w-9"
                                  onClick={toggleTheme}
                                  aria-label={resolvedTheme === 'dark' ? "Switch to light mode" : "Switch to dark mode"}
                                >
                                  {resolvedTheme === 'dark' ? (
                                    <Moon className="h-4 w-4" />
                                  ) : (
                                    <Sun className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  
                  <Button size="sm" onClick={() => router.push('/auth/login')}>
                    Sign in
                  </Button>
                  
                  {!showLandingLinks && !hideThemeToggle && mounted && (
                    <Button 
                      variant="outline" 
                      size="icon"
                      className="h-9 w-9"
                      onClick={toggleTheme}
                      aria-label={resolvedTheme === 'dark' ? "Switch to light mode" : "Switch to dark mode"}
                    >
                      {resolvedTheme === 'dark' ? (
                        <Moon className="h-4 w-4" />
                      ) : (
                        <Sun className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
          
          {/* Show a placeholder during hydration to prevent layout shift */}
          {(!mounted || isLoading) && (
            <div className="flex items-center gap-2">
              <div className="h-8 w-16 bg-muted animate-pulse rounded"></div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
} 