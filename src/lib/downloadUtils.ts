import { toast } from "sonner"

export interface DownloadImageOptions {
  blob: Blob
  filename: string
  showToasts?: boolean
}

/**
 * Downloads an image with the right approach for each platform:
 * - Desktop: Save as file download
 * - Mobile: Save to photo gallery
 */
export async function downloadImageMobileNative({
  blob,
  filename,
  showToasts = true
}: DownloadImageOptions): Promise<boolean> {
  try {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    const finalFilename = filename.endsWith('.png') ? filename : `${filename}.png`

    if (isMobile) {
      // Mobile: Try to save to photo gallery via Web Share API
      if (navigator.share && navigator.canShare) {
        try {
          const imageFile = new File([blob], finalFilename, { 
            type: 'image/png',
            lastModified: Date.now()
          })
          
          const shareData = { files: [imageFile] }
          
          if (navigator.canShare(shareData)) {
            await navigator.share(shareData)
            if (showToasts) {
              toast.success('Image ready to save! Choose "Save to Photos" from the share menu.')
            }
            return true
          }
        } catch (shareError) {
          console.log('Share API failed:', shareError)
        }
      }
      
      // Mobile fallback: Show error message
      if (showToasts) {
        toast.error('Unable to save to photo gallery. Please try using a different browser or update your device.')
      }
      return false
    } else {
      // Desktop: Traditional file download
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
    }

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