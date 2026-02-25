"use client";

import * as React from "react";
import * as ToastPrimitives from "@radix-ui/react-toast";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const ToastProvider = ToastPrimitives.Provider;

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed top-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-4 sm:top-auto sm:flex-col md:max-w-sm",
      "gap-2",
      className
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-start justify-between space-x-4 overflow-hidden rounded-lg border p-4 shadow-md transition-all",
  {
    variants: {
      variant: {
        default: "bg-white border-gray-200 text-gray-900",
        success: "bg-[#0C8C3F]/20 border-[#0C8C3F] text-[#0C8C3F]",
        destructive:
          "bg-[#FF4C4C]/20 border-[#FF4C4C] text-[#FF4C4C]",
        warning: "bg-yellow-100 border-yellow-400 text-yellow-900",
        info: "bg-blue-100 border-blue-400 text-blue-900",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => (
  <ToastPrimitives.Root
    ref={ref}
    className={cn(toastVariants({ variant }), className)}
    {...props}
  >
    <div className="flex flex-col space-y-1">
      {props.children}
    </div>
    <ToastPrimitives.Close className="absolute top-2 right-2 text-gray-400 hover:text-gray-700">
      <X className="w-4 h-4" />
    </ToastPrimitives.Close>
  </ToastPrimitives.Root>
));
Toast.displayName = ToastPrimitives.Root.displayName;

const ToastAction = ToastPrimitives.Action;
const ToastClose = ToastPrimitives.Close;

const ToastTitle = ToastPrimitives.Title;
const ToastDescription = ToastPrimitives.Description;

export {
  Toast,
  ToastProvider,
  ToastViewport,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};