"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("w-fit rounded-md bg-white p-3", className)}
      classNames={{
        root: "w-fit",
        months: "relative flex flex-col gap-4 sm:flex-row",
        month: "flex w-full flex-col gap-4",
        month_caption: "relative flex h-9 items-center justify-center px-8",
        caption: "relative flex h-9 items-center justify-center px-8",
        caption_label: "text-sm font-medium",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between",
        button_previous: cn(
          buttonVariants({ variant: "ghost" }),
          "h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100"
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost" }),
          "h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100"
        ),
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex gap-1",
        weekday:
          "text-muted-foreground w-9 rounded-md text-center text-[0.8rem] font-normal",
        week: "mt-1 flex w-full gap-1",
        day: "relative h-9 w-9 p-0 text-center text-sm focus-within:relative focus-within:z-20",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100",
          "rounded-md",
          "data-[range-start=true]:rounded-md",
          "data-[range-end=true]:rounded-md"
        ),
        range_start:
          "day-range-start bg-emerald-700 text-white rounded-md [&_button]:bg-emerald-700 [&_button]:text-white [&_button]:hover:bg-emerald-800",
        range_end:
          "day-range-end bg-emerald-700 text-white rounded-md [&_button]:bg-emerald-700 [&_button]:text-white [&_button]:hover:bg-emerald-800",
        range_middle:
          "bg-emerald-100 text-emerald-900 rounded-md [&_button]:bg-emerald-100 [&_button]:text-emerald-900 [&_button]:hover:bg-emerald-200",
        selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
        today:
          "rounded-md bg-yellow-50 text-yellow-900 [&_button]:border [&_button]:border-yellow-500 [&_button]:font-semibold",
        outside: "text-muted-foreground opacity-50",
        disabled: "text-muted-foreground opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
