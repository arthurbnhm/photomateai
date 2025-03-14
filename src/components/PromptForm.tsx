"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { creditEvents } from "./CreditCounter"
import { cn } from "@/lib/utils"

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
  model_id: string;
  model_owner: string;
  display_name: string;
  status: string;
}

// Define the type for pending generations
type PendingGeneration = {
  id: string
  replicate_id?: string // Store the actual Replicate ID when available
  prompt: string
  aspectRatio: string
  startTime?: string // When the generation started
  format?: string
  modelName?: string
}

// Aspect Ratio Frame component
const AspectRatioFrame = ({ ratio, showLabel = true, isSelected = false }: { ratio: string; showLabel?: boolean; isSelected?: boolean }) => {
  // Parse the ratio (e.g., "16:9" -> { width: 16, height: 9 })
  const [width, height] = ratio.split(':').map(Number);
  
  // Calculate dimensions while maintaining proportions
  const maxSize = 24; // Maximum size for the frame
  let frameWidth, frameHeight;
  
  if (width >= height) {
    frameWidth = maxSize;
    frameHeight = (height / width) * maxSize;
  } else {
    frameHeight = maxSize;
    frameWidth = (width / height) * maxSize;
  }
  
  return (
    <div className="flex items-center gap-2">
      <div 
        className={cn(
          "border rounded-sm flex-shrink-0 overflow-hidden shadow-sm transition-all duration-200",
          isSelected 
            ? "border-primary/20 shadow-sm" 
            : "border-primary/20 hover:border-primary/30"
        )}
        style={{ 
          width: `${frameWidth}px`, 
          height: `${frameHeight}px`,
        }}
      >
        <div className={cn(
          "w-full h-full transition-all duration-300",
          isSelected
            ? "bg-gradient-to-br from-primary/10 via-primary/5 to-background/80 hover:from-primary/15"
            : "bg-gradient-to-br from-primary/10 via-primary/5 to-background/80 hover:from-primary/15"
        )} />
      </div>
      {showLabel && <span className="text-xs text-muted-foreground">{ratio.replace(':', '∶')}</span>}
    </div>
  );
};

const formSchema = z.object({
  prompt: z.string().min(2, {
    message: "Prompt must be at least 2 characters.",
  }),
  aspectRatio: z.string().default("1:1"),
  outputFormat: z.string().default("webp"),
  modelId: z.string().min(1, {
    message: "Please select a model.",
  }),
})

export function PromptForm({
  pendingGenerations, // Required prop for parent component integration, used in addPendingGeneration and removePendingGeneration
  setPendingGenerations
}: {
  pendingGenerations: PendingGeneration[];
  setPendingGenerations: React.Dispatch<React.SetStateAction<PendingGeneration[]>>;
}) {
  // Initialize Supabase client with useRef for stability
  const supabaseRef = useRef(createBrowserSupabaseClient());
  const getSupabase = useCallback(() => supabaseRef.current, []);
  
  // State variables
  const [models, setModels] = useState<Model[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [placeholderText, setPlaceholderText] = useState("Describe your image...");
  const [isAnimating, setIsAnimating] = useState(true);
  const [creditDeducting, setCreditDeducting] = useState(false);

  const placeholderExamples = useMemo(() => [
    "A serene landscape with mountains at sunset",
    "A cyberpunk cityscape with neon lights",
    "A photorealistic portrait of a fantasy character",
    "An astronaut riding a horse in a meadow",
    "A cozy cabin in the woods with snow falling",
    "A futuristic spaceship orbiting a distant planet",
    "A magical forest with glowing mushrooms",
    "A steampunk-inspired mechanical creature"
  ], []);

  // Animation state
  const animationState = useRef({
    currentExampleIndex: 0,
    currentCharIndex: 0,
    isDeleting: false,
    typingSpeed: 80,
    deletingSpeed: 40,
    pauseBeforeDelete: 2000,
    pauseBeforeNewExample: 500,
    timeoutRef: null as NodeJS.Timeout | null,
    lastAnimationTime: 0,
    currentText: "Describe your image..."
  });
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      prompt: "",
      aspectRatio: "1:1",
      outputFormat: "webp",
      modelId: "",
    },
  })

  // Initial fetch
  useEffect(() => {
    const fetchModels = async () => {
      setLoadingModels(true);
      try {
        // Fetch models that are trained or ready (not cancelled, not deleted)
        // Note: In the database, models have status 'trained' not 'ready'
        const response = await fetch('/api/model/list?is_cancelled=false&is_deleted=false');
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
    
    fetchModels();
  }, [form]);
  
  // Set default model when models are loaded
  useEffect(() => {
    if (models.length > 0 && !form.getValues().modelId) {
      form.setValue('modelId', models[0].id);
    }
  }, [models, form]);
  
  // Function to fetch the latest model version
  const fetchLatestModelVersion = async (owner: string, name: string): Promise<string | null> => {
    try {
      const response = await fetch(`/api/model/version?owner=${encodeURIComponent(owner)}&name=${encodeURIComponent(name)}`);
      
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
    }
  };

  // Add a pending generation
  const addPendingGeneration = (generation: PendingGeneration) => {
    // Add start time if not provided
    const genWithStartTime = {
      ...generation,
      startTime: generation.startTime || new Date().toISOString()
    }
    
    setPendingGenerations(prev => [...prev, genWithStartTime])
  }

  // Remove a pending generation
  const removePendingGeneration = (id: string) => {
    setPendingGenerations(prev => prev.filter(gen => gen.id !== id))
  }

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setError(null);
      setErrorDetails(null);
      
      // Validate that a model is selected
      if (!values.modelId) {
        setError("Please select a model");
        return;
      }
      
      // Generate a temporary ID for UI purposes - will be replaced with Replicate ID
      const tempId = Date.now().toString();
      
      // Store the current modelId and form values before we do anything else
      const currentModelId = form.getValues().modelId;
      const currentPrompt = values.prompt;
      const currentAspectRatio = values.aspectRatio;
      const currentOutputFormat = values.outputFormat;
      
      // Reset form immediately to improve UX - let user continue typing while generation happens
      form.reset({
        prompt: "",
        aspectRatio: currentAspectRatio,
        outputFormat: currentOutputFormat,
        modelId: currentModelId, // Preserve the model selection
      });
      
      // Add to pending generations with start time
      addPendingGeneration({
        id: tempId,
        prompt: currentPrompt,
        aspectRatio: currentAspectRatio,
        startTime: new Date().toISOString(),
        format: currentOutputFormat
      });
      
      // Get current credits before generation for UI feedback
      let currentCredits = 0;
      try {
        const supabase = getSupabase();
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (!userError && user) {
          const { data: subscription } = await supabase
            .from('subscriptions')
            .select('credits_remaining')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .single();
            
          if (subscription) {
            currentCredits = subscription.credits_remaining;
            
            // Show credit deduction animation immediately for visual feedback
            if (currentCredits > 0) {
              setCreditDeducting(true);
              
              // Update the UI to show one less credit
              creditEvents.update(currentCredits - 1);
              
              // Reset the animation state after a delay
              setTimeout(() => {
                setCreditDeducting(false);
              }, 2000);
            }
          }
        }
      } catch (err) {
        console.error('Error fetching current credits for UI update:', err);
      }
      
      try {
        // Find the selected model to get the name
        let modelName: string | null = null;
        let modelVersion: string | null = null;
        let modelDisplayName = '';
        
        if (values.modelId) {
          const selectedModel = models.find(model => model.id === values.modelId);
          if (selectedModel) {
            modelName = selectedModel.model_id;
            modelDisplayName = selectedModel.display_name || selectedModel.model_id || '';
            
            // Update the pending generation with model information
            if (modelDisplayName) {
              setPendingGenerations(prev => 
                prev.map(gen => 
                  gen.id === tempId 
                    ? { ...gen, modelName: modelDisplayName } 
                    : gen
                )
              );
            }
            
            // Fetch the latest version for this model at generation time
            if (modelName) {
              modelVersion = await fetchLatestModelVersion(selectedModel.model_owner, modelName);
              if (!modelVersion) {
                console.warn('Could not fetch latest version, will use default');
              }
            }
          }
        }
        
        if (!modelName) {
          setError("Please select a valid model");
          removePendingGeneration(tempId);
          return;
        }
        
        // Call the API to generate the image with a timeout
        const supabase = getSupabase();
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), 15000);
        
        // Get the session token
        let authHeader = {};
        if (userId) {
          const { data: { user }, error: userError } = await supabase.auth.getUser();
          if (userError) {
            console.error('Error getting user for auth header:', userError);
          } else if (user) {
            // Get the access token securely from the user's session
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) {
              console.error('Error getting session:', sessionError);
            } else if (session?.access_token) {
              authHeader = { 'Authorization': `Bearer ${session.access_token}` };
            }
          }
        }
        
        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeader
          },
          body: JSON.stringify({
            prompt: currentPrompt,
            aspectRatio: currentAspectRatio,
            outputFormat: currentOutputFormat,
            generationId: tempId,
            modelVersion: modelVersion,
            modelName: modelName,
            userId: userId
          }),
          signal: abortController.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorData = await response.json();
          console.error('API error:', errorData);
          
          setError(errorData.error || 'Failed to generate image');
          setErrorDetails(errorData.details || null);
          
          // Remove from pending generations
          removePendingGeneration(tempId);
          return;
        }
        
        const result = await response.json();
        
        // Update the pending generation with the replicate_id and database ID
        if (result && result.replicate_id) {
          // If we have a database ID from the result, use it to replace our temporary ID
          if (result.id) {
            // First update the existing entry with replicate_id
            setPendingGenerations(prev => 
              prev.map(gen => 
                gen.id === tempId 
                  ? { ...gen, replicate_id: result.replicate_id, id: result.id } 
                  : gen
              )
            );
          } else {
            // Just update the replicate_id if no database ID is available
            setPendingGenerations(prev => 
              prev.map(gen => 
                gen.id === tempId 
                  ? { ...gen, replicate_id: result.replicate_id } 
                  : gen
              )
            );
          }
        }
        
        // If the generation has already completed and returned results
        if (result && result.status === 'succeeded' && result.output) {
          // Process the result
          // ... existing code ...
        }

        return;
      } catch (fetchError) {
        // We can't access timeoutId here, so we don't need to clear it
        // If we got an AbortError, the timeout already fired and aborted the request
        
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          console.warn('Generate request aborted due to timeout');
          setError('Request timed out. Please try again.');
        } else {
          throw fetchError;
        }
        
        // Remove from pending generations
        removePendingGeneration(tempId);
      }
    } catch (err) {
      console.error('Error in onSubmit:', err);
    }
  };

  // Function to stop the animation
  const stopAnimation = useCallback(() => {
    setIsAnimating(false);
    if (animationState.current.timeoutRef) {
      clearTimeout(animationState.current.timeoutRef);
      animationState.current.timeoutRef = null;
    }
    setPlaceholderText("Describe your image...");
  }, []);
  
  // Typing animation effect - optimized version
  useEffect(() => {
    if (!isAnimating) return;
    
    let rafId: number | null = null;
    
    const animatePlaceholder = (timestamp: number) => {
      if (!isAnimating) return;
      
      const state = animationState.current;
      const currentExample = placeholderExamples[state.currentExampleIndex];
      const elapsed = timestamp - state.lastAnimationTime;
      
      // Check if enough time has passed for the next animation frame
      const speedToUse = state.isDeleting ? state.deletingSpeed : state.typingSpeed;
      
      if (elapsed < speedToUse) {
        rafId = requestAnimationFrame(animatePlaceholder);
        return;
      }
      
      // Update the last animation time
      state.lastAnimationTime = timestamp;
      
      if (state.isDeleting) {
        // Deleting text
        if (state.currentCharIndex > 0) {
          state.currentCharIndex -= 1;
          state.currentText = currentExample.substring(0, state.currentCharIndex);
          setPlaceholderText(state.currentText);
          rafId = requestAnimationFrame(animatePlaceholder);
        } else {
          // Finished deleting
          state.isDeleting = false;
          state.currentExampleIndex = (state.currentExampleIndex + 1) % placeholderExamples.length;
          
          // If we've gone through all examples, stop the animation
          if (state.currentExampleIndex === 0) {
            stopAnimation();
            return;
          }
          
          state.timeoutRef = setTimeout(() => {
            state.lastAnimationTime = performance.now();
            rafId = requestAnimationFrame(animatePlaceholder);
          }, state.pauseBeforeNewExample);
        }
      } else {
        // Typing text
        if (state.currentCharIndex < currentExample.length) {
          state.currentCharIndex += 1;
          state.currentText = currentExample.substring(0, state.currentCharIndex);
          setPlaceholderText(state.currentText);
          rafId = requestAnimationFrame(animatePlaceholder);
        } else {
          // Finished typing
          state.isDeleting = true;
          state.timeoutRef = setTimeout(() => {
            state.lastAnimationTime = performance.now();
            rafId = requestAnimationFrame(animatePlaceholder);
          }, state.pauseBeforeDelete);
        }
      }
    };
    
    // Start the animation
    animationState.current.lastAnimationTime = performance.now();
    rafId = requestAnimationFrame(animatePlaceholder);
    
    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      
      const timeoutRef = animationState.current.timeoutRef;
      if (timeoutRef) {
        clearTimeout(timeoutRef);
      }
    };
  }, [isAnimating, placeholderExamples, stopAnimation]);

  // Get the user ID from the session when the component mounts
  useEffect(() => {
    const getUserId = async () => {
      try {
        const { data: { user }, error: userError } = await supabaseRef.current.auth.getUser();
        if (userError) {
          console.error('Error getting user:', userError);
        } else if (user) {
          setUserId(user.id);
          
          // Once we have the user ID, fetch their pending generations
          fetchPendingGenerations(user.id);
        }
      } catch (error) {
        console.error('Error getting user session:', error);
      }
    };

    getUserId();
  }, [supabaseRef]);
  
  // Fetch pending generations from the database
  const fetchPendingGenerations = async (userId: string) => {
    try {
      const supabase = getSupabase();
      
      // Fetch predictions with status "starting" or "processing"
      const { data, error } = await supabase
        .from('predictions')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['starting', 'processing'])
        .order('created_at', { ascending: false });
        
      if (error) {
        console.error('Error fetching pending generations:', error);
        return;
      }
      
      if (data && data.length > 0) {
        // Convert database records to PendingGeneration format
        const pendingGens = data.map(record => ({
          id: record.id,
          replicate_id: record.replicate_id,
          prompt: record.prompt,
          aspectRatio: record.aspect_ratio,
          startTime: record.created_at,
          format: record.input?.output_format || 'webp'
        }));
        
        // Update the UI with pending generations from the database
        setPendingGenerations(pendingGens);
        console.log(`Loaded ${pendingGens.length} pending generations from database`);
      }
    } catch (err) {
      console.error('Error in fetchPendingGenerations:', err);
    }
  };

  // Track pending generations count for debugging
  useEffect(() => {
    if (pendingGenerations.length > 0) {
      console.debug(`Current pending generations: ${pendingGenerations.length}`);
    }
  }, [pendingGenerations]);
  
  // Clean up Supabase resources when component unmounts
  useEffect(() => {
    return () => {
      // We're no longer using realtime, so no cleanup needed
    };
  }, []);

  return (
    <div className="w-full">
      <div className="w-full bg-card border border-border rounded-xl overflow-hidden shadow-lg">
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
                    <FormItem className="md:col-span-4">
                      <FormLabel>Aspect Ratio</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select aspect ratio">
                              {field.value && (
                                <div className="flex items-center gap-2">
                                  <AspectRatioFrame ratio={field.value} showLabel={false} isSelected={true} />
                                  <span>
                                    {field.value === "1:1" ? "Square (1:1)" :
                                     field.value === "16:9" ? "Landscape (16:9)" :
                                     field.value === "9:16" ? "Portrait (9:16)" :
                                     field.value === "4:3" ? "Standard (4:3)" :
                                     field.value === "3:2" ? "Classic (3:2)" : field.value}
                                  </span>
                                </div>
                              )}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1:1">
                            <div className="flex items-center gap-2">
                              <AspectRatioFrame ratio="1:1" showLabel={false} isSelected={field.value === "1:1"} />
                              <span>Square (1:1)</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="16:9">
                            <div className="flex items-center gap-2">
                              <AspectRatioFrame ratio="16:9" showLabel={false} isSelected={field.value === "16:9"} />
                              <span>Landscape (16:9)</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="9:16">
                            <div className="flex items-center gap-2">
                              <AspectRatioFrame ratio="9:16" showLabel={false} isSelected={field.value === "9:16"} />
                              <span>Portrait (9:16)</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="4:3">
                            <div className="flex items-center gap-2">
                              <AspectRatioFrame ratio="4:3" showLabel={false} isSelected={field.value === "4:3"} />
                              <span>Standard (4:3)</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="3:2">
                            <div className="flex items-center gap-2">
                              <AspectRatioFrame ratio="3:2" showLabel={false} isSelected={field.value === "3:2"} />
                              <span>Classic (3:2)</span>
                            </div>
                          </SelectItem>
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
                    <FormItem className="md:col-span-3">
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
                          <SelectItem value="jpg">JPG</SelectItem>
                          <SelectItem value="webp">WebP</SelectItem>
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
                    <FormItem className="md:col-span-3">
                      <FormLabel>Model</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                        disabled={loadingModels || models.length === 0}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select model" />
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
                    className={cn(
                      "w-full font-medium transition-all duration-300",
                      creditDeducting 
                        ? "bg-primary border-amber-500/30 shadow-[0_0_0_1px_rgba(245,158,11,0.1)]" 
                        : "bg-primary hover:bg-primary/90 text-primary-foreground"
                    )}
                    disabled={loadingModels}
                    aria-label="Generate image"
                  >
                    Generate
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