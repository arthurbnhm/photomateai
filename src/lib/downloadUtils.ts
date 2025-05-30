import { toast } from "sonner"

export interface DownloadImageOptions {
  blob: Blob
  filename: string
  title?: string
  text?: string
  showToasts?: boolean
}

/**
 * Downloads an image with mobile-native support for iOS and Android
 * 
 * This function provides a comprehensive solution for downloading images across different platforms:
 * 
 * **Mobile Platforms:**
 * - **iOS**: Uses Web Share API first, then opens image in new tab with instructions for long-press save
 * - **Android**: Uses Web Share API first, then triggers direct download to Downloads folder
 * 
 * **Desktop:**
 * - Traditional download using anchor element
 * 
 * **Method Priority:**
 * 1. Web Share API (best for mobile photo gallery saving)
 * 2. Platform-specific fallbacks (iOS: new tab, Android: direct download)
 * 3. Desktop: Traditional download
 * 
 * @param options - Configuration object for the download
 * @param options.blob - The image blob to download
 * @param options.filename - Base filename (will have .png extension added if missing)
 * @param options.title - Title for share dialog (default: 'PhotomateAI Image')
 * @param options.text - Description for share dialog (default: 'Check out this AI-generated image!')
 * @param options.showToasts - Whether to show success/error toasts (default: true)
 * 
 * @returns Promise<boolean> - True if download was initiated successfully, false otherwise
 * 
 * @example
 * ```typescript
 * // Basic usage
 * await downloadImageMobileNative({
 *   blob: imageBlob,
 *   filename: 'my-image'
 * })
 * 
 * // With custom options
 * await downloadImageMobileNative({
 *   blob: imageBlob,
 *   filename: 'edited-photo',
 *   title: 'My Edited Photo',
 *   text: 'Check out my edited photo!',
 *   showToasts: false
 * })
 * ```
 */
export async function downloadImageMobileNative({
  blob,
  filename,
  title = 'PhotomateAI Image',
  text = 'Check out this AI-generated image!',
  showToasts = true
}: DownloadImageOptions): Promise<boolean> {
  try {
    // Enhanced mobile detection
    const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    const isAndroid = /Android/i.test(navigator.userAgent)

    // Ensure filename has .png extension
    const finalFilename = filename.endsWith('.png') ? filename : `${filename}.png`

    // Try native mobile sharing first (works best for saving to photo gallery)
    if (isMobileDevice && navigator.share && navigator.canShare) {
      try {
        // Create a proper image file with correct MIME type
        const imageFile = new File([blob], finalFilename, { 
          type: 'image/png',
          lastModified: Date.now()
        })
        
        const shareData = { 
          files: [imageFile],
          title,
          text
        }
        
        if (navigator.canShare(shareData)) {
          await navigator.share(shareData)
          if (showToasts) {
            toast.success('Image shared successfully! You can save it to your photo gallery from the share menu.')
          }
          return true
        }
      } catch (shareError) {
        console.log('Share API failed, trying alternative methods:', shareError)
        // Continue to fallback methods
      }
    }

    // iOS specific: Try to open image in new tab for long-press save
    if (isIOS) {
      try {
        const imageDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })
        
        // Open image in new window/tab for iOS long-press save
        const newWindow = window.open('', '_blank')
        if (newWindow) {
          newWindow.document.write(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>${title}</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                  body { 
                    margin: 0; 
                    padding: 20px; 
                    background: #000; 
                    display: flex; 
                    flex-direction: column; 
                    align-items: center; 
                    justify-content: center; 
                    min-height: 100vh; 
                    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                  }
                  img { 
                    max-width: 100%; 
                    max-height: 80vh; 
                    object-fit: contain; 
                    border-radius: 8px;
                    box-shadow: 0 4px 20px rgba(255,255,255,0.1);
                  }
                  .instructions {
                    color: white;
                    text-align: center;
                    margin-top: 20px;
                    padding: 15px;
                    background: rgba(255,255,255,0.1);
                    border-radius: 8px;
                    backdrop-filter: blur(10px);
                  }
                  .instructions h3 {
                    margin: 0 0 10px 0;
                    font-size: 18px;
                  }
                  .instructions p {
                    margin: 5px 0;
                    font-size: 14px;
                    opacity: 0.9;
                  }
                </style>
              </head>
              <body>
                <img src="${imageDataUrl}" alt="${title}" />
                <div class="instructions">
                  <h3>📱 Save to Photos</h3>
                  <p>Long press the image above</p>
                  <p>Then tap "Save to Photos"</p>
                </div>
              </body>
            </html>
          `)
          newWindow.document.close()
          if (showToasts) {
            toast.success('Image opened in new tab. Long press the image to save to Photos!')
          }
          return true
        }
      } catch (iosError) {
        console.log('iOS method failed:', iosError)
        // Continue to fallback
      }
    }

    // Android specific: Try to trigger download with proper filename
    if (isAndroid) {
      try {
        const downloadUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = downloadUrl
        link.download = finalFilename
        link.style.display = 'none'
        
        // Add to DOM, click, and remove
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        
        // Clean up
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000)
        
        if (showToasts) {
          toast.success('Image download started! Check your Downloads folder, then move to Gallery if needed.')
        }
        return true
      } catch (androidError) {
        console.log('Android download failed:', androidError)
        // Continue to fallback
      }
    }

    // Desktop fallback - traditional download
    const downloadUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = finalFilename
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(downloadUrl)

    if (showToasts) {
      toast.success('Image downloaded successfully!')
    }
    return true

  } catch (error) {
    console.error('Error downloading image:', error)
    if (showToasts) {
      toast.error('Failed to download image. Please try again.')
    }
    return false
  }
}

/**
 * Helper function to extract storage path from Supabase signed URL
 * 
 * Parses a Supabase signed URL and extracts the storage path that can be used
 * with the Supabase storage client's download method.
 * 
 * @param signedUrl - The Supabase signed URL (e.g., from storage.createSignedUrl())
 * @returns The storage path relative to the bucket
 * 
 * @throws Error if the URL format is invalid
 * 
 * @example
 * ```typescript
 * const url = 'https://project.supabase.co/storage/v1/object/sign/images/user123/image.png?token=...'
 * const path = extractStoragePathFromUrl(url) // Returns: 'user123/image.png'
 * 
 * // Use with Supabase storage client
 * const { data: blob } = await supabase.storage.from('images').download(path)
 * ```
 */
export function extractStoragePathFromUrl(signedUrl: string): string {
  const url = new URL(signedUrl)
  const pathSegments = url.pathname.split('/')
  const bucketIndex = pathSegments.findIndex(segment => segment === 'sign') + 2
  
  if (bucketIndex >= pathSegments.length) {
    throw new Error('Invalid storage URL format')
  }
  
  return pathSegments.slice(bucketIndex).join('/')
}

/**
 * Helper function to get filename from storage path
 * 
 * Extracts the filename from a storage path and optionally adds a prefix.
 * Removes any existing file extension to ensure consistent naming.
 * 
 * @param path - The storage path (e.g., 'user123/folder/image.png')
 * @param prefix - Optional prefix to add to the filename (default: 'photomate')
 * @returns The formatted filename without extension
 * 
 * @example
 * ```typescript
 * const path = 'user123/generated/image-123.png'
 * const filename = getFilenameFromPath(path) // Returns: 'photomate-image-123'
 * const customFilename = getFilenameFromPath(path, 'edited') // Returns: 'edited-image-123'
 * ```
 */
export function getFilenameFromPath(path: string, prefix = 'photomate'): string {
  const filename = path.split('/').pop() || 'image'
  const baseName = filename.split('.')[0] // Remove extension if present
  return `${prefix}-${baseName}`
} 