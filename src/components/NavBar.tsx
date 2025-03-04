"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { name: "Home", path: "/" },
  { name: "Create", path: "/create" },
  { name: "Train", path: "/train" },
];

export function NavBar() {
  const pathname = usePathname();
  
  return (
    <>
      {/* Desktop navigation - top of the screen */}
      <div className="hidden sm:flex fixed top-6 left-0 right-0 z-50 justify-center">
        <div className="flex items-center gap-1 p-1 bg-background/80 backdrop-blur-sm rounded-full border shadow-sm">
          {navItems.map((item) => {
            const isActive = 
              item.path === "/" 
                ? pathname === item.path
                : pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-all",
                  isActive
                    ? "bg-muted text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
                prefetch={true}
              >
                {item.name}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Mobile navigation - bottom of the screen */}
      <div className="sm:hidden fixed bottom-6 left-0 right-0 z-50 flex justify-center">
        <div className="flex items-center gap-1 p-1 bg-background/90 backdrop-blur-sm rounded-full border shadow-sm">
          {navItems.map((item) => {
            const isActive = 
              item.path === "/" 
                ? pathname === item.path
                : pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-all",
                  isActive
                    ? "bg-muted text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
                prefetch={true}
              >
                {item.name}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
} 