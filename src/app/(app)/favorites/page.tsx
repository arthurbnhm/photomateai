"use client"

import { Suspense } from "react";
import { FavoritesHistory } from "@/components/FavoritesHistory";

// Create a client component for the Favorites page content
function FavoritesPageContent() {
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8 md:p-12">
      <FavoritesHistory />
    </div>
  );
}

export default function FavoritesPage() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto p-4 sm:p-8 md:p-12 text-center">Loading favorites...</div>}>
      <FavoritesPageContent />
    </Suspense>
  );
} 