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
import { Plus, UserSquare2, ImageIcon, Type } from 'lucide-react'

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
  gender?: string;         // Gender of the model (male/female)
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
  const maxSize = 24;
  let frameWidth, frameHeight;
  
  if (width >= height) {
    frameWidth = maxSize;
    frameHeight = (height / width) * maxSize;
  } else {
    frameHeight = maxSize;
    frameWidth = (width / height) * maxSize;
  }
  
  return (
    <div className="flex items-center gap-3">
      <div 
        className={cn(
          "rounded-md border transition-all duration-200",
          isSelected 
            ? "border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-800/50" 
            : "border-border bg-muted/30 hover:border-slate-300 dark:hover:border-slate-600"
        )}
        style={{ 
          width: `${frameWidth}px`, 
          height: `${frameHeight}px`,
        }}
      />
      {showLabel && (
        <span className={cn(
          "text-sm font-medium transition-colors duration-200",
          isSelected ? "text-slate-700 dark:text-slate-300" : "text-muted-foreground"
        )}>
          {ratio.replace(':', '∶')}
        </span>
      )}
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
          const response = await fetch(`/api/model/list?is_cancelled=false&is_deleted=false&status=succeeded&page=${currentPage}&fields=id,display_name,model_id,model_owner,version,gender`);
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
      let modelGender: string | null = null;
      const selectedModel = models.find(m => m.id === modelId);
      if (selectedModel) {
        modelApiId = selectedModel.model_id;
        modelDisplayName = selectedModel.display_name || selectedModel.model_id || '';
        modelVersion = selectedModel.version || null;
        modelGender = selectedModel.gender || null;
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
        modelGender?: string | null;
      }

      const requestBody: GenerateRequestBody = {
        prompt: prompt, // Use the prompt from submissionData
        aspectRatio: aspectRatio,
        outputFormat: outputFormat,
        generationId: tempId,
        modelVersion: modelVersion,
        modelName: modelApiId,
        userId: userId,
        modelGender: modelGender,
      };

      if (imageDataUrl) {
        requestBody.image_data_url = imageDataUrl;
      }

      let response;
      try {
        response = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader },
          body: JSON.stringify(requestBody),
          signal: abortController.signal
        });
      } catch (err) {
        console.error('Error sending request:', err);
        if (err instanceof Error && err.message.includes('string did not match')) {
          setError('Failed to process image. The image format may be unsupported. Please try a different image.');
        } else {
          setError('Failed to send request. Please try again.');
        }
        removePendingGeneration(tempId);
        onGenerationComplete?.();
        return;
      }
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
      <div className="w-full bg-gradient-to-br from-card/95 via-card to-card/90 border border-border/60 rounded-2xl overflow-hidden shadow-xl backdrop-blur-sm">
        <div className="p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6 bg-muted/40 p-1 rounded-xl">
                  <TabsTrigger 
                    value="prompt" 
                    className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg transition-all duration-200"
                  >
                    <Type className="w-4 h-4" />
                    <span className="font-medium">Text to Image</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="reference" 
                    className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg transition-all duration-200"
                  >
                    <ImageIcon className="w-4 h-4" />
                    <span className="font-medium">Image Reference</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="prompt" className="space-y-6">
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="prompt"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <div 
                              className={cn(
                                "relative bg-background/50 backdrop-blur-sm border border-border/60 rounded-xl p-4 transition-all duration-300 ease-in-out overflow-hidden hover:border-border",
                                isInputFocused ? "ring-2 ring-primary/20 border-primary/30" : "",
                                !isInputFocused && field.value && field.value.includes("\n") ? "max-h-[60px]" : "",
                                isInputFocused && (field.value.includes("\n") || field.value.length > 60) ? "max-h-[180px]" : "max-h-[60px]"
                              )}
                            >
                              <TextareaAutosize
                                {...field}
                                placeholder={placeholderText}
                                className={cn(
                                  "w-full bg-transparent text-base resize-none focus:outline-none placeholder:text-muted-foreground/60 transition-all duration-200",
                                  !isInputFocused && field.value ? "truncate" : ""
                                )}
                                minRows={isInputFocused ? 2 : 1}
                                maxRows={isInputFocused ? 6 : 1}
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
                    
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                      <FormField
                        control={form.control}
                        name="aspectRatio"
                        render={({ field }) => (
                          <FormItem className="lg:col-span-4">
                            <Select 
                              onValueChange={field.onChange} 
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger className="bg-background/50 backdrop-blur-sm border-border/60 hover:border-border transition-all duration-200">
                                  <SelectValue placeholder="Select aspect ratio">
                                    {field.value && (
                                      <div className="flex items-center gap-3">
                                        <AspectRatioFrame ratio={field.value} showLabel={false} isSelected={true} />
                                        <span className="font-medium">
                                          {field.value === "1:1" ? "Square" :
                                          field.value === "16:9" ? "Landscape" :
                                          field.value === "9:16" ? "Portrait" :
                                          field.value === "4:3" ? "Standard" :
                                          field.value === "3:2" ? "Classic" : field.value}
                                        </span>
                                      </div>
                                    )}
                                  </SelectValue>
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="1:1">
                                  <div className="flex items-center gap-3">
                                    <AspectRatioFrame ratio="1:1" showLabel={false} isSelected={field.value === "1:1"} />
                                    <span>Square (1:1)</span>
                                  </div>
                                </SelectItem>
                                <SelectItem value="16:9">
                                  <div className="flex items-center gap-3">
                                    <AspectRatioFrame ratio="16:9" showLabel={false} isSelected={field.value === "16:9"} />
                                    <span>Landscape (16:9)</span>
                                  </div>
                                </SelectItem>
                                <SelectItem value="9:16">
                                  <div className="flex items-center gap-3">
                                    <AspectRatioFrame ratio="9:16" showLabel={false} isSelected={field.value === "9:16"} />
                                    <span>Portrait (9:16)</span>
                                  </div>
                                </SelectItem>
                                <SelectItem value="4:3">
                                  <div className="flex items-center gap-3">
                                    <AspectRatioFrame ratio="4:3" showLabel={false} isSelected={field.value === "4:3"} />
                                    <span>Standard (4:3)</span>
                                  </div>
                                </SelectItem>
                                <SelectItem value="3:2">
                                  <div className="flex items-center gap-3">
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
                          <FormItem className="lg:col-span-3">
                            <Select 
                              onValueChange={field.onChange} 
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger className="bg-background/50 backdrop-blur-sm border-border/60 hover:border-border transition-all duration-200">
                                  <SelectValue placeholder="Format" />
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
                          <FormItem className="lg:col-span-3">
                            <Select 
                              onValueChange={field.onChange} 
                              value={field.value}
                              disabled={loadingModels || models.length === 0}
                            >
                              <FormControl>
                                <SelectTrigger className="bg-background/50 backdrop-blur-sm border-border/60 hover:border-border transition-all duration-200">
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

                      {/* Always show Generate button in consistent position - no conditional rendering */}
                      <div className="lg:col-span-2 flex items-end">
                        <Button 
                          type="submit" 
                          className="w-full bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80 text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-200 font-medium"
                          disabled={loadingModels}
                          aria-label="Generate image from prompt"
                        >
                          Generate
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Use the AdvancedSettings component with ref */}
                  <AdvancedSettings 
                    ref={advancedSettingsRef} 
                    form={form} 
                    onOpenChange={setIsAdvancedSettingsOpen} 
                    isOpen={isAdvancedSettingsOpen}
                    onGenderChange={setSelectedGender}
                  />
                </TabsContent>

                <TabsContent value="reference" className="space-y-6">
                  <div className="bg-gradient-to-br from-muted/30 via-muted/20 to-background/80 border border-border/40 rounded-xl p-6 space-y-6">
                    {/* Visual Explanation Row */}
                    <div className="flex items-center justify-center gap-3 md:gap-6">
                      {/* Reference Images Block */}
                      <div className="flex flex-col items-center text-center space-y-2 md:space-y-3">
                        <div className="flex items-center gap-1.5 md:gap-3 pl-1">
                          <div className="group transform -rotate-3 transition-all duration-500 ease-out hover:rotate-1 hover:scale-110 hover:-translate-y-2 cursor-pointer">
                            <Image 
                              src="/references/lavander.webp"
                              alt="Reference photo example - lavender field"
                              width={80} 
                              height={80}
                              quality={100}
                              sizes="(max-width: 768px) 64px, 80px"
                              className="w-16 h-16 md:w-20 md:h-20 rounded-lg md:rounded-xl object-cover shadow-lg border-2 md:border-4 border-white group-hover:shadow-2xl group-hover:shadow-purple-500/30 group-hover:border-purple-200 dark:group-hover:border-purple-400 transition-all duration-500 ease-out group-hover:brightness-110"
                              priority
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-purple-600/0 via-transparent to-purple-400/0 group-hover:from-purple-600/10 group-hover:to-purple-400/5 rounded-lg md:rounded-xl transition-all duration-500 ease-out pointer-events-none" />
                          </div>
                          <div className="group transform rotate-3 translate-y-1 transition-all duration-500 ease-out hover:rotate-0 hover:scale-110 hover:-translate-y-1 cursor-pointer">
                            <Image
                              src="/references/acacia.webp"
                              alt="Reference photo example - acacia tree"
                              width={80}
                              height={80}
                              quality={100}
                              sizes="(max-width: 768px) 64px, 80px"
                              className="w-16 h-16 md:w-20 md:h-20 rounded-lg md:rounded-xl object-cover shadow-lg border-2 md:border-4 border-white group-hover:shadow-2xl group-hover:shadow-green-500/30 group-hover:border-green-200 dark:group-hover:border-green-400 transition-all duration-500 ease-out group-hover:brightness-110"
                              priority
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-green-600/0 via-transparent to-green-400/0 group-hover:from-green-600/10 group-hover:to-green-400/5 rounded-lg md:rounded-xl transition-all duration-500 ease-out pointer-events-none" />
                          </div>
                        </div>
                        <p className="text-xs md:text-sm font-medium text-muted-foreground">Reference Photo</p>
                      </div>

                      <div className="flex items-center justify-center flex-shrink-0">
                        <div className="bg-gradient-to-r from-primary/20 to-primary/10 rounded-full p-2 md:p-3">
                          <Plus size={20} className="md:w-7 md:h-7 text-primary" strokeWidth={2.5} />
                        </div>
                      </div>

                      {/* "Your Model" Placeholder */}
                      <div className="flex flex-col items-center text-center space-y-2 md:space-y-3">
                        <div className="group relative transform -rotate-2 transition-all duration-500 ease-out hover:rotate-1 hover:scale-110 hover:-translate-y-2 cursor-pointer">
                          {/* Main container with enhanced styling */}
                          <div className="relative w-16 h-16 md:w-20 md:h-20 bg-gradient-to-br from-primary/10 via-primary/5 to-primary/15 group-hover:from-primary/20 group-hover:via-primary/10 group-hover:to-primary/25 border-2 md:border-4 border-dashed border-primary/40 group-hover:border-primary/60 group-hover:border-solid rounded-lg md:rounded-xl transition-all duration-500 ease-out overflow-hidden group-hover:shadow-2xl group-hover:shadow-primary/30">
                            
                            {/* Animated background pattern */}
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-primary/5 to-primary/10 animate-pulse" />
                              <div className="absolute top-1 right-1 w-2 h-2 bg-primary/20 rounded-full animate-ping" />
                            </div>
                            
                            {/* Icon container */}
                            <div className="relative z-10 w-full h-full flex items-center justify-center">
                              <div className="relative">
                                {/* Main icon */}
                                <UserSquare2 
                                  size={20} 
                                  className="md:w-7 md:h-7 text-primary/70 group-hover:text-primary group-hover:scale-110 transition-all duration-500 ease-out" 
                                />
                                
                                {/* Subtle glow effect */}
                                <div className="absolute inset-0 bg-primary/20 rounded-full blur-lg scale-150 opacity-0 group-hover:opacity-50 transition-all duration-500 ease-out" />
                              </div>
                            </div>
                            
                            {/* Shimmer effect on hover */}
                            <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12" />
                          </div>
                          
                          {/* Outer glow on hover */}
                          <div className="absolute inset-0 bg-primary/10 rounded-lg md:rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-500 ease-out blur-xl scale-125" />
                        </div>
                        <p className="text-xs md:text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors duration-300">Your Model</p>
                      </div>
                    </div>
                    
                    {/* Explanatory Text */}
                    <div className="text-center space-y-2">
                      <h3 className="text-lg font-semibold text-foreground">Blend Reference Style with Your Model</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl mx-auto">
                        Combine any <span className="font-semibold text-primary">reference photo</span> (for its style, colors, and composition) with <span className="font-semibold text-primary">your trained AI model</span> (featuring your unique look or subject). The AI will craft a new image blending the reference&rsquo;s atmosphere with your model&rsquo;s distinct characteristics!
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    {/* Image Uploader */}
                    <div className="lg:col-span-5">
                      <ImageUpload 
                        onImageChange={handleImageChange} 
                        currentImageUrl={uploadedImageDataUrl}
                        className="w-full"
                      />
                    </div>

                    {/* Output Format Selector */}
                    <FormField
                      control={form.control}
                      name="outputFormat"
                      render={({ field }) => (
                        <FormItem className="lg:col-span-2">
                          <Select 
                            onValueChange={field.onChange} 
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger className="bg-background/50 backdrop-blur-sm border-border/60 hover:border-border transition-all duration-200">
                                <SelectValue placeholder="Format" />
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

                    {/* Model Selector */}
                    <FormField
                      control={form.control}
                      name="modelId"
                      render={({ field }) => (
                        <FormItem className="lg:col-span-3">
                          <Select 
                            onValueChange={field.onChange} 
                            value={field.value}
                            disabled={loadingModels || models.length === 0}
                          >
                            <FormControl>
                              <SelectTrigger className="bg-background/50 backdrop-blur-sm border-border/60 hover:border-border transition-all duration-200">
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
                    <div className="lg:col-span-2">
                      <Button 
                        type="button"
                        onClick={handleImageReferenceGeneration}
                        className="w-full bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80 text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-200 font-medium"
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
          <div className="mx-6 mb-6 p-4 bg-gradient-to-r from-destructive/10 via-destructive/5 to-destructive/10 border border-destructive/20 rounded-xl backdrop-blur-sm">
            <h3 className="text-lg font-semibold text-destructive mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Error
            </h3>
            <p className="text-sm text-destructive/90 leading-relaxed">{error}</p>
            {errorDetails && (
              <p className="text-xs text-destructive/70 mt-2 leading-relaxed">{errorDetails}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 