# Trainings

- ✅ Delete button - Implemented with subtle styling and confirmation dialog
- ✅ Cancell button - Add ability to cancel ongoing trainings
- Once training done, it generate a first set of portrait
- ✅ Model listing - Added table to display models with status and actions
- ✅ Add progress indicator for ongoing trainings
- Fix the training progress (seems hardcoded) and merge with the list
- Implement supabase real-time subscription
# Create

- Animate image to videos
- Add more customization options for model training
- ✅ List available models for use
- ✅ Integrate webhooks with real-time image updates
- Generate multiple images at a time
- Delete the images
- Don't delete the supabase row, just set is_deleted to true and filter
- Use model name from user and modelname-id for replicate
- cancel/route.ts should handle both training and image generation cancelation
- rework cancel / delete button for image generations

# App

- Let the user choose colors
- Rework the navigation bar to something more native
- Remove things related to current debugging
- Work on the errors
- ✅ Improve UI for model management
- Add dashboard with training statistics
- Implement better error handling and user feedback
- Seperate train.tsx into components

# Authentication

- Login / Sign up
- Integrate RLS in each table and bucket
- Add user profiles with preferences