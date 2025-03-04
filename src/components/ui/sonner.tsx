"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-white group-[.toaster]:dark:bg-gray-800 group-[.toaster]:text-gray-800 group-[.toaster]:dark:text-gray-100 group-[.toaster]:border-gray-200 group-[.toaster]:dark:border-gray-700 group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-gray-600 group-[.toast]:dark:text-gray-400",
          actionButton:
            "group-[.toast]:bg-indigo-500 group-[.toast]:hover:bg-indigo-600 group-[.toast]:text-white font-medium",
          cancelButton:
            "group-[.toast]:bg-gray-200 group-[.toast]:dark:bg-gray-700 group-[.toast]:text-gray-700 group-[.toast]:dark:text-gray-300 group-[.toast]:hover:bg-gray-300 group-[.toast]:dark:hover:bg-gray-600 font-medium",
          success: "group-[.toast]:bg-green-50 group-[.toast]:dark:bg-green-900/20 group-[.toast]:text-green-600 group-[.toast]:dark:text-green-400 group-[.toast]:border-green-200 group-[.toast]:dark:border-green-800/30",
          error: "group-[.toast]:bg-red-50 group-[.toast]:dark:bg-red-900/20 group-[.toast]:text-red-600 group-[.toast]:dark:text-red-400 group-[.toast]:border-red-200 group-[.toast]:dark:border-red-800/30",
          info: "group-[.toast]:bg-blue-50 group-[.toast]:dark:bg-blue-900/20 group-[.toast]:text-blue-600 group-[.toast]:dark:text-blue-400 group-[.toast]:border-blue-200 group-[.toast]:dark:border-blue-800/30",
          warning: "group-[.toast]:bg-amber-50 group-[.toast]:dark:bg-amber-900/20 group-[.toast]:text-amber-600 group-[.toast]:dark:text-amber-400 group-[.toast]:border-amber-200 group-[.toast]:dark:border-amber-800/30",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
