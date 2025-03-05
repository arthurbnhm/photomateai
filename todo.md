# Trainings

- ✅ Delete button - Implemented with subtle styling and confirmation dialog
- ✅ Cancell button - Add ability to cancel ongoing trainings
- Once training done, it generate a first set of portrait
- ✅ Model listing - Added table to display models with status and actions
- ✅ Add progress indicator for ongoing trainings
- Fix the training progress (seems hardcoded) and merge with the list

# Create

- Animate image to videos
- Add more customization options for model training
- ✅ List available models for use
- ✅ Integrate webhooks with real-time image updates
- Generate multiple images at a time

# App

- Let the user choose colors
- Rework the navigation bar to something more native
- Remove things related to current debugging
- Work on the errors
- ✅ Improve UI for model management
- Add dashboard with training statistics
- Implement better error handling and user feedback

# Authentication

- Login / Sign up
- Integrate RLS in each table and bucket
- Add user profiles with preferences

# API

- ✅ Implement soft delete for models
- ✅ Optimize webhook handling for training updates
- ✅ Add support for partial image results during generation

## Webhook Integration

### Environment Variables
The application uses webhooks to receive updates from Replicate for both training and prediction tasks. Make sure the following environment variables are set in your `.env.local` file:

```
# Replicate API token
REPLICATE_API_TOKEN=your_replicate_api_token

# Webhook secret for validating incoming webhooks
REPLICATE_WEBHOOK_SECRET=your_webhook_secret

# Application URL (used for webhooks)
NEXT_PUBLIC_APP_URL=https://your-app-url.com
```

### How Webhooks Work
1. **Training Webhooks**: When a model training is initiated, Replicate sends webhook events to update the training status.
2. **Prediction Webhooks**: When an image generation is requested, Replicate sends webhook events to update the prediction status.

The webhook endpoint (`/api/webhook`) handles both types of webhooks and updates the corresponding records in the database.

### Real-time Image Updates
The application now shows images as soon as they become available from Replicate, without waiting for the entire generation to complete. This is implemented through:
1. Webhook events that capture partial outputs
2. Polling mechanism that checks for updates every 2 seconds when there are pending generations
3. UI updates that show images incrementally as they are generated

### Testing Webhooks Locally
To test webhooks locally, you need to expose your local server to the internet. You can use tools like ngrok:

```bash
ngrok http 3000
```

Then update the `NEXT_PUBLIC_APP_URL` in your `.env.local` file with the ngrok URL.