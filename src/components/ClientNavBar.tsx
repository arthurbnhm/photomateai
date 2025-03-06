"use client";

import { usePathname } from "next/navigation";
import { NavBar } from "./NavBar";

export function ClientNavBar() {
  const pathname = usePathname();
  const showNavBar = pathname !== "/";
  
  if (!showNavBar) {
    return null;
  }
  
  return <NavBar />;
} 