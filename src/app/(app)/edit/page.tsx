"use client"

import { Suspense } from "react";
import { EditGallery } from "@/components/EditGallery";

// Create a client component for the Edit page content
function EditPageContent() {
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8 md:p-12">
      <EditGallery />
    </div>
  );
}

export default function EditPage() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto p-4 sm:p-8 md:p-12 text-center">Loading edits...</div>}>
      <EditPageContent />
    </Suspense>
  );
} 