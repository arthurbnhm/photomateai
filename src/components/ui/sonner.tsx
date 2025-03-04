"use client"

import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:hover:bg-primary/90 group-[.toast]:text-primary-foreground font-medium",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:hover:bg-muted/90 font-medium",
          success: "group-[.toast]:bg-green-50 dark:group-[.toast]:bg-green-950/50 group-[.toast]:text-green-600 dark:group-[.toast]:text-green-400 group-[.toast]:border-green-200 dark:group-[.toast]:border-green-900",
          error: "group-[.toast]:bg-red-50 dark:group-[.toast]:bg-red-950/50 group-[.toast]:text-red-600 dark:group-[.toast]:text-red-400 group-[.toast]:border-red-200 dark:group-[.toast]:border-red-900",
          info: "group-[.toast]:bg-blue-50 dark:group-[.toast]:bg-blue-950/50 group-[.toast]:text-blue-600 dark:group-[.toast]:text-blue-400 group-[.toast]:border-blue-200 dark:group-[.toast]:border-blue-900",
          warning: "group-[.toast]:bg-amber-50 dark:group-[.toast]:bg-amber-950/50 group-[.toast]:text-amber-600 dark:group-[.toast]:text-amber-400 group-[.toast]:border-amber-200 dark:group-[.toast]:border-amber-900",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
