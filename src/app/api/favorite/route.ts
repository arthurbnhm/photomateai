import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { predictionId, imageUrl, isLiked } = await request.json()

    if (!predictionId || !imageUrl || typeof isLiked !== 'boolean') {
      return NextResponse.json(
        { error: "Missing required fields: predictionId, imageUrl, isLiked" },
        { status: 400 }
      )
    }

    const supabase = await createSupabaseServerClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // First, get the current prediction to verify ownership and get current liked_images
    const { data: prediction, error: fetchError } = await supabase
      .from('predictions')
      .select('liked_images, user_id, storage_urls')
      .eq('id', predictionId)
      .single()

    if (fetchError || !prediction) {
      return NextResponse.json(
        { error: "Prediction not found" },
        { status: 404 }
      )
    }

    // Verify user owns this prediction
    if (prediction.user_id !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized to modify this prediction" },
        { status: 403 }
      )
    }

    // Verify the image URL exists in storage_urls
    if (!prediction.storage_urls || !prediction.storage_urls.includes(imageUrl)) {
      return NextResponse.json(
        { error: "Image URL not found in this prediction" },
        { status: 400 }
      )
    }

    // Get current liked images array (or initialize as empty array)
    let likedImages = prediction.liked_images || []

    // Update the liked images array
    if (isLiked) {
      // Add to liked images if not already there
      if (!likedImages.includes(imageUrl)) {
        likedImages.push(imageUrl)
      }
    } else {
      // Remove from liked images
      likedImages = likedImages.filter((url: string) => url !== imageUrl)
    }

    // Update the prediction with new liked_images array
    const { error: updateError } = await supabase
      .from('predictions')
      .update({ liked_images: likedImages })
      .eq('id', predictionId)
      .eq('user_id', user.id)
      .select()

    if (updateError) {
      console.error('Error updating prediction:', updateError)
      return NextResponse.json(
        { error: "Failed to update favorite status" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      likedImages: likedImages
    })

  } catch (error) {
    console.error('Error in favorite endpoint:', error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
} 