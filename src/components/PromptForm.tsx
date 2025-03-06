"use client"

import { useState, useEffect, useRef } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { RefreshCw, AlertCircle } from "lucide-react"

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

// Local storage keys
const PENDING_GENERATIONS_KEY = 'photomate_pending_generations';
const CLIENT_HISTORY_KEY = 'photomate_client_history';

// Define the model interface
interface Model {
  id: string;
  model_id: string;
  model_owner: string;
  display_name: string;
  status: string;
}

// Define the type for pending generations with potential stall status
type PendingGeneration = {
  id: string
  replicate_id?: string // Store the actual Replicate ID when available
  prompt: string
  aspectRatio: string
  startTime?: string // When the generation started
  potentiallyStalled?: boolean // Flag for generations that might be stalled
}

// Define the type for image generation
type ImageGeneration = {
  id: string
  prompt: string
  timestamp: string
  images: string[]
  aspectRatio: string
}

// Process output to ensure we have valid string URLs
const processOutput = (output: unknown[]): string[] => {
  return output.map(item => {
    if (typeof item === 'string') {
      return item;
    } else if (item && typeof item === 'object') {
      // If it's an object with a url property
      if ('url' in item && typeof (item as { url: string }).url === 'string') {
        return (item as { url: string }).url;
      }
    }
    // Fallback
    return typeof item === 'object' ? JSON.stringify(item) : String(item);
  });
}

const formSchema = z.object({
  prompt: z.string().min(2, {
    message: "Prompt must be at least 2 characters.",
  }),
  aspectRatio: z.string().default("1:1"),
  outputFormat: z.string().default("png"),
  modelId: z.string().min(1, {
    message: "Please select a model.",
  }),
})

export function PromptForm({
  pendingGenerations,
  setPendingGenerations
}: {
  pendingGenerations: PendingGeneration[];
  setPendingGenerations: React.Dispatch<React.SetStateAction<PendingGeneration[]>>;
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorDetails, setErrorDetails] = useState<string | null>(null)
  const [pageReloaded, setPageReloaded] = useState(true)
  const [models, setModels] = useState<Model[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [fetchingModelVersion, setFetchingModelVersion] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [placeholderText, setPlaceholderText] = useState("Describe your image...")
  const [isAnimating, setIsAnimating] = useState(true)
  const placeholderExamples = [
    "A serene landscape with mountains at sunset",
    "A cyberpunk cityscape with neon lights",
    "A photorealistic portrait of a fantasy character",
    "An astronaut riding a horse in a meadow",
    "A cozy cabin in the woods with snow falling",
    "A futuristic spaceship orbiting a distant planet",
    "A magical forest with glowing mushrooms",
    "A steampunk-inspired mechanical creature"
  ]
  const currentExampleIndex = useRef(0)
  const currentCharIndex = useRef(0)
  const isDeleting = useRef(false)
  const typingSpeed = useRef(80) // milliseconds per character
  const deletingSpeed = useRef(40) // faster deletion
  const pauseBeforeDelete = useRef(2000) // pause before deleting
  const pauseBeforeNewExample = useRef(500) // pause before new example
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  useEffect(() => {
    // Set pageReloaded to false after component mounts
    // This flag helps us identify the first render after a page reload
    if (pageReloaded) {
      setPageReloaded(false);
    }
  }, [pageReloaded]);
  
  // Load saved state from localStorage on initial mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        // Load pending generations
        const savedPendingGenerations = localStorage.getItem(PENDING_GENERATIONS_KEY);
        if (savedPendingGenerations) {
          const parsed = JSON.parse(savedPendingGenerations);
          if (Array.isArray(parsed)) {
            setPendingGenerations(parsed);
          }
        }

        setIsInitialized(true);
      } catch (error) {
        console.error('Error loading state from localStorage:', error);
        setIsInitialized(true);
      }
    }
  }, []);

  // Save pending generations to localStorage whenever they change
  useEffect(() => {
    if (isInitialized && typeof window !== 'undefined') {
      localStorage.setItem(PENDING_GENERATIONS_KEY, JSON.stringify(pendingGenerations));
    }
  }, [pendingGenerations, isInitialized]);
  
  // Fetch available models
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
      
      if (data.success && data.models) {
        // Filter models to only include those with status 'trained'
        const availableModels = data.models.filter((model: Model) => 
          model.status === 'trained' || model.status === 'ready'
        );
        
        // Sort models by display_name for better user experience
        const sortedModels = [...availableModels].sort((a, b) => {
          // Use only display_name without fallback
          const displayNameA = a.display_name || '';
          const displayNameB = b.display_name || '';
          return displayNameA.localeCompare(displayNameB);
        });
        setModels(sortedModels);
        
        // Set default model if available and form is not already filled
        if (sortedModels.length > 0 && !form.getValues().modelId) {
          form.setValue('modelId', sortedModels[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching models:', err);
    } finally {
      setLoadingModels(false);
    }
  };
  
  // Initial fetch
  useEffect(() => {
    fetchModels();
  }, []);
  
  // Set default model when models are loaded
  useEffect(() => {
    if (models.length > 0 && !form.getValues().modelId) {
      form.setValue('modelId', models[0].id);
    }
  }, [models]);
  
  // Function to fetch the latest model version
  const fetchLatestModelVersion = async (owner: string, name: string): Promise<string | null> => {
    setFetchingModelVersion(true);
    try {
      const response = await fetch(`/api/model-version?owner=${encodeURIComponent(owner)}&name=${encodeURIComponent(name)}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to fetch model version: ${response.status} ${response.statusText}`, errorText);
        throw new Error(`Failed to fetch model version: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.version) {
        return data.version;
      } else {
        console.error('No model version found in response:', data);
        if (data.error) {
          throw new Error(data.error);
        }
        return null;
      }
    } catch (error) {
      console.error('Error fetching model version:', error);
      setError(`Error fetching model version: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    } finally {
      setFetchingModelVersion(false);
    }
  };

  // Add a pending generation
  const addPendingGeneration = (generation: PendingGeneration) => {
    // Add start time if not provided
    const genWithStartTime = {
      ...generation,
      startTime: generation.startTime || new Date().toISOString(),
      potentiallyStalled: false
    }
    
    setPendingGenerations(prev => [...prev, genWithStartTime])
  }

  // Remove a pending generation
  const removePendingGeneration = (id: string) => {
    setPendingGenerations(prev => prev.filter(gen => gen.id !== id))
  }
  
  // Clear stale pending generations
  const clearStalePendingGenerations = () => {
    setPendingGenerations([]);
  };

  // Add to client history
  const addToClientHistory = (generation: ImageGeneration) => {
    // Get current history
    const currentHistory = localStorage.getItem(CLIENT_HISTORY_KEY);
    let history: ImageGeneration[] = [];
    
    try {
      if (currentHistory) {
        history = JSON.parse(currentHistory);
      }
    } catch (e) {
      console.error('Error parsing client history:', e);
    }
    
    // Add new generation at the start
    history = [generation, ...history];
    
    // Keep only the last 20 generations
    history = history.slice(0, 20);
    
    // Save back to localStorage
    localStorage.setItem(CLIENT_HISTORY_KEY, JSON.stringify(history));
  }

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      prompt: "",
      aspectRatio: "1:1",
      outputFormat: "png",
      modelId: "",
    },
  })

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setSubmitting(true);
      setError(null);
      setErrorDetails(null);
      
      // Validate that a model is selected
      if (!values.modelId) {
        setError("Please select a model");
        setSubmitting(false);
        return;
      }
      
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
        // Find the selected model to get the name
        let modelName = null;
        let modelVersion = null;
        
        if (values.modelId) {
          const selectedModel = models.find(model => model.id === values.modelId);
          if (selectedModel) {
            modelName = selectedModel.model_id;
            
            // Fetch the latest version for this model at generation time
            if (modelName) {
              setFetchingModelVersion(true);
              modelVersion = await fetchLatestModelVersion(selectedModel.model_owner, modelName);
              if (modelVersion) {
              } else {
                console.warn('Could not fetch latest version, will use default');
              }
            }
          }
        }
        
        if (!modelName) {
          setError("Please select a valid model");
          setSubmitting(false);
          removePendingGeneration(generationId);
          return;
        }
        
        // Call the API to generate the image
        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: values.prompt,
            aspectRatio: values.aspectRatio,
            outputFormat: values.outputFormat,
            generationId: generationId,
            modelVersion: modelVersion,
            modelName: modelName
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
        
        const result = await response.json();
        
        // Update the pending generation with the replicate_id
        if (result && result.replicate_id) {
          setPendingGenerations(prev => 
            prev.map(gen => 
              gen.id === generationId 
                ? { ...gen, replicate_id: result.replicate_id } 
                : gen
            )
          );
        }
        
        // Store the current modelId before resetting the form
        const currentModelId = form.getValues().modelId;
        
        // Reset form and UI state
        form.reset({
          prompt: "",
          aspectRatio: "1:1",
          outputFormat: "png",
          modelId: currentModelId, // Preserve the model selection
        });
        
        setSubmitting(false);
        
        // If the generation has already completed and returned results
        if (result && result.status === 'succeeded' && result.output) {
          // Add to client history
          addToClientHistory({
            id: generationId,
            prompt: values.prompt,
            timestamp: new Date().toISOString(),
            images: processOutput(result.output),
            aspectRatio: values.aspectRatio
          });
          
          // Remove from pending since it's already done
          removePendingGeneration(generationId);
        }

        return;
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
        
        // Don't reset the form on error to preserve user input
        // Just set submitting to false
      }
      
      setSubmitting(false);
      
    } catch (err) {
      console.error('Error in onSubmit:', err);
      setSubmitting(false);
    }
  };

  // Display a warning message if there are pending generations on page load
  const hasPendingGenerationsOnReload = pageReloaded && pendingGenerations.length > 0;

  // Function to stop the animation
  const stopAnimation = () => {
    setIsAnimating(false)
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current)
      animationTimeoutRef.current = null
    }
    // Reset to default placeholder when animation stops
    setPlaceholderText("Describe your image...")
  }
  
  // Typing animation effect
  useEffect(() => {
    if (!isAnimating) return
    
    const animatePlaceholder = () => {
      if (!isAnimating) return
      
      const currentExample = placeholderExamples[currentExampleIndex.current]
      
      if (isDeleting.current) {
        // Deleting text
        if (currentCharIndex.current > 0) {
          setPlaceholderText(currentExample.substring(0, currentCharIndex.current - 1))
          currentCharIndex.current -= 1
          animationTimeoutRef.current = setTimeout(animatePlaceholder, deletingSpeed.current)
        } else {
          // Finished deleting
          isDeleting.current = false
          currentExampleIndex.current = (currentExampleIndex.current + 1) % placeholderExamples.length
          
          // If we've gone through all examples, stop the animation
          if (currentExampleIndex.current === 0) {
            stopAnimation()
            return
          }
          
          animationTimeoutRef.current = setTimeout(animatePlaceholder, pauseBeforeNewExample.current)
        }
      } else {
        // Typing text
        if (currentCharIndex.current < currentExample.length) {
          setPlaceholderText(currentExample.substring(0, currentCharIndex.current + 1))
          currentCharIndex.current += 1
          animationTimeoutRef.current = setTimeout(animatePlaceholder, typingSpeed.current)
        } else {
          // Finished typing
          isDeleting.current = true
          animationTimeoutRef.current = setTimeout(animatePlaceholder, pauseBeforeDelete.current)
        }
      }
    }
    
    animationTimeoutRef.current = setTimeout(animatePlaceholder, 1000) // Initial delay
    
    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current)
      }
    }
  }, [isAnimating])

  return (
    <div className="w-full">
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
                    onClick={clearStalePendingGenerations}
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
                        placeholder={placeholderText}
                        className="bg-background border-input" 
                        onFocus={stopAnimation}
                        onClick={stopAnimation}
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                <FormField
                  control={form.control}
                  name="aspectRatio"
                  render={({ field }) => (
                    <FormItem className="md:col-span-3">
                      <FormLabel>Aspect Ratio</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
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
                    <FormItem className="md:col-span-2">
                      <FormLabel>Format</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select format" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="png">PNG</SelectItem>
                          <SelectItem value="jpeg">JPEG</SelectItem>
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
                    <FormItem className="md:col-span-5">
                      <FormLabel>Model</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                        disabled={loadingModels || models.length === 0}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={loadingModels ? "Loading models..." : "Select model"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {models.map((model) => (
                            <SelectItem key={model.id} value={model.id}>
                              {model.display_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="md:col-span-2 flex justify-end">
                  <Button 
                    type="submit" 
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-all duration-200"
                    disabled={submitting || loadingModels || fetchingModelVersion}
                    aria-label="Generate image"
                  >
                    {submitting ? (
                      <div className="flex items-center justify-center">
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        <span>Generate</span>
                      </div>
                    ) : (
                      "Generate Image"
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </Form>
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
    </div>
  );
} 