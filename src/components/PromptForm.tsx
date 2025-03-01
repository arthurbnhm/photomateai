"use client"

import { useState, useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { RefreshCw, AlertCircle } from "lucide-react"
import { useGeneration } from "@/context/GenerationContext"

import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const formSchema = z.object({
  prompt: z.string().min(2, {
    message: "Prompt must be at least 2 characters.",
  }),
  aspectRatio: z.string().default("1:1"),
  outputFormat: z.string().default("png"),
})

export function PromptForm() {
  const { 
    addToClientHistory, 
    refreshHistory, 
    pendingGenerations,
    addPendingGeneration,
    removePendingGeneration,
    clearStalePendingGenerations,
    checkForCompletedGenerations
  } = useGeneration()
  
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorDetails, setErrorDetails] = useState<string | null>(null)
  const [pageReloaded, setPageReloaded] = useState(true)
  
  useEffect(() => {
    // Set pageReloaded to false after component mounts
    // This flag helps us identify the first render after a page reload
    if (pageReloaded) {
      setPageReloaded(false);
    }
  }, [pageReloaded]);
  
  // Check for completed generations when component mounts or visibility changes
  useEffect(() => {
    // Check for completed generations when PromptForm mounts
    checkForCompletedGenerations();
    
    // Setup event listener for visibility changes
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Check again when the page becomes visible
        checkForCompletedGenerations();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkForCompletedGenerations]);
  
  // Display a warning message if there are pending generations on page load
  const hasPendingGenerationsOnReload = pageReloaded && pendingGenerations.length > 0;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      prompt: "",
      aspectRatio: "1:1",
      outputFormat: "png",
    },
  })

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setSubmitting(true);
      setError(null);
      setErrorDetails(null);
      
      console.log('Submitting with values:', values);
      
      // Generate a unique ID for this generation
      const generationId = Date.now().toString();
      
      // Add to pending generations with start time
      addPendingGeneration({
        id: generationId,
        prompt: values.prompt,
        aspectRatio: values.aspectRatio,
        startTime: new Date().toISOString()
      });
      
      // Small delay to show initial loading state
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: values.prompt,
          aspectRatio: values.aspectRatio,
          outputFormat: values.outputFormat
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('API error:', errorData);
        
        setError(errorData.error || 'Failed to generate image');
        setErrorDetails(errorData.details || null);
        
        // Remove from pending generations
        removePendingGeneration(generationId);
        setSubmitting(false);
        return;
      }
      
      const data = await response.json();
      console.log('FULL API RESPONSE DATA:', JSON.stringify(data, null, 2));
      
      // Handle successful generation
      if (data.status === 'succeeded') {
        // Add to client-side history
        if (Array.isArray(data.output) && data.output.length > 0) {
          console.log('Adding to client history:', {
            id: generationId,
            prompt: values.prompt,
            timestamp: new Date().toISOString(),
            images: data.output,
            aspectRatio: values.aspectRatio
          });
          
          addToClientHistory({
            id: generationId,
            prompt: values.prompt,
            timestamp: new Date().toISOString(),
            images: data.output,
            aspectRatio: values.aspectRatio
          });
          
          // Remove from pending generations
          removePendingGeneration(generationId);
          
          // Refresh history to show new images
          refreshHistory();
          
          // Reset form after successful generation
          form.reset({
            prompt: "",
            aspectRatio: values.aspectRatio,
            outputFormat: values.outputFormat
          });
        } else {
          console.error('No images in output:', data);
          
          // Remove from pending generations
          removePendingGeneration(generationId);
        }
      }
      
      setSubmitting(false);
      
    } catch (err) {
      console.error('Error generating image:', err);
      
      // Create a detailed error message
      let errorMessage = 'An error occurred while generating the image.';
      let errorDetailsMessage = null;
      
      if (err instanceof Error) {
        errorMessage = err.message;
        errorDetailsMessage = err.stack || null;
      }
      
      setError(errorMessage);
      setErrorDetails(errorDetailsMessage);
      setSubmitting(false);
    }
  };
  
  // Function to clear stale pending generations
  const handleClearStaleGenerations = () => {
    clearStalePendingGenerations();
  };

  return (
    <div className="w-full mb-8">
      <h2 className="text-2xl font-bold mb-6">Generate Image</h2>
      
      <div className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-lg">
        {hasPendingGenerationsOnReload && (
          <div className="m-5 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <div className="flex items-start">
              <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5 mr-2" />
              <div>
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  Some image generations were in progress when the page was reloaded.
                </p>
                <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                  These generations might not complete. You can continue to create new images.
                </p>
                <div className="mt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleClearStaleGenerations}
                    className="text-xs py-1 h-auto"
                  >
                    Clear Pending Generations
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div className="p-5">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="prompt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-800 dark:text-gray-200">Prompt</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Describe your image..." 
                        className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700" 
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription className="text-gray-500 dark:text-gray-400">
                      Be detailed about what you want to generate.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="flex flex-col md:flex-row md:items-end gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 gap-4 md:flex-1">
                  <FormField
                    control={form.control}
                    name="aspectRatio"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-800 dark:text-gray-200">Aspect Ratio</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700">
                              <SelectValue placeholder="Select aspect ratio" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="1:1">Square (1:1)</SelectItem>
                            <SelectItem value="16:9">Landscape (16:9)</SelectItem>
                            <SelectItem value="9:16">Portrait (9:16)</SelectItem>
                            <SelectItem value="4:3">Standard (4:3)</SelectItem>
                            <SelectItem value="3:2">Classic (3:2)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="outputFormat"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-800 dark:text-gray-200">Format</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700">
                              <SelectValue placeholder="Select format" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="png">PNG</SelectItem>
                            <SelectItem value="jpg">JPG</SelectItem>
                            <SelectItem value="webp">WebP</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <Button 
                  type="submit" 
                  className="w-full md:w-auto md:px-8 bg-black hover:bg-gray-900 text-white"
                  disabled={submitting}
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Generating</span>
                    </span>
                  ) : (
                    "Generate Image"
                  )}
                </Button>
              </div>
              
              {pendingGenerations.length > 0 && (
                <div className="mt-2 text-sm text-blue-600 dark:text-blue-400 text-center">
                  {pendingGenerations.length} {pendingGenerations.length === 1 ? 'generation' : 'generations'} in progress
                </div>
              )}
            </form>
          </Form>
        </div>
      </div>
      
      {error && (
        <div className="w-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mt-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-200">Error generating image</h3>
              <div className="mt-2 text-sm text-red-700 dark:text-red-300 whitespace-pre-wrap">
                {error}
              </div>
              {errorDetails && (
                <div className="mt-2 text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap">
                  {errorDetails}
                </div>
              )}
              <div className="mt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setError(null);
                    setErrorDetails(null);
                    form.handleSubmit(onSubmit)();
                  }}
                  className="inline-flex items-center"
                  disabled={submitting}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 