// Define the type for image generation history
export type ImageGeneration = {
  id: string;
  prompt: string;
  timestamp: string;
  images: string[];
  aspectRatio: string;
};

// In-memory storage for development purposes
// In a production app, this would be a database
let imageHistory: ImageGeneration[] = [];

// Function to add a new generation to history
export function addToHistory(generation: ImageGeneration) {
  console.log('Adding to server history:', generation);
  
  // Validate the generation object
  if (!generation.id || !generation.prompt || !generation.timestamp || !Array.isArray(generation.images)) {
    console.error('Invalid generation object:', generation);
    return null;
  }
  
  // Add to the beginning of the array
  imageHistory.unshift(generation);
  
  // Keep only the last 10 generations
  imageHistory = imageHistory.slice(0, 10);
  
  console.log('Current server history length:', imageHistory.length);
  
  return generation;
}

// Function to get the current history
export function getHistory() {
  return imageHistory;
}

// Function to delete an item from history
export function deleteFromHistory(id: string) {
  const index = imageHistory.findIndex(gen => gen.id === id);
  
  if (index === -1) {
    return false;
  }
  
  imageHistory.splice(index, 1);
  return true;
} 