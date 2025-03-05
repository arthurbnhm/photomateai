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

// Define the model interface
interface Model {
  id: string;
  replicate_name: string;
  replicate_owner: string;
  status: string;
}

const formSchema = z.object({
  prompt: z.string().min(2, {
    message: "Prompt must be at least 2 characters.",
  }),
  aspectRatio: z.string().default("1:1"),
  outputFormat: z.string().default("png"),
  modelId: z.string().optional(),
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
  const [models, setModels] = useState<Model[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  
  useEffect(() => {
    // Set pageReloaded to false after component mounts
    // This flag helps us identify the first render after a page reload
    if (pageReloaded) {
      setPageReloaded(false);
    }
  }, [pageReloaded]);
  
  // Fetch available models
  useEffect(() => {
    const fetchModels = async () => {
      setLoadingModels(true);
      try {
        // Fetch models that are trained or ready (not cancelled, not deleted)
        // Note: In the database, models have status 'trained' not 'ready'
        const response = await fetch('/api/model-list?is_cancelled=false&is_deleted=false');
        if (!response.ok) {
          throw new Error('Failed to fetch models');
        }
        
        const data = await response.json();
        console.log('API response:', data);
        
        if (data.success && data.models) {
          console.log('Models found:', data.models.length);
          
          // Filter models to only include those with status 'trained'
          const availableModels = data.models.filter((model: Model) => 
            model.status === 'trained' || model.status === 'ready'
          );
          
          console.log('Available models after filtering:', availableModels.length);
          
          if (availableModels.length === 0) {
            console.log('No available models found after filtering');
          }
          
          // Sort models by name for better user experience
          const sortedModels = [...availableModels].sort((a, b) => 
            a.replicate_name.localeCompare(b.replicate_name)
          );
          setModels(sortedModels);
        } else {
          console.log('No models found or API response not successful');
        }
      } catch (err) {
        console.error('Error fetching models:', err);
      } finally {
        setLoadingModels(false);
      }
    };
    
    fetchModels();
  }, []);
  
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
      modelId: undefined,
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
      
      try {
        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: values.prompt,
            aspectRatio: values.aspectRatio,
            outputFormat: values.outputFormat,
            modelId: values.modelId,
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
        
        // Look for the replicate_id in the right place and update the pending generation ASAP
        let replicateId = null;
        
        // Handle different response structures
        if (data.replicate_id) {
          replicateId = data.replicate_id;
        } else if (data.id) {
          // Sometimes the API returns the replicate ID directly as 'id'
          replicateId = data.id;
        }
        
        if (replicateId) {
          console.log(`Found replicate_id in response: ${replicateId}, updating pending generation ${generationId}`);
          
          // Find the pending generation and update it with the replicate_id
          const currentPending = pendingGenerations.find(pg => pg.id === generationId);
          if (currentPending) {
            // Create updated pending generation with replicate_id
            const updatedPending = {
              ...currentPending,
              replicate_id: replicateId
            };
            
            // Remove the old one and add the updated one
            removePendingGeneration(generationId);
            addPendingGeneration(updatedPending);
            
            console.log('Updated pending generation:', updatedPending);
          }
          
          // Immediate check for completion right after getting the replicate_id
          setTimeout(() => {
            checkForCompletedGenerations();
          }, 500);
          
          // With the new API design, we now return early with a "processing" status
          // and let the checkForCompletedGenerations function handle the completion
          if (data.status === 'processing') {
            console.log('Generation is processing. Will check for completion periodically.');
            setSubmitting(false);
            return;
          }
        } else {
          console.warn(`No replicate_id found in API response for generation ${generationId}`);
          console.log('Response data structure:', Object.keys(data));
        }
        
        // Handle successful generation (this should only happen for immediate completions)
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
              outputFormat: values.outputFormat,
              modelId: values.modelId,
            });
          } else {
            console.error('No images in output:', data);
            
            // Remove from pending generations
            removePendingGeneration(generationId);
          }
        }
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
        
        // Remove from pending generations
        removePendingGeneration(generationId);
      }
      
      setSubmitting(false);
      
    } catch (err) {
      console.error('Error in onSubmit:', err);
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
      
      <div className="w-full bg-card border border-border rounded-xl overflow-hidden shadow-lg">
        {hasPendingGenerationsOnReload && (
          <div className="m-5 p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <div className="flex items-start">
              <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5 mr-2" />
              <div>
                <p className="text-sm text-yellow-800 dark:text-yellow-300">
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
                    <FormLabel className="text-foreground">Prompt</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Describe your image..." 
                        className="bg-background border-input" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="aspectRatio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Aspect Ratio</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-background border-input">
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
                      <FormLabel className="text-foreground">Format</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-background border-input">
                            <SelectValue placeholder="Select format" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="png">PNG</SelectItem>
                          <SelectItem value="jpg">JPG</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="modelId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Model</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-background border-input">
                            <SelectValue placeholder={loadingModels ? "Loading models..." : "Select model (optional)"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {models.map((model) => (
                            <SelectItem key={model.id} value={model.id}>
                              {model.replicate_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <Button 
                type="submit" 
                className="w-full md:w-auto"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  "Generate Image"
                )}
              </Button>
            </form>
          </Form>
        </div>
      </div>
      
      {error && (
        <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <h3 className="text-lg font-semibold text-destructive mb-1">Error</h3>
          <p className="text-sm text-destructive/90">{error}</p>
          {errorDetails && (
            <p className="text-xs text-destructive/80 mt-1">{errorDetails}</p>
          )}
        </div>
      )}
    </div>
  )
} 