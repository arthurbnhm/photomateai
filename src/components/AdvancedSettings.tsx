"use client"

import { useState, forwardRef, useImperativeHandle } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { UseFormReturn } from "react-hook-form"

import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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

// Added Preset interface and data
interface Preset {
  value: string;
  label: string;
  description?: string;
  settings: {
    cameraShot?: string;
    bgColor?: string;
    expression?: string;
    accessories?: string[];
    gender?: string; // Allow presets to suggest gender
  };
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
    value: "extreme-closeup",
    label: "Extreme Close-up",
    icon: "🔍",
    promptText: "An extreme close-up shot"
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

// Added Preset data
const presets: Preset[] = [
  {
    value: "linkedin-profile",
    label: "LinkedIn Profile",
    description: "Professional headshot for LinkedIn.",
    settings: {
      cameraShot: "portrait",
      bgColor: "white",
      expression: "smile",
      accessories: [], // Start with no accessories
    }
  },
  {
    value: "team-headshot",
    label: "Team Headshot",
    description: "Consistent look for team photos.",
    settings: {
      cameraShot: "medium",
      bgColor: "gray",
      expression: "smile",
    }
  },
  {
    value: "casual-avatar",
    label: "Casual Avatar",
    description: "Relaxed style for social media.",
    settings: {
      cameraShot: "closeup",
      expression: "laugh",
      accessories: ["beanie"],
    }
  },
   {
    value: "formal-portrait",
    label: "Formal Portrait",
    description: "Classic formal portrait style.",
    settings: {
      cameraShot: "portrait",
      bgColor: "black",
      expression: "serious",
      accessories: ["suit"], // Suggests suit, user can add tie/bowtie
    }
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
    const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
    const [selectedLight, setSelectedLight] = useState<string | null>(null);

    const resetSelections = () => {
      setSelectedBgColor(null);
      setSelectedExpression(null);
      setSelectedAccessory([]);
      setSelectedCameraShot(null);
      setSelectedGender(null);
      setSelectedPreset(null);
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

    const handlePresetSelect = (presetValue: string) => {
      const isClearingPreset = presetValue === "__no_preset__";
      setSelectedPreset(isClearingPreset ? null : presetValue);

      const prevCameraShot = selectedCameraShot;
      const prevBgColor = selectedBgColor;
      const prevExpression = selectedExpression;
      const prevAccessories = [...selectedAccessory];
      const prevGender = selectedGender;

      if (prevCameraShot) handleCameraShotSelect(prevCameraShot);
      if (prevBgColor) handleBgColorSelect(prevBgColor);
      if (prevExpression) handleExpressionSelect(prevExpression);
      prevAccessories.forEach(accValue => {
        if (selectedAccessory.includes(accValue)) {
            handleAccessorySelect(accValue);
        }
      });
      if (prevGender) handleGenderSelect(prevGender);

      const preset = presets.find(p => p.value === presetValue);

      if (preset) {
        if (preset.settings.cameraShot) handleCameraShotSelect(preset.settings.cameraShot);
        if (preset.settings.bgColor) handleBgColorSelect(preset.settings.bgColor);
        if (preset.settings.expression) handleExpressionSelect(preset.settings.expression);
        if (preset.settings.accessories && preset.settings.accessories.length > 0) {
          preset.settings.accessories.forEach(acc => handleAccessorySelect(acc));
        }
        if (preset.settings.gender) handleGenderSelect(preset.settings.gender);
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

    return (
      <Collapsible
        open={isOpen}
        onOpenChange={onOpenChange}
        className="border-t border-border pt-4 mt-4"
      >
        <div className="flex items-center justify-between">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground">
              Advanced Settings
              {isOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>

          <div className="flex space-x-1">
            <div
              className={cn(
                "w-12 h-8 flex items-center justify-center rounded-md cursor-pointer border border-input transition-all duration-200 hover:bg-accent/10",
                selectedGender === "male" ? "ring-2 ring-inset ring-ring/50 bg-accent/20" : "opacity-90 hover:opacity-100"
              )}
              onClick={() => handleGenderSelect("male")}
              title="Male"
            >
              <div className="text-sm font-medium">Male</div>
            </div>
            <div
              className={cn(
                "w-16 h-8 flex items-center justify-center rounded-md cursor-pointer border border-input transition-all duration-200 hover:bg-accent/10",
                selectedGender === "female" ? "ring-2 ring-inset ring-ring/50 bg-accent/20" : "opacity-90 hover:opacity-100"
              )}
              onClick={() => handleGenderSelect("female")}
              title="Female"
            >
              <div className="text-sm font-medium">Female</div>
            </div>
          </div>
        </div>
        <div 
          className={cn(
            "overflow-hidden transition-all duration-300 ease-in-out",
            isOpen ? "max-h-[2000px] opacity-100 transform-none" : "max-h-0 opacity-0 transform translate-y-[-8px]"
          )}
        >
          <div className="pt-4">
            <div className="space-y-6">
              <div className="space-y-2">
                 <Label htmlFor="preset-select" className="text-sm font-medium">Style Preset</Label>
                 <Select value={selectedPreset ?? "__no_preset__"} onValueChange={handlePresetSelect}>
                   <SelectTrigger id="preset-select">
                     <SelectValue placeholder="Select a preset..." />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="__no_preset__">-- No Preset --</SelectItem>
                     {presets.map((preset) => (
                       <SelectItem key={preset.value} value={preset.value}>
                         {preset.label}
                         {preset.description && (
                            <span className="ml-2 text-xs text-muted-foreground">({preset.description})</span>
                         )}
                       </SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between h-6">
                  <h4 className="text-sm font-medium flex items-center">
                    Camera Shot
                    <span className="ml-2 text-xs text-muted-foreground min-w-[80px]">
                      {selectedCameraShot && (
                        <>({cameraShots.find(shot => shot.value === selectedCameraShot)?.label})</>
                      )}
                    </span>
                  </h4>
                  <div className="w-[60px] text-right">
                    {selectedCameraShot && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 px-2 text-xs"
                        onClick={() => handleCameraShotSelect(selectedCameraShot)}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                  {cameraShots.map((shot) => (
                    <div
                      key={shot.value}
                      className={cn(
                        "relative flex flex-col items-center justify-center px-2 py-3 rounded-md cursor-pointer border border-input transition-all duration-200 hover:bg-accent/10",
                        selectedCameraShot === shot.value 
                          ? "ring-2 ring-inset ring-ring/50 bg-accent/20" 
                          : "opacity-90 hover:opacity-100"
                      )}
                      onClick={() => handleCameraShotSelect(shot.value)}
                    >
                      <div className="text-2xl mb-1">{shot.icon}</div>
                      <div className="text-xs font-medium text-center">{shot.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between h-6">
                  <h4 className="text-sm font-medium flex items-center">
                    Background Color
                    <span className="ml-2 text-xs text-muted-foreground min-w-[80px]">
                      {selectedBgColor && (
                        <>({backgroundColors.find(bg => bg.value === selectedBgColor)?.label})</>
                      )}
                    </span>
                  </h4>
                  <div className="w-[60px] text-right">
                    {selectedBgColor && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 px-2 text-xs"
                        onClick={() => handleBgColorSelect(selectedBgColor)}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
                  {backgroundColors.map((bgColor) => (
                    <div
                      key={bgColor.value}
                      className={cn(
                        "relative flex flex-col items-center justify-center rounded-md cursor-pointer border border-input transition-all duration-200 hover:bg-accent/10 overflow-hidden",
                        selectedBgColor === bgColor.value 
                          ? "ring-2 ring-inset ring-ring/50 bg-accent/20" 
                          : "opacity-90 hover:opacity-100"
                      )}
                      onClick={() => handleBgColorSelect(bgColor.value)}
                    >
                      <div 
                        className="w-12 h-12 rounded-full mt-3 mb-1"
                        style={{
                          background: bgColor.color,
                          border: bgColor.value === "white" ? "1px solid #e5e7eb" : "none"
                        }}
                      />
                      
                      <div className="p-2 text-center">
                        <div className="text-xs font-medium">{bgColor.label}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between h-6">
                  <h4 className="text-sm font-medium flex items-center">
                    Facial Expressions
                    <span className="ml-2 text-xs text-muted-foreground min-w-[80px]">
                      {selectedExpression && (
                        <>({facialExpressions.find(expr => expr.value === selectedExpression)?.label})</>
                      )}
                    </span>
                  </h4>
                  <div className="w-[60px] text-right">
                    {selectedExpression && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 px-2 text-xs"
                        onClick={() => handleExpressionSelect(selectedExpression)}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                  {facialExpressions.map((expression) => (
                    <div
                      key={expression.value}
                      className={cn(
                        "relative flex flex-col items-center justify-center px-2 py-3 rounded-md cursor-pointer border border-input transition-all duration-200 hover:bg-accent/10",
                        selectedExpression === expression.value 
                          ? "ring-2 ring-inset ring-ring/50 bg-accent/20" 
                          : "opacity-90 hover:opacity-100"
                      )}
                      onClick={() => handleExpressionSelect(expression.value)}
                    >
                      <div className="text-2xl mb-1">{expression.emoji}</div>
                      <div className="text-xs font-medium text-center">{expression.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between h-6">
                  <h4 className="text-sm font-medium flex items-center">
                    Accessories
                    <span className="ml-2 text-xs text-muted-foreground min-w-[80px]">
                      {selectedAccessory.length > 0 && (
                        <>({selectedAccessory.length} selected)</>
                      )}
                    </span>
                  </h4>
                  <div className="w-[60px] text-right">
                    {selectedAccessory.length > 0 && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          const accessoriesToClear = [...selectedAccessory];
                          accessoriesToClear.forEach(accValue => handleAccessorySelect(accValue));
                        }}
                      >
                        Clear All
                      </Button>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
                  {accessories.map((accessory) => (
                    <div
                      key={accessory.value}
                      className={cn(
                        "relative flex flex-col items-center justify-center px-2 py-3 rounded-md cursor-pointer border border-input transition-all duration-200 hover:bg-accent/10",
                        selectedAccessory.includes(accessory.value) 
                          ? "ring-2 ring-inset ring-ring/50 bg-accent/20" 
                          : "opacity-90 hover:opacity-100"
                      )}
                      onClick={() => handleAccessorySelect(accessory.value)}
                    >
                      <div className="text-2xl mb-1">{accessory.emoji}</div>
                      <div className="text-xs font-medium text-center">{accessory.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between h-6">
                  <h4 className="text-sm font-medium flex items-center">
                    Lights
                    <span className="ml-2 text-xs text-muted-foreground min-w-[80px]">
                      {selectedLight && (
                        <>({lightSettings.find(l => l.value === selectedLight)?.label})</>
                      )}
                    </span>
                  </h4>
                  <div className="w-[60px] text-right">
                    {selectedLight && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 px-2 text-xs"
                        onClick={() => handleLightSelect(selectedLight)}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                  {lightSettings.map((light) => (
                    <div
                      key={light.value}
                      className={cn(
                        "relative flex flex-col items-center justify-center px-2 py-3 rounded-md cursor-pointer border border-input transition-all duration-200 hover:bg-accent/10",
                        selectedLight === light.value 
                          ? "ring-2 ring-inset ring-ring/50 bg-accent/20" 
                          : "opacity-90 hover:opacity-100"
                      )}
                      onClick={() => handleLightSelect(light.value)}
                    >
                      <div className="text-2xl mb-1">{light.icon}</div>
                      <div className="text-xs font-medium text-center">{light.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Collapsible>
    );
  }
);

AdvancedSettings.displayName = "AdvancedSettings"; 