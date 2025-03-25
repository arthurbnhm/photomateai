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

// Update the interface to match the form structure
interface FormFields {
  prompt: string;
  aspectRatio: string;
  outputFormat: string;
  modelId: string;
}

interface AdvancedSettingsProps {
  form: UseFormReturn<FormFields>;
  onOpenChange?: (isOpen: boolean) => void;
  onGenderChange?: (gender: string | null) => void;
}

export type AdvancedSettingsRefType = {
  resetSelections: () => void;
  closePanel: () => void;
  isOpen: boolean;
  handleGenderSelect: (genderValue: string) => void;
};

export const AdvancedSettings = forwardRef<AdvancedSettingsRefType, AdvancedSettingsProps>(
  ({ form, onOpenChange, onGenderChange }, ref) => {
    // State variables
    const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
    const [selectedBgColor, setSelectedBgColor] = useState<string | null>(null);
    const [selectedExpression, setSelectedExpression] = useState<string | null>(null);
    const [selectedAccessory, setSelectedAccessory] = useState<string[]>([]);
    const [selectedCameraShot, setSelectedCameraShot] = useState<string | null>(null);
    const [selectedGender, setSelectedGender] = useState<string | null>(null);

    // Reset all selections
    const resetSelections = () => {
      setSelectedBgColor(null);
      setSelectedExpression(null);
      setSelectedAccessory([]);
      setSelectedCameraShot(null);
      setSelectedGender(null);
    };

    // Close the panel
    const closePanel = () => {
      setShowAdvancedSettings(false);
      if (onOpenChange) onOpenChange(false);
    };

    // Expose the methods to parent components
    useImperativeHandle(ref, () => ({
      resetSelections,
      closePanel,
      isOpen: showAdvancedSettings,
      handleGenderSelect
    }));

    // Function to handle background color selection
    const handleBgColorSelect = (bgColorValue: string) => {
      const currentBgColor = selectedBgColor;
      const currentPrompt = form.getValues().prompt;
      
      // If deselecting the current bg color
      if (currentBgColor === bgColorValue) {
        setSelectedBgColor(null);
        
        // Find and remove the bg color text from the prompt
        const bgColorToRemove = backgroundColors.find(bg => bg.value === currentBgColor);
        if (bgColorToRemove) {
          const updatedPrompt = currentPrompt.replace(bgColorToRemove.promptText, '').trim();
          form.setValue("prompt", updatedPrompt);
        }
        return;
      }
      
      // Remove previous bg color from prompt if there was one
      let updatedPrompt = currentPrompt;
      if (currentBgColor) {
        const previousBgColor = backgroundColors.find(bg => bg.value === currentBgColor);
        if (previousBgColor) {
          updatedPrompt = updatedPrompt.replace(previousBgColor.promptText, '').trim();
        }
      }
      
      // Add new bg color
      const newBgColor = backgroundColors.find(bg => bg.value === bgColorValue);
      if (newBgColor) {
        // Check if prompt already ends with a comma or space, and add bg color text
        if (updatedPrompt.endsWith(',') || updatedPrompt.endsWith(' ')) {
          updatedPrompt = `${updatedPrompt} ${newBgColor.promptText}`;
        } else if (updatedPrompt) {
          updatedPrompt = `${updatedPrompt}, ${newBgColor.promptText}`;
        } else {
          updatedPrompt = newBgColor.promptText;
        }
        
        form.setValue("prompt", updatedPrompt);
        setSelectedBgColor(bgColorValue);
      }
    };

    // Function to handle facial expression selection
    const handleExpressionSelect = (expressionValue: string) => {
      const currentExpression = selectedExpression;
      const currentPrompt = form.getValues().prompt;
      
      // If deselecting the current expression
      if (currentExpression === expressionValue) {
        setSelectedExpression(null);
        
        // Find and remove the expression text from the prompt
        const expressionToRemove = facialExpressions.find(expr => expr.value === currentExpression);
        if (expressionToRemove) {
          const updatedPrompt = currentPrompt.replace(expressionToRemove.promptText, '').trim();
          form.setValue("prompt", updatedPrompt);
        }
        return;
      }
      
      // Remove previous expression from prompt if there was one
      let updatedPrompt = currentPrompt;
      if (currentExpression) {
        const previousExpression = facialExpressions.find(expr => expr.value === currentExpression);
        if (previousExpression) {
          updatedPrompt = updatedPrompt.replace(previousExpression.promptText, '').trim();
        }
      }
      
      // Add new expression
      const newExpression = facialExpressions.find(expr => expr.value === expressionValue);
      if (newExpression) {
        // Check if prompt already ends with a comma or space, and add expression text
        if (updatedPrompt.endsWith(',') || updatedPrompt.endsWith(' ')) {
          updatedPrompt = `${updatedPrompt} ${newExpression.promptText}`;
        } else if (updatedPrompt) {
          updatedPrompt = `${updatedPrompt}, ${newExpression.promptText}`;
        } else {
          updatedPrompt = newExpression.promptText;
        }
        
        form.setValue("prompt", updatedPrompt);
        setSelectedExpression(expressionValue);
      }
    };

    // Function to handle accessory selection
    const handleAccessorySelect = (accessoryValue: string) => {
      const currentPrompt = form.getValues().prompt;
      
      // If already selected, remove it
      if (selectedAccessory.includes(accessoryValue)) {
        const updatedAccessories = selectedAccessory.filter(acc => acc !== accessoryValue);
        setSelectedAccessory(updatedAccessories);
        
        // Find and remove the accessory text from the prompt
        const accessoryToRemove = accessories.find(acc => acc.value === accessoryValue);
        if (accessoryToRemove) {
          const updatedPrompt = currentPrompt.replace(accessoryToRemove.promptText, '').trim();
          form.setValue("prompt", updatedPrompt);
        }
        return;
      }
      
      // Add the new accessory
      const newAccessories = [...selectedAccessory, accessoryValue];
      setSelectedAccessory(newAccessories);
      
      // Add the new accessory text to the prompt
      const newAccessory = accessories.find(acc => acc.value === accessoryValue);
      if (newAccessory) {
        // Check if prompt already ends with a comma or space, and add accessory text
        if (currentPrompt.endsWith(',') || currentPrompt.endsWith(' ')) {
          form.setValue("prompt", `${currentPrompt} ${newAccessory.promptText}`);
        } else if (currentPrompt) {
          form.setValue("prompt", `${currentPrompt}, ${newAccessory.promptText}`);
        } else {
          form.setValue("prompt", newAccessory.promptText);
        }
      }
    };

    // Function to handle camera shot selection
    const handleCameraShotSelect = (shotValue: string) => {
      const currentShot = selectedCameraShot;
      const currentPrompt = form.getValues().prompt;
      
      // If deselecting the current shot
      if (currentShot === shotValue) {
        setSelectedCameraShot(null);
        
        // Find and remove the shot text from the prompt
        const shotToRemove = cameraShots.find(shot => shot.value === currentShot);
        if (shotToRemove) {
          const updatedPrompt = currentPrompt.replace(shotToRemove.promptText, '').trim();
          // Remove any leading commas or spaces after removing the shot text
          form.setValue("prompt", updatedPrompt.replace(/^,\s*/, ''));
        }
        return;
      }
      
      // Remove previous shot from prompt if there was one
      let updatedPrompt = currentPrompt;
      if (currentShot) {
        const previousShot = cameraShots.find(shot => shot.value === currentShot);
        if (previousShot) {
          updatedPrompt = updatedPrompt.replace(previousShot.promptText, '').trim();
          // Clean up leading commas or spaces after removing the shot text
          updatedPrompt = updatedPrompt.replace(/^,\s*/, '');
        }
      }
      
      // Add new shot at the beginning
      const newShot = cameraShots.find(shot => shot.value === shotValue);
      if (newShot) {
        // If there's existing prompt text, add it after the shot text with a comma
        if (updatedPrompt) {
          updatedPrompt = `${newShot.promptText}, ${updatedPrompt}`;
        } else {
          updatedPrompt = newShot.promptText;
        }
        
        form.setValue("prompt", updatedPrompt);
        setSelectedCameraShot(shotValue);
      }
    };

    // Function to handle gender selection
    const handleGenderSelect = (genderValue: string) => {
      const currentGender = selectedGender;
      const currentPrompt = form.getValues().prompt;
      
      // If deselecting the current gender
      if (currentGender === genderValue) {
        setSelectedGender(null);
        
        // Notify parent component if callback exists
        if (onGenderChange) {
          onGenderChange(null);
        }
        
        // Find and remove the gender text from the prompt
        const genderToRemove = genders.find(g => g.value === currentGender);
        if (genderToRemove) {
          const updatedPrompt = currentPrompt.replace(genderToRemove.promptText, '').trim();
          // Clean up any trailing commas or spaces
          form.setValue("prompt", updatedPrompt.replace(/,\s*$/, ''));
        }
        return;
      }
      
      // Remove previous gender from prompt if there was one
      let updatedPrompt = currentPrompt;
      if (currentGender) {
        const previousGender = genders.find(g => g.value === currentGender);
        if (previousGender) {
          updatedPrompt = updatedPrompt.replace(previousGender.promptText, '').trim();
          // Clean up any trailing commas or spaces
          updatedPrompt = updatedPrompt.replace(/,\s*$/, '');
        }
      }
      
      // Add new gender at the end
      const newGender = genders.find(g => g.value === genderValue);
      if (newGender) {
        // If there's existing prompt text, add the gender text after it with a comma
        if (updatedPrompt) {
          updatedPrompt = `${updatedPrompt}, ${newGender.promptText}`;
        } else {
          updatedPrompt = newGender.promptText;
        }
        
        form.setValue("prompt", updatedPrompt);
        setSelectedGender(genderValue);
        
        // Notify parent component if callback exists
        if (onGenderChange) {
          onGenderChange(genderValue);
        }
      }
    };

    return (
      <Collapsible
        open={showAdvancedSettings}
        onOpenChange={(open) => {
          setShowAdvancedSettings(open);
          // Notify parent component
          if (onOpenChange) onOpenChange(open);
        }}
        className="border-t border-border pt-4 mt-4"
      >
        <div className="flex items-center justify-between">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground">
              Advanced Settings
              {showAdvancedSettings ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>

          {/* Gender Selection Icons - moved to the far right */}
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
            "overflow-hidden transition-opacity duration-300",
            showAdvancedSettings 
              ? "animate-accordion-down opacity-100" 
              : "animate-accordion-up opacity-0"
          )}
          style={{
            // Fix the transform transition to avoid conflict with height animation
            transform: showAdvancedSettings ? "translateY(0)" : "translateY(-4px)",
            transition: "transform 300ms cubic-bezier(0.4, 0, 0.2, 1), opacity 300ms cubic-bezier(0.4, 0, 0.2, 1)",
            // Add will-change for better performance on mobile
            willChange: "transform, opacity, height"
          }}
        >
          <div className="pt-4">
            <div className="space-y-6">
              {/* Camera Shots Section */}
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

              {/* Background Colors Section */}
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
                      {/* Color Circle */}
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

              {/* Facial Expressions Section */}
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

              {/* Accessories Section */}
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
                          // Remove all accessory texts from prompt
                          let updatedPrompt = form.getValues().prompt;
                          selectedAccessory.forEach(accValue => {
                            const acc = accessories.find(a => a.value === accValue);
                            if (acc) {
                              updatedPrompt = updatedPrompt.replace(acc.promptText, '').trim();
                            }
                          });
                          form.setValue("prompt", updatedPrompt);
                          setSelectedAccessory([]);
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
            </div>
          </div>
        </div>
      </Collapsible>
    );
  }
);

// Add display name
AdvancedSettings.displayName = "AdvancedSettings"; 