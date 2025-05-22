"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import { creditEvents } from "./CreditCounter"
import { cn } from "@/lib/utils"
import TextareaAutosize from 'react-textarea-autosize'
import Image from 'next/image'
import { Plus, UserSquare2 } from 'lucide-react'

import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Import the AdvancedSettings component
import { AdvancedSettings, AdvancedSettingsRefType } from "@/components/AdvancedSettings"

// Import the new ImageUpload component
import { ImageUpload } from "@/components/ImageUpload";

// Import Tabs components from shadcn/ui
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"

// Define the model interface to match database structure
interface Model {
  id: string;              // Database ID (primary key)
  model_id: string;        // Actual model identifier for API calls
  model_owner: string;     // Owner of the model
  display_name: string;    // Human-readable name chosen by the user
  version?: string;        // Optional version information
  // Other fields like created_at, is_deleted, user_id exist in DB but not needed in UI
}

// Define the type for pending generations
type PendingGeneration = {
  id: string
  replicate_id?: string    // Store the actual Replicate ID when available
  prompt: string
  aspectRatio: string
  startTime?: string       // When the generation started
  format?: string
  modelDisplayName?: string // Human-readable display name
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

// Add type for animation state
interface AnimationState {
  currentExampleIndex: number;
  currentText: string;
  isDeleting: boolean;
  typingSpeed: number;
  deletingSpeed: number;
  pauseBeforeDelete: number;
  pauseBeforeNewExample: number;
  timeoutRef: number | NodeJS.Timeout | null;
  lastAnimationTime: number;
}

// Define PromptFormProps interface
interface PromptFormProps {
  pendingGenerations: PendingGeneration[];
  setPendingGenerations: React.Dispatch<React.SetStateAction<PendingGeneration[]>>;
  promptValue: string;
  onGenerationStart?: () => void; // Optional prop
  onGenerationComplete?: () => void; // Optional prop
}

export function PromptForm({
  pendingGenerations, 
  setPendingGenerations,
  promptValue,
  onGenerationStart, // Destructure new props
  onGenerationComplete // Destructure new props
}: PromptFormProps) { // Use the new interface here
  // Initialize Supabase client with useRef for stability
  const supabaseRef = useRef(createSupabaseBrowserClient());
  const getSupabase = useCallback(() => supabaseRef.current, []);
  
  // Create ref for AdvancedSettings component
  const advancedSettingsRef = useRef<AdvancedSettingsRefType>(null);
  
  // State variables
  const [models, setModels] = useState<Model[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [placeholderText, setPlaceholderText] = useState("");
  const [isAnimating, setIsAnimating] = useState(true);
  // const [creditDeducting, setCreditDeducting] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isAdvancedSettingsOpen, setIsAdvancedSettingsOpen] = useState(false);
  
  // This state tracks the gender selection in the AdvancedSettings component
  // and is used with the onGenderChange prop for synchronization
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [selectedGender, setSelectedGender] = useState<string | null>(null);
  const [uploadedImageDataUrl, setUploadedImageDataUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("prompt"); // To track active tab

  const placeholderExamples = useMemo(() => [
    "A woman portrait on studio grey background, smiling",
    "Close-up shot of a man wearing sunglasses, sunset lighting",
    "Professional headshot, serious expression, on a white background",
    "A minimalist product photo, teal background",
    "Fashion editorial, dramatic lighting, full body shot",
    "A man laughing, wearing a beanie, casual avatar style",
    "Architectural interior, natural light, wide shot",
    "Cyberpunk city street at night, neon lights, cinematic",
    "Fantasy landscape with floating islands and waterfalls",
    "Abstract art, vibrant colors, geometric patterns"
  ], []);

  // Animation state
  const animationState = useRef<AnimationState>({
    currentExampleIndex: 0,
    currentText: "",
    isDeleting: false,
    typingSpeed: 70,
    deletingSpeed: 35,
    pauseBeforeDelete: 2000,
    pauseBeforeNewExample: 500,
    timeoutRef: null,
    lastAnimationTime: 0
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

  // Sync external promptValue to form
  useEffect(() => {
    form.setValue("prompt", promptValue);
  }, [promptValue, form]);

  // Initial fetch
  useEffect(() => {
    const fetchModels = async () => {
      setLoadingModels(true);
      try {
        // Fetch models with pagination handling and only necessary fields
        let allModels: Model[] = [];
        let currentPage = 1;
        let hasMorePages = true;
        
        while (hasMorePages) {
          // Fetch one page at a time with fields parameter
          const response = await fetch(`/api/model/list?is_cancelled=false&is_deleted=false&status=succeeded&page=${currentPage}&fields=id,display_name,model_id,model_owner,version`);
          if (!response.ok) {
            throw new Error('Failed to fetch models');
          }
          
          const data = await response.json();
          
          if (data.success) {
            if (data.models && data.models.length > 0) {
              allModels = [...allModels, ...data.models];
            }
            
            // Check if there are more pages
            if (data.pagination && data.pagination.page < data.pagination.pages) {
              currentPage++;
            } else {
              hasMorePages = false;
            }
          } else {
            hasMorePages = false;
          }
        }
        
        if (allModels.length > 0) {
          // Sort models by display_name for better user experience
          const sortedModels = [...allModels].sort((a, b) => {
            // Use display_name consistently
            const displayNameA = a.display_name || '';
            const displayNameB = b.display_name || '';
            return displayNameA.localeCompare(displayNameB);
          });
          setModels(sortedModels);
          
          // Set default model if available and form is not already filled
          if (sortedModels.length > 0 && !form.getValues().modelId) {
            form.setValue('modelId', sortedModels[0].id);
          }
        } else {
          console.warn('No models found with succeeded status');
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
  
  const handleImageChange = useCallback((imageDataUrl: string | null) => {
    setUploadedImageDataUrl(imageDataUrl);
    // If an image is uploaded, the aspect ratio is determined by the image
    // No longer disabling aspect ratio here, backend will handle it.
  }, []);
  
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

  // Extracted core generation logic
  const executeGeneration = async (submissionData: {
    prompt: string;
    aspectRatio: string;
    outputFormat: string;
    modelId: string;
    imageDataUrl?: string | null; // Optional image data
  }) => {
    try {
      setError(null);
      setErrorDetails(null);
      onGenerationStart?.();

      const { prompt, aspectRatio, outputFormat, modelId, imageDataUrl } = submissionData;

      if (!modelId) {
        setError("Please select a model.");
        onGenerationComplete?.();
        return;
      }

      const tempId = Date.now().toString();
      
      // Preserve current form values for reset, but use submissionData for API
      const formValuesForReset = form.getValues();

      form.reset({
        prompt: "", 
        aspectRatio: formValuesForReset.aspectRatio, 
        outputFormat: formValuesForReset.outputFormat, 
        modelId: formValuesForReset.modelId, 
      });
      setUploadedImageDataUrl(null);
      setSelectedGender(null);
      if (advancedSettingsRef.current) {
        advancedSettingsRef.current.resetSelections();
        advancedSettingsRef.current.closePanel();
      }

      let modelApiId: string | null = null;
      let modelVersion: string | null = null;
      let modelDisplayName = '';
      const selectedModel = models.find(m => m.id === modelId);
      if (selectedModel) {
        modelApiId = selectedModel.model_id;
        modelDisplayName = selectedModel.display_name || selectedModel.model_id || '';
        modelVersion = selectedModel.version || null;
      }

      addPendingGeneration({
        id: tempId,
        prompt: prompt, // Use the prompt from submissionData
        aspectRatio: imageDataUrl ? "Image Reference" : aspectRatio, // Conditional aspect ratio for UI display
        startTime: new Date().toISOString(),
        format: outputFormat,
        modelDisplayName: modelDisplayName
      });

      let currentCredits = 0;
      try {
        const supabase = getSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: subscription } = await supabase
            .from('subscriptions')
            .select('credits_remaining')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .single();
          if (subscription) {
            currentCredits = subscription.credits_remaining;
            if (currentCredits > 0) {
              // setCreditDeducting(true);
              creditEvents.update(currentCredits - 1);
              // setTimeout(() => setCreditDeducting(false), 2000);
            }
          }
        }
      } catch (err) {
        console.error('Error fetching current credits for UI update:', err);
      }

      if (!modelApiId) {
        setError("Please select a valid model.");
        removePendingGeneration(tempId);
        onGenerationComplete?.();
        return;
      }

      const supabase = getSupabase();
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 30000);
      let authHeader = {};
      if (userId) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          authHeader = { 'Authorization': `Bearer ${session.access_token}` };
        }
      }

      interface GenerateRequestBody {
        prompt: string;
        aspectRatio: string;
        outputFormat: string;
        generationId: string;
        modelVersion: string | null;
        modelName: string | null;
        userId: string | null;
        image_data_url?: string;
      }

      const requestBody: GenerateRequestBody = {
        prompt: prompt, // Use the prompt from submissionData
        aspectRatio: aspectRatio,
        outputFormat: outputFormat,
        generationId: tempId,
        modelVersion: modelVersion,
        modelName: modelApiId,
        userId: userId,
      };

      if (imageDataUrl) {
        requestBody.image_data_url = imageDataUrl;
      }

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify(requestBody),
        signal: abortController.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to generate image');
        setErrorDetails(errorData.details || null);
        removePendingGeneration(tempId);
        onGenerationComplete?.();
        return;
      }

      const result = await response.json();
      if (result && result.replicate_id) {
        setPendingGenerations(prev =>
          prev.map(gen =>
            gen.id === tempId ? { ...gen, replicate_id: result.replicate_id, id: result.id || tempId } : gen
          )
        );
      }
      onGenerationComplete?.();
    } catch (fetchError) {
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        setError('Request timed out. Please try again.');
      } else {
        console.error('Error in generation execution:', fetchError);
        setError(fetchError instanceof Error ? fetchError.message : 'An unexpected error occurred');
      }
      // Ensure tempId is defined here for removal if error occurs before API call but after tempId generation
      // However, removePendingGeneration might have already been called for specific errors.
      // For a general catch-all, consider if it's safe or might double-remove.
      // If tempId was generated, try to remove it.
      // This part needs careful thought about where tempId is available and if already handled.
      // For now, let's assume specific error handling for removePendingGeneration is sufficient.
      onGenerationComplete?.();
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    // This onSubmit is for the "Prompt" tab (standard text-to-image)
    await executeGeneration({
      prompt: values.prompt,
      aspectRatio: values.aspectRatio,
      outputFormat: values.outputFormat,
      modelId: values.modelId,
      // No imageDataUrl for prompt-only generation
    });
  };

  // Handler for the "Image Reference" tab's generate button
  const handleImageReferenceGeneration = async () => {
    if (!uploadedImageDataUrl) {
      setError("Please upload a reference image first.");
      return;
    }
    const isModelValid = await form.trigger("modelId");
    if (!isModelValid) {
      // form.trigger will set errors on the form field if invalid
      return;
    }
    const currentValues = form.getValues();
    await executeGeneration({
      prompt: currentValues.prompt, // Use current prompt from form (can be empty/short)
      aspectRatio: currentValues.aspectRatio, // Will be ignored by backend if image is present
      outputFormat: currentValues.outputFormat,
      modelId: currentValues.modelId,
      imageDataUrl: uploadedImageDataUrl,
    });
  };

  // Stop animation function
  const stopAnimation = useCallback(() => {
    setIsAnimating(false);
  }, []);
  
  // Handle input focus
  const handleInputFocus = useCallback(() => {
    if (isAnimating) {
      setPlaceholderText("");
    }
    stopAnimation();
    // Only allow expansion if there's content with newlines or the content is long enough
    if (form.getValues().prompt && (form.getValues().prompt.includes("\n") || form.getValues().prompt.length > 60)) {
      setIsInputFocused(true);
    }
  }, [stopAnimation, form, isAnimating, setPlaceholderText]);
  
  // Handle input blur
  const handleInputBlur = useCallback(() => {
    setIsInputFocused(false);
    // If input is empty and animation was stopped, restart it
    if (!form.getValues().prompt && !isAnimating) {
      animationState.current.currentText = ""; // Reset text for animation
      // animationState.current.currentExampleIndex = 0; // Optional: reset to first example, current logic cycles
      animationState.current.isDeleting = false;
      animationState.current.lastAnimationTime = 0; // Reset timer for smooth restart
      setIsAnimating(true);
    }
  }, [form, isAnimating]);
  
  // Handle input click - only allow expand if there's meaningful content
  const handleInputClick = useCallback(() => {
    if (isAnimating) {
      setPlaceholderText("");
    }
    stopAnimation();
    const content = form.getValues().prompt;
    // Only unfold if there are newlines or the content is long enough to need expansion
    if (content && (content.includes("\n") || content.length > 60)) {
      setIsInputFocused(true);
    }
  }, [stopAnimation, form, isAnimating, setPlaceholderText]);
  
  // Animation effect
  useEffect(() => {
    if (!isAnimating) return;

    const currentRef = animationState.current;
    const animate = () => {
      const now = Date.now();
      const timeSinceLastAnimation = now - currentRef.lastAnimationTime;
      
      if (currentRef.isDeleting) {
        // Handle deletion animation
        if (timeSinceLastAnimation >= currentRef.deletingSpeed) {
          const text = currentRef.currentText;
          if (text.length > 0) {
            currentRef.currentText = text.slice(0, -1);
            setPlaceholderText(currentRef.currentText);
            currentRef.lastAnimationTime = now;
          } else {
            currentRef.isDeleting = false;
            currentRef.currentExampleIndex = (currentRef.currentExampleIndex + 1) % placeholderExamples.length;
            currentRef.timeoutRef = window.setTimeout(() => {
              currentRef.lastAnimationTime = Date.now();
              requestAnimationFrame(animate);
            }, currentRef.pauseBeforeNewExample);
            return;
          }
        }
      } else {
        // Handle typing animation
        if (timeSinceLastAnimation >= currentRef.typingSpeed) {
          const example = placeholderExamples[currentRef.currentExampleIndex];
          const text = currentRef.currentText;
          
          if (text.length < example.length) {
            currentRef.currentText = example.slice(0, text.length + 1);
            setPlaceholderText(currentRef.currentText);
            currentRef.lastAnimationTime = now;
          } else {
            currentRef.timeoutRef = window.setTimeout(() => {
              currentRef.isDeleting = true;
              currentRef.lastAnimationTime = Date.now();
              requestAnimationFrame(animate);
            }, currentRef.pauseBeforeDelete);
            return;
          }
        }
      }
      
      currentRef.timeoutRef = requestAnimationFrame(animate);
    };
    
    currentRef.timeoutRef = requestAnimationFrame(animate);
    
    return () => {
      if (currentRef.timeoutRef) {
        if (typeof currentRef.timeoutRef === 'number') {
          cancelAnimationFrame(currentRef.timeoutRef);
        } else {
          clearTimeout(currentRef.timeoutRef);
        }
      }
    };
  }, [isAnimating, placeholderExamples]);
  
  // Fetch pending generations from the database
  const fetchPendingGenerations = async (userId: string) => {
    try {
      const supabase = getSupabase();
      
      // Fetch predictions with status "starting" or "processing"
      // Join with models table to get display_name
      const { data, error } = await supabase
        .from('predictions')
        .select(`
          *,
          models:model_id (
            display_name
          )
        `)
        .eq('user_id', userId)
        .in('status', ['starting', 'processing']);
        
      // Add any pending generations to state
      if (data && data.length > 0) {
        // Map the data to our PendingGeneration type
        const pendingGens = data.map((pred) => ({
          id: pred.id,
          replicate_id: pred.replicate_id,
          prompt: pred.prompt,
          aspectRatio: pred.aspect_ratio || '1:1',
          startTime: pred.created_at,
          format: pred.format || pred.input?.output_format || 'webp',
          modelDisplayName: pred.models?.display_name || pred.model_name || 'Default Model'
        }));
        
        // Update the pendingGenerations state
        setPendingGenerations(prev => {
          // Filter out any duplicates
          const currentIds = prev.map(p => p.id);
          const newGens = pendingGens.filter(p => !currentIds.includes(p.id));
          return [...prev, ...newGens];
        });
      }
      
      if (error) {
        console.error('Error fetching pending generations:', error);
      }
    } catch (error) {
      console.error('Error in fetchPendingGenerations:', error);
    }
  };

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
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
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="prompt">Create Image</TabsTrigger>
                  <TabsTrigger value="reference">Image Reference</TabsTrigger>
                </TabsList>

                <TabsContent value="prompt">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                    <FormField
                      control={form.control}
                      name="prompt"
                      render={({ field }) => (
                        <FormItem className="md:col-span-12">
                          <FormControl>
                            <div 
                              className={cn(
                                "transition-all duration-300 ease-in-out overflow-hidden",
                                !isInputFocused && field.value && field.value.includes("\n") ? "max-h-[38px]" : "",
                                isInputFocused && (field.value.includes("\n") || field.value.length > 60) ? "max-h-[150px]" : "max-h-[38px]"
                              )}
                            >
                              <TextareaAutosize
                                {...field}
                                placeholder={placeholderText}
                                className={cn(
                                  "w-full bg-transparent text-base resize-none focus:outline-none px-3 py-2 transition-all duration-200",
                                  !isInputFocused && field.value ? "truncate" : ""
                                )}
                                minRows={isInputFocused ? 2 : 1}
                                maxRows={isInputFocused ? 5 : 1}
                                onFocus={handleInputFocus}
                                onBlur={handleInputBlur}
                                onClick={handleInputClick}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="aspectRatio"
                      render={({ field }) => (
                        <FormItem className="md:col-span-4">
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
                          <Select 
                            onValueChange={field.onChange} 
                            value={field.value}
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

                    {/* Conditionally render Generate button inline if Advanced Settings are closed */}
                    {!isAdvancedSettingsOpen && (
                      <div className="md:col-span-2 flex items-end"> {/* Aligns with other form items in the grid */}
                        <Button 
                          type="submit" 
                          variant="outline"
                          className="w-full px-3"
                          disabled={loadingModels}
                          aria-label="Generate image from prompt"
                        >
                          Generate
                        </Button>
                      </div>
                    )}
                  </div> {/* End of the main form grid */} 
                  
                  {/* Use the AdvancedSettings component with ref */}
                  <AdvancedSettings 
                    ref={advancedSettingsRef} 
                    form={form} 
                    onOpenChange={setIsAdvancedSettingsOpen} 
                    isOpen={isAdvancedSettingsOpen}
                    onGenderChange={setSelectedGender}
                  />

                  {/* Render Generate button at the bottom ONLY when Advanced Settings is open */}
                  {isAdvancedSettingsOpen && (
                    <div className="flex justify-end mt-6">
                      <Button 
                        type="submit" 
                        variant="outline"
                        className="w-full px-3"
                        disabled={loadingModels}
                        aria-label="Generate image from prompt"
                      >
                        Generate
                      </Button>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="reference">
                  <div className="mb-4 p-4 text-sm text-muted-foreground flex flex-col items-start gap-4">
                    {/* Visual Explanation Row - Now with responsive justification */}
                    <div className="flex items-center justify-center md:justify-start gap-3 flex-wrap w-full">
                      {/* Reference Images Block (with text below for alignment) */}
                      <div className="flex flex-col items-center text-center">
                        <div className="flex items-center gap-2 pl-1"> {/* Container for the two disordered images */}
                          <div className="transform -rotate-3">
                            <Image 
                              src="/references/lavander.webp"
                              alt="Reference photo example - lavender field"
                              width={64} 
                              height={64}
                              className="rounded-lg object-cover shadow-sm border-4 border-white"
                              priority
                            />
                          </div>
                          <div className="transform rotate-3 translate-y-1">
                            <Image
                              src="/references/acacia.webp"
                              alt="Reference photo example - acacia tree"
                              width={64}
                              height={64}
                              className="rounded-lg object-cover shadow-sm border-4 border-white"
                              priority
                            />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">Reference Photo</p>
                      </div>

                      <Plus size={24} className="text-muted-foreground shrink-0" strokeWidth={3} />

                      {/* "Your Model" Placeholder with disorder and size adjustment */}
                      <div className="flex flex-col items-center text-center">
                        <div className="transform -rotate-3 p-1 border-4 border-dashed border-muted-foreground/50 rounded-lg flex items-center justify-center w-16 h-16">
                          <UserSquare2 size={32} className="text-primary/80" />
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">Your Model</p>
                      </div>
                    </div>
                    
                    {/* Explanatory Text */}
                    <div className="mt-3 w-full">
                      <p className="text-sm">
                        Combine any <strong className="text-primary">reference photo</strong> (for its style, colors, and composition) with <strong className="text-primary">your trained AI model</strong> (featuring your unique look or subject).<br className="md:hidden" /><br className="md:hidden" /> The AI will craft a new image blending the reference&rsquo;s atmosphere with your model&rsquo;s distinct characteristics!
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                    {/* Image Uploader */}
                    <div className="md:col-span-5">
                      <ImageUpload 
                        onImageChange={handleImageChange} 
                        currentImageUrl={uploadedImageDataUrl}
                        className="w-full"
                      />
                    </div>

                    {/* Output Format Selector (moved before Model Selector) */}
                    <FormField
                      control={form.control}
                      name="outputFormat"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
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

                    {/* Model Selector (moved after Output Format Selector) */}
                    <FormField
                      control={form.control}
                      name="modelId"
                      render={({ field }) => (
                        <FormItem className="md:col-span-3">
                          <Select 
                            onValueChange={field.onChange} 
                            value={field.value}
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

                    {/* Generate Button */}
                    <div className="md:col-span-2">
                      <Button 
                        type="button"
                        variant="outline"
                        onClick={handleImageReferenceGeneration}
                        className="w-full px-3"
                        disabled={loadingModels || !uploadedImageDataUrl}
                        aria-label="Generate image from image reference"
                      >
                        Generate
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
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