export default function TrainPage() {
  return (
    <div className="flex flex-col min-h-screen p-8 pb-20 gap-8 sm:p-20 font-[family-name:var(--font-geist-sans)] relative">
      <header className="w-full max-w-4xl mx-auto text-center">
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">Train Your AI Model</h1>
        <p className="text-muted-foreground">Customize your AI model with your own images and style</p>
      </header>
      
      <main className="flex-1 w-full max-w-4xl mx-auto flex flex-col gap-12 z-10">
        <div className="flex flex-col items-center justify-center p-12 border rounded-lg bg-muted/50">
          <p className="text-xl font-medium mb-4">Training functionality coming soon</p>
          <p className="text-muted-foreground text-center max-w-md">
            Soon you&apos;ll be able to train custom AI models with your own images and generate unique content in your style.
          </p>
        </div>
      </main>
      
      <footer className="w-full max-w-4xl mx-auto text-center text-sm text-muted-foreground pt-4">
        
      </footer>
    </div>
  );
} 