import { AnimatedTrainingImages } from "./AnimatedTrainingImages";

// No imports needed as the component is now static.

// Props interface removed as no props are needed.

export function TrainingInProgressOverlay() { // No props
  return (
    <div
      className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-md text-center space-y-6">
        <AnimatedTrainingImages />
        <h2 className="text-2xl font-semibold text-foreground">Training in Progress</h2>
        <p className="text-sm text-muted-foreground">
          Training should take between 2 to 3 minutes.
        </p>
      </div>
    </div>
  );
} 