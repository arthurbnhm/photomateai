"use client"

import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-white group-[.toaster]:text-gray-800 group-[.toaster]:border-gray-200 group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-gray-600",
          actionButton:
            "group-[.toast]:bg-indigo-500 group-[.toast]:hover:bg-indigo-600 group-[.toast]:text-white font-medium",
          cancelButton:
            "group-[.toast]:bg-gray-200 group-[.toast]:text-gray-700 group-[.toast]:hover:bg-gray-300 font-medium",
          success: "group-[.toast]:bg-green-50 group-[.toast]:text-green-600 group-[.toast]:border-green-200",
          error: "group-[.toast]:bg-red-50 group-[.toast]:text-red-600 group-[.toast]:border-red-200",
          info: "group-[.toast]:bg-blue-50 group-[.toast]:text-blue-600 group-[.toast]:border-blue-200",
          warning: "group-[.toast]:bg-amber-50 group-[.toast]:text-amber-600 group-[.toast]:border-amber-200",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
