"use client"

import { useState, forwardRef, useImperativeHandle } from "react"
import { ChevronDown, ChevronUp, Palette, Camera, Smile, Crown, Lightbulb, Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import { UseFormReturn } from "react-hook-form"

import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

// Interface definitions
interface BackgroundColor {
  value: string;
  label: string;
  color: string;
  promptText: string;
}

interface FacialExpression {
  value: string;
  label: string;
  emoji: string;
  promptText: string;
}

interface Accessory {
  value: string;
  label: string;
  emoji: string;
  promptText: string;
}

interface CameraShot {
  value: string;
  label: string;
  icon: string;
  promptText: string;
}

interface Gender {
  value: string;
  label: string;
  icon: string;
  promptText: string;
}

// Define background colors
const backgroundColors: BackgroundColor[] = [
  {
    value: "white",
    label: "White",
    color: "#ffffff",
    promptText: "on a white background"
  },
  {
    value: "black",
    label: "Black",
    color: "#000000",
    promptText: "on a black background"
  },
  {
    value: "red",
    label: "Red",
    color: "#ef4444",
    promptText: "on a red background"
  },
  {
    value: "blue",
    label: "Blue",
    color: "#3b82f6",
    promptText: "on a blue background"
  },
  {
    value: "green",
    label: "Green",
    color: "#10b981",
    promptText: "on a green background"
  },
  {
    value: "yellow",
    label: "Yellow",
    color: "#eab308",
    promptText: "on a yellow background"
  },
  {
    value: "purple",
    label: "Purple",
    color: "#8b5cf6",
    promptText: "on a purple background"
  },
  {
    value: "pink",
    label: "Pink",
    color: "#ec4899",
    promptText: "on a pink background"
  },
  {
    value: "orange",
    label: "Orange",
    color: "#f97316",
    promptText: "on an orange background"
  },
  {
    value: "gray",
    label: "Gray",
    color: "#6b7280",
    promptText: "on a gray background"
  },
  {
    value: "brown",
    label: "Brown",
    color: "#78350f",
    promptText: "on a brown background"
  },
  {
    value: "teal",
    label: "Teal",
    color: "#14b8a6",
    promptText: "on a teal background"
  }
];

// Utility function to clean up prompt string
const cleanupPrompt = (prompt: string): string => {
  if (!prompt) return "";
  // Consolidate multiple spaces into one
  let cleaned = prompt.replace(/\s+/g, ' ').trim();
  // Remove leading/trailing commas and spaces around commas
  cleaned = cleaned.replace(/^,|,$/g, '').trim();
  cleaned = cleaned.replace(/\s*,\s*/g, ', ').trim();
  // Remove duplicate commas that might result from replacements
  cleaned = cleaned.replace(/,+/g, ',');
  // Remove any leading/trailing commas again if they reappeared
  cleaned = cleaned.replace(/^,|,$/g, '').trim();
  return cleaned;
};

// Define facial expressions
const facialExpressions: FacialExpression[] = [
  {
    value: "smile",
    label: "Smiling",
    emoji: "😊",
    promptText: "with a natural smile"
  },
  {
    value: "laugh",
    label: "Laughing",
    emoji: "😄",
    promptText: "with a genuine laugh"
  },
  {
    value: "serious",
    label: "Serious",
    emoji: "😐",
    promptText: "with a serious expression"
  },
  {
    value: "thoughtful",
    label: "Thoughtful",
    emoji: "🤔",
    promptText: "with a thoughtful expression"
  },
  {
    value: "sad",
    label: "Sad",
    emoji: "😢",
    promptText: "with a sad expression"
  },
  {
    value: "confident",
    label: "Confident",
    emoji: "😎",
    promptText: "with a confident expression"
  },
  {
    value: "surprised",
    label: "Surprised",
    emoji: "😮",
    promptText: "with a surprised expression"
  },
  {
    value: "choked",
    label: "Shocked",
    emoji: "😱",
    promptText: "with a shocked expression"
  }
];

// Define accessories
const accessories: Accessory[] = [
  {
    value: "glasses",
    label: "Glasses",
    emoji: "👓",
    promptText: "wearing glasses"
  },
  {
    value: "sunglasses",
    label: "Sunglasses",
    emoji: "😎",
    promptText: "wearing sunglasses"
  },
  {
    value: "hat",
    label: "Hat",
    emoji: "🧢",
    promptText: "wearing a hat"
  },
  {
    value: "beanie",
    label: "Beanie",
    emoji: "🧶",
    promptText: "wearing a beanie"
  },
  {
    value: "scarf",
    label: "Scarf",
    emoji: "🧣",
    promptText: "wearing a scarf"
  },
  {
    value: "earrings",
    label: "Earrings",
    emoji: "💎",
    promptText: "wearing earrings"
  },
  {
    value: "necklace",
    label: "Necklace",
    emoji: "📿",
    promptText: "wearing a necklace"
  },
  {
    value: "headphones",
    label: "Headphones",
    emoji: "🎧",
    promptText: "wearing headphones"
  },
  {
    value: "tie",
    label: "Tie",
    emoji: "👔",
    promptText: "wearing a tie"
  },
  {
    value: "bowtie",
    label: "Bow Tie",
    emoji: "🎀",
    promptText: "wearing a bow tie"
  },
  {
    value: "watch",
    label: "Watch",
    emoji: "⌚",
    promptText: "wearing a watch"
  },
  {
    value: "suit",
    label: "Suit",
    emoji: "🕴️",
    promptText: "wearing a suit"
  }
];

// Define camera shots
const cameraShots: CameraShot[] = [
  {
    value: "portrait",
    label: "Portrait",
    icon: "🖼️",
    promptText: "A portrait shot"
  },
  {
    value: "closeup",
    label: "Close-up",
    icon: "👁️",
    promptText: "A close-up shot"
  },
  {
    value: "wide",
    label: "Wide",
    icon: "📸",
    promptText: "A wide shot"
  },
  {
    value: "medium",
    label: "Medium",
    icon: "🎞️",
    promptText: "A medium shot"
  },
  {
    value: "fullbody",
    label: "Full Body",
    icon: "👤",
    promptText: "A full body shot"
  },
  {
    value: "monochrome",
    label: "Monochrome",
    icon: "⚫",
    promptText: "A monochrome photo"
  }
];

// Define genders
const genders: Gender[] = [
  {
    value: "male",
    label: "Male",
    icon: "M",
    promptText: "the subject is a male"
  },
  {
    value: "female",
    label: "Female",
    icon: "F",
    promptText: "the subject is a female"
  }
];

// Define lights
interface LightSetting {
  value: string;
  label: string;
  icon: string;
  promptText: string;
}

const lightSettings: LightSetting[] = [
  {
    value: "natural",
    label: "Natural Light",
    icon: "🌞",
    promptText: "with natural lighting"
  },
  {
    value: "studio",
    label: "Studio Light",
    icon: "💡",
    promptText: "with studio lighting"
  },
  {
    value: "soft",
    label: "Soft Light",
    icon: "🕯️",
    promptText: "with soft lighting"
  },
  {
    value: "dramatic",
    label: "Dramatic Light",
    icon: "🎭",
    promptText: "with dramatic lighting"
  },
  {
    value: "backlit",
    label: "Backlit",
    icon: "🔦",
    promptText: "with backlighting"
  },
  {
    value: "outdoor",
    label: "Outdoor Light",
    icon: "🌤️",
    promptText: "with outdoor lighting"
  }
];

// Update the interface to match the form structure
interface FormFields {
  prompt: string;
  aspectRatio: string;
  outputFormat: string;
  modelId: string;
}

interface AdvancedSettingsProps {
  form: UseFormReturn<FormFields>;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onGenderChange?: (gender: string | null) => void;
}

export type AdvancedSettingsRefType = {
  resetSelections: () => void;
  closePanel: () => void;
  isOpen: boolean;
  handleGenderSelect: (gender: string) => void;
};

export const AdvancedSettings = forwardRef<AdvancedSettingsRefType, AdvancedSettingsProps>(
  ({ form, isOpen, onOpenChange, onGenderChange }, ref) => {
    const [selectedBgColor, setSelectedBgColor] = useState<string | null>(null);
    const [selectedExpression, setSelectedExpression] = useState<string | null>(null);
    const [selectedAccessory, setSelectedAccessory] = useState<string[]>([]);
    const [selectedCameraShot, setSelectedCameraShot] = useState<string | null>(null);
    const [selectedGender, setSelectedGender] = useState<string | null>(null);
    const [selectedLight, setSelectedLight] = useState<string | null>(null);

    const resetSelections = () => {
      setSelectedBgColor(null);
      setSelectedExpression(null);
      setSelectedAccessory([]);
      setSelectedCameraShot(null);
      setSelectedGender(null);
      setSelectedLight(null);
    };

    const closePanel = () => {
      if (onOpenChange) onOpenChange(false);
    };

    useImperativeHandle(ref, () => ({
      resetSelections,
      closePanel,
      isOpen: isOpen,
      handleGenderSelect
    }));

    const handleBgColorSelect = (bgColorValue: string) => {
      // If monochrome is selected, only allow white and black
      if (selectedCameraShot === "monochrome" && bgColorValue !== "white" && bgColorValue !== "black") {
        return;
      }

      const currentBgColor = selectedBgColor;
      const currentPrompt = form.getValues().prompt;
      
      if (currentBgColor === bgColorValue) {
        setSelectedBgColor(null);
        const bgColorToRemove = backgroundColors.find(bg => bg.value === currentBgColor);
        if (bgColorToRemove) {
          const updatedPrompt = currentPrompt.replace(bgColorToRemove.promptText, '');
          form.setValue("prompt", cleanupPrompt(updatedPrompt));
        }
        return;
      }
      
      let updatedPrompt = currentPrompt;
      if (currentBgColor) {
        const previousBgColor = backgroundColors.find(bg => bg.value === currentBgColor);
        if (previousBgColor) {
          updatedPrompt = updatedPrompt.replace(previousBgColor.promptText, '');
        }
      }
      
      const newBgColor = backgroundColors.find(bg => bg.value === bgColorValue);
      if (newBgColor) {
        const cleanedBasePrompt = cleanupPrompt(updatedPrompt);
        if (cleanedBasePrompt) {
          updatedPrompt = `${cleanedBasePrompt}, ${newBgColor.promptText}`;
        } else {
          updatedPrompt = newBgColor.promptText;
        }
        form.setValue("prompt", cleanupPrompt(updatedPrompt));
        setSelectedBgColor(bgColorValue);
      }
    };

    const handleExpressionSelect = (expressionValue: string) => {
      const currentExpression = selectedExpression;
      const currentPrompt = form.getValues().prompt;
      
      if (currentExpression === expressionValue) {
        setSelectedExpression(null);
        const expressionToRemove = facialExpressions.find(expr => expr.value === currentExpression);
        if (expressionToRemove) {
          const updatedPrompt = currentPrompt.replace(expressionToRemove.promptText, '');
          form.setValue("prompt", cleanupPrompt(updatedPrompt));
        }
        return;
      }
      
      let updatedPrompt = currentPrompt;
      if (currentExpression) {
        const previousExpression = facialExpressions.find(expr => expr.value === currentExpression);
        if (previousExpression) {
          updatedPrompt = updatedPrompt.replace(previousExpression.promptText, '');
        }
      }
      
      const newExpression = facialExpressions.find(expr => expr.value === expressionValue);
      if (newExpression) {
        const cleanedBasePrompt = cleanupPrompt(updatedPrompt);
        if (cleanedBasePrompt) {
          updatedPrompt = `${cleanedBasePrompt}, ${newExpression.promptText}`;
        } else {
          updatedPrompt = newExpression.promptText;
        }
        form.setValue("prompt", cleanupPrompt(updatedPrompt));
        setSelectedExpression(expressionValue);
      }
    };

    const handleAccessorySelect = (accessoryValue: string) => {
      const currentPrompt = form.getValues().prompt;
      
      if (selectedAccessory.includes(accessoryValue)) {
        const updatedAccessories = selectedAccessory.filter(acc => acc !== accessoryValue);
        setSelectedAccessory(updatedAccessories);
        const accessoryToRemove = accessories.find(acc => acc.value === accessoryValue);
        if (accessoryToRemove) {
          const updatedPrompt = currentPrompt.replace(accessoryToRemove.promptText, '');
          form.setValue("prompt", cleanupPrompt(updatedPrompt));
        }
        return;
      }
      
      const newAccessories = [...selectedAccessory, accessoryValue];
      setSelectedAccessory(newAccessories);
      
      const newAccessory = accessories.find(acc => acc.value === accessoryValue);
      if (newAccessory) {
        const basePrompt = cleanupPrompt(currentPrompt);
        if (basePrompt) {
          form.setValue("prompt", cleanupPrompt(`${basePrompt}, ${newAccessory.promptText}`));
        } else {
          form.setValue("prompt", cleanupPrompt(newAccessory.promptText));
        }
      }
    };

    const handleCameraShotSelect = (shotValue: string) => {
      const currentShot = selectedCameraShot;
      const currentPrompt = form.getValues().prompt;
      
      if (currentShot === shotValue) {
        setSelectedCameraShot(null);
        const shotToRemove = cameraShots.find(shot => shot.value === currentShot);
        if (shotToRemove) {
          const updatedPrompt = currentPrompt.replace(shotToRemove.promptText, '');
          form.setValue("prompt", cleanupPrompt(updatedPrompt));
        }
        return;
      }
      
      let updatedPrompt = currentPrompt;
      if (currentShot) {
        const previousShot = cameraShots.find(shot => shot.value === currentShot);
        if (previousShot) {
          updatedPrompt = updatedPrompt.replace(previousShot.promptText, '');
        }
      }
      
      const newShot = cameraShots.find(shot => shot.value === shotValue);
      if (newShot) {
        const cleanedBasePrompt = cleanupPrompt(updatedPrompt);
        if (cleanedBasePrompt) {
          updatedPrompt = `${newShot.promptText}, ${cleanedBasePrompt}`;
        } else {
          updatedPrompt = newShot.promptText;
        }
        form.setValue("prompt", cleanupPrompt(updatedPrompt));
        setSelectedCameraShot(shotValue);

        // If selecting monochrome, clear any background color that's not white or black
        if (shotValue === "monochrome" && selectedBgColor && selectedBgColor !== "white" && selectedBgColor !== "black") {
          const bgColorToRemove = backgroundColors.find(bg => bg.value === selectedBgColor);
          if (bgColorToRemove) {
            const finalPrompt = updatedPrompt.replace(bgColorToRemove.promptText, '');
            form.setValue("prompt", cleanupPrompt(finalPrompt));
            setSelectedBgColor(null);
          }
        }
      }
    };

    const handleGenderSelect = (genderValue: string) => {
      const currentGender = selectedGender;
      const currentPrompt = form.getValues().prompt;
      
      if (currentGender === genderValue) {
        setSelectedGender(null);
        if (onGenderChange) onGenderChange(null);
        const genderToRemove = genders.find(g => g.value === currentGender);
        if (genderToRemove) {
          const updatedPrompt = currentPrompt.replace(genderToRemove.promptText, '');
          form.setValue("prompt", cleanupPrompt(updatedPrompt));
        }
        return;
      }
      
      let updatedPrompt = currentPrompt;
      if (currentGender) {
        const previousGender = genders.find(g => g.value === currentGender);
        if (previousGender) {
          updatedPrompt = updatedPrompt.replace(previousGender.promptText, '');
        }
      }
      
      const newGender = genders.find(g => g.value === genderValue);
      if (newGender) {
        const cleanedBasePrompt = cleanupPrompt(updatedPrompt);
        if (cleanedBasePrompt) {
          updatedPrompt = `${cleanedBasePrompt}, ${newGender.promptText}`;
        } else {
          updatedPrompt = newGender.promptText;
        }
        form.setValue("prompt", cleanupPrompt(updatedPrompt));
        setSelectedGender(genderValue);
        if (onGenderChange) onGenderChange(genderValue);
      }
    };

    const handleLightSelect = (lightValue: string) => {
      const currentLight = selectedLight;
      const currentPrompt = form.getValues().prompt;
      
      if (currentLight === lightValue) {
        setSelectedLight(null);
        const lightToRemove = lightSettings.find(l => l.value === currentLight);
        if (lightToRemove) {
          const updatedPrompt = currentPrompt.replace(lightToRemove.promptText, '');
          form.setValue("prompt", cleanupPrompt(updatedPrompt));
        }
        return;
      }
      
      let updatedPrompt = currentPrompt;
      if (currentLight) {
        const previousLight = lightSettings.find(l => l.value === currentLight);
        if (previousLight) {
          updatedPrompt = updatedPrompt.replace(previousLight.promptText, '');
        }
      }
      
      const newLight = lightSettings.find(l => l.value === lightValue);
      if (newLight) {
        const cleanedBasePrompt = cleanupPrompt(updatedPrompt);
        if (cleanedBasePrompt) {
          updatedPrompt = `${cleanedBasePrompt}, ${newLight.promptText}`;
        } else {
          updatedPrompt = newLight.promptText;
        }
        form.setValue("prompt", cleanupPrompt(updatedPrompt));
        setSelectedLight(lightValue);
      }
    };

    const getSelectedCount = () => {
      let count = 0;
      if (selectedBgColor) count++;
      if (selectedExpression) count++;
      if (selectedAccessory.length > 0) count++;
      if (selectedCameraShot) count++;
      if (selectedGender) count++;
      if (selectedLight) count++;
      return count;
    };

    return (
      <Collapsible
        open={isOpen}
        onOpenChange={onOpenChange}
        className="border-t border-border/40 pt-6 mt-6"
      >
        <div className="flex items-center justify-between">
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              className="group gap-2 text-muted-foreground hover:text-foreground bg-muted/20 hover:bg-muted/40 rounded-lg px-4 py-2 transition-all duration-200"
            >
              <Settings className="h-4 w-4 group-hover:rotate-90 transition-transform duration-300" />
              <span className="font-medium">Advanced Settings</span>
              {getSelectedCount() > 0 && (
                <span className="bg-primary/20 text-primary text-xs px-2 py-0.5 rounded-full font-medium">
                  {getSelectedCount()}
                </span>
              )}
              {isOpen ? (
                <ChevronUp className="h-4 w-4 transition-transform duration-200" />
              ) : (
                <ChevronDown className="h-4 w-4 transition-transform duration-200" />
              )}
            </Button>
          </CollapsibleTrigger>
        </div>
        <div 
          className={cn(
            "overflow-hidden transition-all duration-300 ease-out will-change-transform transform-gpu",
            isOpen 
              ? "translate-y-0 opacity-100 mt-6 pointer-events-auto" 
              : "-translate-y-4 opacity-0 mt-0 pointer-events-none"
          )}
          style={{
            maxHeight: isOpen ? '2000px' : '0px',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: isOpen ? 'translate3d(0, 0, 0)' : 'translate3d(0, -16px, 0)'
          }}
        >
          <div 
            className="bg-gradient-to-br from-muted/20 via-background/50 to-muted/10 border border-border/30 rounded-xl p-4 sm:p-6 space-y-6 sm:space-y-8 backdrop-blur-sm"
            style={{ transform: 'translate3d(0, 0, 0)' }}
          >
            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm sm:text-base font-semibold text-foreground flex items-center gap-2 flex-wrap">
                  <Camera className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
                  <span>Camera Shot</span>
                  <span className={cn(
                    "text-xs sm:text-sm font-normal bg-muted/50 px-2 py-1 rounded-md transition-opacity duration-200 min-w-[60px] text-center",
                    selectedCameraShot 
                      ? "text-muted-foreground opacity-100" 
                      : "text-transparent opacity-0"
                  )}>
                    {selectedCameraShot 
                      ? cameraShots.find(shot => shot.value === selectedCameraShot)?.label 
                      : "Placeholder"}
                  </span>
                </h4>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  type="button"
                  className={cn(
                    "h-8 px-3 text-xs transition-opacity duration-200 flex-shrink-0",
                    selectedCameraShot 
                      ? "text-muted-foreground hover:text-foreground opacity-100 cursor-pointer" 
                      : "text-transparent opacity-0 cursor-default pointer-events-none"
                  )}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (selectedCameraShot) handleCameraShotSelect(selectedCameraShot);
                  }}
                >
                  Clear
                </Button>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3">
                {cameraShots.map((shot) => (
                  <div
                    key={shot.value}
                    className={cn(
                      "group relative flex flex-col items-center justify-center p-2 sm:p-4 rounded-xl cursor-pointer border-2 transition-all duration-300 hover:scale-105 backdrop-blur-sm",
                      selectedCameraShot === shot.value 
                        ? "border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-800/50 shadow-lg" 
                        : "border-border/40 hover:border-slate-300 dark:hover:border-slate-600 bg-background/50 hover:bg-background/80 shadow-sm"
                    )}
                    onClick={() => handleCameraShotSelect(shot.value)}
                  >
                    <div className="text-lg sm:text-2xl mb-1 sm:mb-2 group-hover:scale-110 transition-transform duration-200">{shot.icon}</div>
                    <div className="text-xs font-medium text-center leading-tight px-1 break-words hyphens-auto">{shot.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm sm:text-base font-semibold text-foreground flex items-center gap-2 flex-wrap">
                  <Palette className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
                  <span>Background Color</span>
                  <span className={cn(
                    "text-xs sm:text-sm font-normal bg-muted/50 px-2 py-1 rounded-md transition-opacity duration-200 min-w-[60px] text-center",
                    selectedBgColor 
                      ? "text-muted-foreground opacity-100" 
                      : "text-transparent opacity-0"
                  )}>
                    {selectedBgColor 
                      ? backgroundColors.find(bg => bg.value === selectedBgColor)?.label 
                      : "Placeholder"}
                  </span>
                </h4>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  type="button"
                  className={cn(
                    "h-8 px-3 text-xs transition-opacity duration-200 flex-shrink-0",
                    selectedBgColor 
                      ? "text-muted-foreground hover:text-foreground opacity-100 cursor-pointer" 
                      : "text-transparent opacity-0 cursor-default pointer-events-none"
                  )}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (selectedBgColor) handleBgColorSelect(selectedBgColor);
                  }}
                >
                  Clear
                </Button>
              </div>
              
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 sm:gap-3">
                {backgroundColors.map((bgColor) => {
                  const isMonochromeMode = selectedCameraShot === "monochrome";
                  const isDisabled = isMonochromeMode && bgColor.value !== "white" && bgColor.value !== "black";
                  
                  return (
                    <div
                      key={bgColor.value}
                      className={cn(
                        "group relative flex flex-col items-center justify-center rounded-xl border-2 transition-all duration-300 backdrop-blur-sm overflow-hidden",
                        isDisabled 
                          ? "opacity-30 cursor-not-allowed border-border/20" 
                          : cn(
                              "cursor-pointer hover:scale-105",
                              selectedBgColor === bgColor.value 
                                ? "border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-800/50 shadow-lg" 
                                : "border-border/40 hover:border-slate-300 dark:hover:border-slate-600 bg-background/50 hover:bg-background/80 shadow-sm"
                            )
                      )}
                      onClick={() => !isDisabled && handleBgColorSelect(bgColor.value)}
                    >
                      <div 
                        className={cn(
                          "w-8 h-8 sm:w-12 sm:h-12 rounded-full mt-2 sm:mt-4 mb-1 sm:mb-2 shadow-md transition-transform duration-200",
                          !isDisabled && "group-hover:scale-110"
                        )}
                        style={{
                          background: bgColor.color,
                          border: bgColor.value === "white" ? "2px solid #e5e7eb" : "none"
                        }}
                      />
                      
                      <div className="pb-2 sm:pb-3 text-center px-1">
                        <div className="text-xs font-medium break-words hyphens-auto">{bgColor.label}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm sm:text-base font-semibold text-foreground flex items-center gap-2 flex-wrap">
                  <Smile className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
                  <span>Facial Expressions</span>
                  <span className={cn(
                    "text-xs sm:text-sm font-normal bg-muted/50 px-2 py-1 rounded-md transition-opacity duration-200 min-w-[60px] text-center",
                    selectedExpression 
                      ? "text-muted-foreground opacity-100" 
                      : "text-transparent opacity-0"
                  )}>
                    {selectedExpression 
                      ? facialExpressions.find(expr => expr.value === selectedExpression)?.label 
                      : "Placeholder"}
                  </span>
                </h4>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  type="button"
                  className={cn(
                    "h-8 px-3 text-xs transition-opacity duration-200 flex-shrink-0",
                    selectedExpression 
                      ? "text-muted-foreground hover:text-foreground opacity-100 cursor-pointer" 
                      : "text-transparent opacity-0 cursor-default pointer-events-none"
                  )}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (selectedExpression) handleExpressionSelect(selectedExpression);
                  }}
                >
                  Clear
                </Button>
              </div>
              
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-8 gap-2 sm:gap-3">
                {facialExpressions.map((expression) => (
                  <div
                    key={expression.value}
                    className={cn(
                      "group relative flex flex-col items-center justify-center p-2 sm:p-3 rounded-xl cursor-pointer border-2 transition-all duration-300 hover:scale-105 backdrop-blur-sm",
                      selectedExpression === expression.value 
                        ? "border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-800/50 shadow-lg" 
                        : "border-border/40 hover:border-slate-300 dark:hover:border-slate-600 bg-background/50 hover:bg-background/80 shadow-sm"
                    )}
                    onClick={() => handleExpressionSelect(expression.value)}
                  >
                    <div className="text-lg sm:text-2xl mb-1 sm:mb-2 group-hover:scale-110 transition-transform duration-200">{expression.emoji}</div>
                    <div className="text-xs font-medium text-center leading-tight px-1 break-words hyphens-auto">{expression.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm sm:text-base font-semibold text-foreground flex items-center gap-2 flex-wrap">
                  <Crown className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
                  <span>Accessories</span>
                  <span className={cn(
                    "text-xs sm:text-sm font-normal bg-muted/50 px-2 py-1 rounded-md transition-opacity duration-200 min-w-[60px] text-center",
                    selectedAccessory.length > 0 
                      ? "text-muted-foreground opacity-100" 
                      : "text-transparent opacity-0"
                  )}>
                    {selectedAccessory.length > 0 
                      ? `${selectedAccessory.length} selected` 
                      : "Placeholder"}
                  </span>
                </h4>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  type="button"
                  className={cn(
                    "h-8 px-3 text-xs transition-opacity duration-200 flex-shrink-0",
                    selectedAccessory.length > 0 
                      ? "text-muted-foreground hover:text-foreground opacity-100 cursor-pointer" 
                      : "text-transparent opacity-0 cursor-default pointer-events-none"
                  )}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (selectedAccessory.length > 0) {
                      const accessoriesToClear = [...selectedAccessory];
                      accessoriesToClear.forEach(accValue => handleAccessorySelect(accValue));
                    }
                  }}
                >
                  Clear All
                </Button>
              </div>
              
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 sm:gap-3">
                {accessories.map((accessory) => (
                  <div
                    key={accessory.value}
                    className={cn(
                      "group relative flex flex-col items-center justify-center p-2 sm:p-3 rounded-xl cursor-pointer border-2 transition-all duration-300 hover:scale-105 backdrop-blur-sm",
                      selectedAccessory.includes(accessory.value) 
                        ? "border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-800/50 shadow-lg" 
                        : "border-border/40 hover:border-slate-300 dark:hover:border-slate-600 bg-background/50 hover:bg-background/80 shadow-sm"
                    )}
                    onClick={() => handleAccessorySelect(accessory.value)}
                  >
                    <div className="text-lg sm:text-2xl mb-1 sm:mb-2 group-hover:scale-110 transition-transform duration-200">{accessory.emoji}</div>
                    <div className="text-xs font-medium text-center leading-tight px-1 break-words hyphens-auto">{accessory.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm sm:text-base font-semibold text-foreground flex items-center gap-2 flex-wrap">
                  <Lightbulb className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
                  <span>Lighting</span>
                  <span className={cn(
                    "text-xs sm:text-sm font-normal bg-muted/50 px-2 py-1 rounded-md transition-opacity duration-200 min-w-[60px] text-center",
                    selectedLight 
                      ? "text-muted-foreground opacity-100" 
                      : "text-transparent opacity-0"
                  )}>
                    {selectedLight 
                      ? lightSettings.find(l => l.value === selectedLight)?.label 
                      : "Placeholder"}
                  </span>
                </h4>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  type="button"
                  className={cn(
                    "h-8 px-3 text-xs transition-opacity duration-200 flex-shrink-0",
                    selectedLight 
                      ? "text-muted-foreground hover:text-foreground opacity-100 cursor-pointer" 
                      : "text-transparent opacity-0 cursor-default pointer-events-none"
                  )}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (selectedLight) handleLightSelect(selectedLight);
                  }}
                >
                  Clear
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3">
                {lightSettings.map((light) => (
                  <div
                    key={light.value}
                    className={cn(
                      "group relative flex flex-col items-center justify-center p-2 sm:p-4 rounded-xl cursor-pointer border-2 transition-all duration-300 hover:scale-105 backdrop-blur-sm",
                      selectedLight === light.value 
                        ? "border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-800/50 shadow-lg" 
                        : "border-border/40 hover:border-slate-300 dark:hover:border-slate-600 bg-background/50 hover:bg-background/80 shadow-sm"
                    )}
                    onClick={() => handleLightSelect(light.value)}
                  >
                    <div className="text-lg sm:text-2xl mb-1 sm:mb-2 group-hover:scale-110 transition-transform duration-200">{light.icon}</div>
                    <div className="text-xs font-medium text-center leading-tight px-1 break-words hyphens-auto">{light.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Collapsible>
    );
  }
);

AdvancedSettings.displayName = "AdvancedSettings"; 