import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface LoadingIndicatorProps {
  isLoading: boolean
  text?: string
  fullScreen?: boolean
  className?: string
  showAfterMs?: number
}

export function LoadingIndicator({
  isLoading,
  text = "Processing...",
  fullScreen = false,
  className = "",
  showAfterMs = 300,
}: LoadingIndicatorProps) {
  const [showLoader, setShowLoader] = useState(false)

  useEffect(() => {
    if (!isLoading) {
      setShowLoader(false)
      return
    }

    // Only show loader after delay to prevent flashes for quick operations
    const timer = setTimeout(() => {
      if (isLoading) {
        setShowLoader(true)
      }
    }, showAfterMs)

    return () => clearTimeout(timer)
  }, [isLoading, showAfterMs])

  if (!showLoader && !isLoading) return null

  const Container = fullScreen ? FullScreenLoader : InlineLoader

  return (
    <AnimatePresence>
      {showLoader && (
        <Container className={className} text={text} />
      )}
    </AnimatePresence>
  )
}

function FullScreenLoader({ className, text }: { className?: string, text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm",
        className
      )}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-card rounded-xl p-6 shadow-xl max-w-md w-full mx-4"
      >
        <div className="flex flex-col items-center gap-4">
          <svg className="w-12 h-12 animate-spin text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-center font-medium text-foreground">{text}</p>
        </div>
      </motion.div>
    </motion.div>
  )
}

function InlineLoader({ className, text }: { className?: string, text: string }) {
  return (
    <div
      className={cn(
        "rounded-lg p-4 flex items-center gap-3 bg-primary/10 border border-primary/20",
        className
      )}
    >
      <div className="shrink-0">
        <svg className="animate-spin h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
      <p className="text-primary-foreground">{text}</p>
    </div>
  )
} 