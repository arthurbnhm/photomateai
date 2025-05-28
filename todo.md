# Trainings

- ✅ Delete button - Implemented with subtle styling and confirmation dialog
- ✅ Cancell button - Add ability to cancel ongoing trainings
- 🟡 Once training done, it generate a first set of portrait
- ✅ Model listing - Added table to display models with status and actions
- ✅ Add progress indicator for ongoing trainings
- ✅ Fix the training progress (seems hardcoded) and merge with the list
- ✅ Implement supabase real-time subscription
- 🟡 Add a description? I'm looking to fix the genre issue (male/female)
- ❌ Add a use model that goes to create page and selects the model
- ✅ Fullscreen dropzone like vercel
- Delete training files
- Find out about using client to upload the zip file (replicate.files.create)
- Delete a model and its versions https://replicate.com/docs/reference/http#models.delete
- ✅ Validation modal after a training starts and until terminal state
- ✅ Add model version in the table
- ✅ Model bages do not update with pooling anymore

# Create

- 🟡 Animate image to videos
- 🟡 Add more customization options for model training
- ✅ List available models for use
- ✅ Integrate webhooks with real-time image updates
- ✅ Generate multiple images at a time
- ✅ Delete the images
- ✅ Don't delete the supabase row, just set is_deleted to true and filter
- ✅ Use model name from user and modelname-id for replicate
- ✅ cancel/route.ts should handle both training and image generation cancelation
- ✅ rework cancel / delete button for image generations
- ✅ Default to a model for image geneneration and other options
- ✅ Add back the webp format
- ✅ Download button with option to rename or download all of them
- 🟡 Buttons with predined options (blonde, linkedin profile)
- ✅ Use same badges as in trainings models lists
- ✅ Image focus
- ✅ Add the badges
- ✅ Change naming of download and storage (merger)
- ✅ The image should download the actual format selected
- ✅ Image should be same name as the one in supabase
- Add pagination
- ✅ Instead of calling for version latest, use the one returned by version column in models table

# App

- ✅ Let the user choose colors
- ✅ Rework the navigation bar to something more native
- ✅ Remove things related to current debugging
- ✅ Improve UI for model management
- Implement better error handling and user feedback
- ✅ Seperate train.tsx into components
- ✅ Have a single page for both training and creation
- 🟡 Use a generated profile pic as avatar
- ✅ Improve the navbar, do not display when scrolling
- 🟡 Vibe with music
- 🟡 A chat that interacts with my api, know the format to use etc
- ✅ Make sure we dont use supabase admin key anymore
- ✅ Add payment
- 🟡 Find ways to make good use of output and logs from webhooks
- ✅ Use predict_time for calculation instead of current method (done for predictions)
- ✅ Unify the navigation bar

# Authentication

- ✅ Login / Sign up
- ✅ Integrate RLS in each table and bucket
- ✅ Update all the routes with user filtering
- 🟡 Add user profiles with preferences
- ✅ Add webhook secrets
- ✅ Email / password


# Attention to:

- ✅ State Management You're using local storage for state management in some places (PENDING_GENERATIONS_KEY, CLIENT_HISTORY_KEY). For a more robust solution, consider using a state management library or React Context.

# Others

- ✅ Include costs
- Add media sharing
- ✅ Remove pooling, only keep realtime subscription or opposite
- ✅ Rework all the caching system, centralize it?
- ✅ Stripe portal
- Buy more coins
- Change plan / upgrade / downgrade
- ✅ Add feedback form
- ✅ Migrate all model versions

# Improvements

- ✅ Stalled and Generations as a same design 
- ✅ Beautiful landing page
- ✅ Review all the columns
- ✅ Merge Trainings and Models
- ✅ Better handle the webhooks status from predictions
- ✅ Better handle the webhooks status from trainings
- ✅ Many fetches happen at once
- ✅ Add vercel analytics
- ✅ Make all actions button with direct feedback and fallback behaviour

# Bugs

- ✅ Training files not found or already deleted: arthurbnhm/gfddfg-9636a012/images.zip POST /api/webhook 200 in 219ms. When a training is sent, it should not look at deleting files with the webhook. The process should not be handheld by the webhook
- ✅ Error: Error fetching subscription: {}
- ✅ Once generate button is clicked, if the browser is refreshed, the generation never starts
- ✅ Remove steeled generation causing infinite pooling
- ✅ Burger menu and close button are fucked
- ✅ Images are no more deleted from supabase when marked as this
- ✅ Many shit happen probably due to this: Remove the getUserId effect that calls this function
- ✅ Model is not stored in local storage

# Caching

- ✅ Images
- ✅ Coins
- ✅ Models
- ✅ Form values


# Advanced 

- ✅ Lightning (warm, cold, sunset, blue hour)
- ✅ Camera (closeup shot, portrait, bokeh, depth)
- ✅ Background (Solid color, INPUT (color palette), red, blue)
- ✅ Facial expressions (smile, sad, choked)


# Have a look

- ✅ It orders them with newest first and limits to 50 images (to keep things fast)

# References

- ✅ Use samples
- Once webhook on model training is ready, it sends a request to generate the image reference examples
- remove middleware complexity
- explore page
- no connection page
- language switcher