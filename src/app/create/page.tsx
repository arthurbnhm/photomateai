import { PromptForm } from "@/components/PromptForm";
import { ImageHistory } from "@/components/ImageHistory";

export default function CreatePage() {
  return (
    <div className="flex flex-col min-h-screen p-8 pb-28 sm:pb-20 gap-8 sm:p-20 font-[family-name:var(--font-geist-sans)] relative bg-background">
      <header className="w-full max-w-4xl mx-auto text-center mt-8 sm:mt-6">
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">AI Image Generator</h1>
        <p className="text-muted-foreground">Create stunning images with AI using simple text prompts</p>
      </header>
      
      <main className="flex-1 w-full max-w-4xl mx-auto flex flex-col gap-12 z-10 mt-4">
        <PromptForm />
        <div className="w-full border-t pt-8">
          <ImageHistory />
        </div>
      </main>
      
      <footer className="w-full max-w-4xl mx-auto text-center text-sm text-muted-foreground pt-4">
        
      </footer>
    </div>
  );
} 