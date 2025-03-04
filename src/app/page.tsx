import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen pb-20 sm:pb-0">
      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 py-16 md:py-32 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background/5 via-background/50 to-background z-0"></div>
        
        {/* Background decorative elements */}
        <div className="absolute top-0 left-0 right-0 h-[500px] bg-gradient-to-br from-purple-500/20 to-blue-500/20 blur-3xl opacity-50 -z-10"></div>
        
        <div className="max-w-4xl mx-auto z-10 mt-4 sm:mt-0">
          <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-blue-600">
            Create Stunning AI Images
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Generate beautiful, unique images with our AI image generator. 
            From artistic creations to realistic scenes - bring your ideas to life.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg" className="font-medium">
              <Link href="/create">Start Creating</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="font-medium">
              <Link href="/train">Train Your Model</Link>
            </Button>
          </div>
        </div>
      </section>
      
      {/* Features Section */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Powerful AI Image Generation</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="bg-background p-6 rounded-lg shadow-sm">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                  <path d="M2 17l10 5 10-5"></path>
                  <path d="M2 12l10 5 10-5"></path>
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Simple Text Prompts</h3>
              <p className="text-muted-foreground">Describe what you want to see and our AI will generate it instantly.</p>
            </div>
            
            {/* Feature 2 */}
            <div className="bg-background p-6 rounded-lg shadow-sm">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                  <line x1="12" y1="22.08" x2="12" y2="12"></line>
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Customizable Styles</h3>
              <p className="text-muted-foreground">Choose from various artistic styles or create your own unique look.</p>
            </div>
            
            {/* Feature 3 */}
            <div className="bg-background p-6 rounded-lg shadow-sm">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">High Quality Results</h3>
              <p className="text-muted-foreground">Get stunning, high-resolution images perfect for any project.</p>
            </div>
          </div>
        </div>
      </section>
      
      {/* CTA Section */}
      <section className="py-20 text-center">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-3xl font-bold mb-6">Ready to create amazing images?</h2>
          <p className="text-xl text-muted-foreground mb-8">
            Start generating beautiful AI art in seconds with our easy-to-use platform.
          </p>
          <Button asChild size="lg" className="font-medium">
            <Link href="/create">Get Started Now</Link>
          </Button>
        </div>
      </section>
      
      <footer className="w-full py-8 border-t">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-muted-foreground">
          
        </div>
      </footer>
    </div>
  );
}
