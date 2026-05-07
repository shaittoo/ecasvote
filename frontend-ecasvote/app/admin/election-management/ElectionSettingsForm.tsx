"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, ChevronDown } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TimePicker } from "@/components/ui/time-picker";
import { cn } from "@/lib/utils";

type ElectionSettingsFormProps = {
  title: string;
  onTitleChange: (v: string) => void;
  academicYear: string;
  onAcademicYearChange: (v: string) => void;
  semester: string;
  onSemesterChange: (v: string) => void;
  durationRange: DateRange | undefined;
  onDurationRangeChange: (v: DateRange | undefined) => void;
  startTime: string;
  onStartTimeChange: (v: string) => void;
  endTime: string;
  onEndTimeChange: (v: string) => void;
  academicYearOptions: string[];
  disabled?: boolean;
  /** When true, labels unchanged but controls are plain text (non‑interactive). */
  readOnly?: boolean;
  showRequiredIndicators?: boolean;
};

export function ElectionSettingsForm({
  title,
  onTitleChange,
  academicYear,
  onAcademicYearChange,
  semester,
  onSemesterChange,
  durationRange,
  onDurationRangeChange,
  startTime,
  onStartTimeChange,
  endTime,
  onEndTimeChange,
  academicYearOptions,
  disabled = false,
  readOnly = false,
  showRequiredIndicators = false,
}: ElectionSettingsFormProps) {
  const [nowPhtLabel, setNowPhtLabel] = useState("");

  useEffect(() => {
    if (readOnly) return;
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    const updateLabel = () => setNowPhtLabel(formatter.format(new Date()));
    updateLabel();
    const timerId = window.setInterval(updateLabel, 30000);
    return () => window.clearInterval(timerId);
  }, [readOnly]);

  const requiredMark = showRequiredIndicators ? <span className="text-red-500">*</span> : null;
  const rangeLabel = !durationRange?.from
    ? "Select election date range"
    : !durationRange.to
      ? format(durationRange.from, "MMM dd, yyyy")
      : `${format(durationRange.from, "MMM dd, yyyy")} - ${format(durationRange.to, "MMM dd, yyyy")}`;

  const readOnlyValueClass =
    "min-h-10 rounded-md border border-gray-200 bg-muted/40 px-3 py-2 text-sm text-gray-900";

  if (readOnly) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Election Title {requiredMark}
          </label>
          <div className={readOnlyValueClass}>{title || "—"}</div>
        </div>

        <div className="space-y-3 rounded-md border border-gray-200 p-4 md:col-span-2">
          <label className="block text-base font-semibold tracking-tight text-gray-800">
            Duration Settings
          </label>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
            <div className="md:col-span-6">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Election Duration (Philippine Time) {requiredMark}
              </label>
              <div className={readOnlyValueClass}>{rangeLabel}</div>
            </div>
            <div className="md:col-span-3">
              <label className="mb-1 block text-sm font-medium text-gray-700">Start Time</label>
              <div className={readOnlyValueClass}>{startTime}</div>
            </div>
            <div className="md:col-span-3">
              <label className="mb-1 block text-sm font-medium text-gray-700">End Time</label>
              <div className={readOnlyValueClass}>{endTime}</div>
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-md border border-gray-200 p-4 md:col-span-2">
          <label className="block text-base font-semibold tracking-tight text-gray-800">
            Description
          </label>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Academic Year</label>
              <div className={readOnlyValueClass}>{academicYear}</div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Semester</label>
              <div className={readOnlyValueClass}>{semester}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Election Title {requiredMark}
        </label>
        <Input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="e.g. CAS SC Elections 2025-2026"
          disabled={disabled}
          className={disabled ? "cursor-not-allowed bg-gray-100 text-gray-500" : ""}
        />
      </div>

      <div className="space-y-3 rounded-md border border-gray-200 p-4 md:col-span-2">
        <label className="block text-base font-semibold tracking-tight text-gray-800">
          Duration Settings
        </label>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
          <div className="md:col-span-6">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Election Duration (Philippine Time) {requiredMark}
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !durationRange?.from && "text-muted-foreground",
                    disabled && "cursor-not-allowed bg-gray-100 text-gray-500"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {rangeLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start" side="bottom">
                <div>
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={durationRange?.from}
                    selected={durationRange}
                    onSelect={onDurationRangeChange}
                    numberOfMonths={2}
                  />
                  <div className="border-t px-3 py-2 text-xs text-muted-foreground">
                    Current PHT time:{" "}
                    <span className="font-medium text-foreground">{nowPhtLabel || "Loading..."}</span>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="md:col-span-3">
            <label className="mb-1 block text-sm font-medium text-gray-700">Start Time</label>
            <TimePicker
              value={startTime}
              onChange={onStartTimeChange}
              disabled={disabled}
              className={disabled ? "cursor-not-allowed bg-gray-100 text-gray-500" : ""}
            />
          </div>

          <div className="md:col-span-3">
            <label className="mb-1 block text-sm font-medium text-gray-700">End Time</label>
            <TimePicker
              value={endTime}
              onChange={onEndTimeChange}
              disabled={disabled}
              className={disabled ? "cursor-not-allowed bg-gray-100 text-gray-500" : ""}
            />
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-md border border-gray-200 p-4 md:col-span-2">
        <label className="block text-base font-semibold tracking-tight text-gray-800">
          Description
        </label>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Academic Year</label>
            <div className="relative">
              <select
                className={cn(
                  "w-full appearance-none rounded border px-2 py-2 pr-9 text-sm",
                  disabled
                    ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-500"
                    : "border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#7A0019]/40"
                )}
                value={academicYear}
                onChange={(e) => onAcademicYearChange(e.target.value)}
                disabled={disabled}
              >
                {academicYearOptions.map((yearOption) => (
                  <option key={yearOption} value={yearOption}>
                    {yearOption}
                  </option>
                ))}
              </select>
              <ChevronDown
                className={cn(
                  "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2",
                  disabled ? "text-gray-400" : "text-gray-500"
                )}
                aria-hidden
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Semester</label>
            <div className="relative">
              <select
                className={cn(
                  "w-full appearance-none rounded border px-2 py-2 pr-9 text-sm",
                  disabled
                    ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-500"
                    : "border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#7A0019]/40"
                )}
                value={semester}
                onChange={(e) => onSemesterChange(e.target.value)}
                disabled={disabled}
              >
                <option>First Semester</option>
                <option>Second Semester</option>
                <option>Midyear</option>
              </select>
              <ChevronDown
                className={cn(
                  "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2",
                  disabled ? "text-gray-400" : "text-gray-500"
                )}
                aria-hidden
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

