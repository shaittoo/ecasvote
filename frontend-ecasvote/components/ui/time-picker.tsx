"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Clock3, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type TimePickerProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  minuteStep?: number;
  className?: string;
};

function to12Hour(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "Select time";
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(hour12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${suffix}`;
}

function parseToParts(hhmm: string): { hour12: number; minute: number; meridiem: "AM" | "PM" } {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return { hour12: 8, minute: 0, meridiem: "AM" };
  }
  return {
    hour12: h % 12 === 0 ? 12 : h % 12,
    minute: m,
    meridiem: h >= 12 ? "PM" : "AM",
  };
}

function to24HourString(hour12: number, minute: number, meridiem: "AM" | "PM"): string {
  let hour24 = hour12 % 12;
  if (meridiem === "PM") hour24 += 12;
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function generateMinuteValues(step: number): number[] {
  const safeStep = Math.max(1, Math.min(30, step));
  const values: number[] = [];
  for (let minute = 0; minute < 60; minute += safeStep) {
    values.push(minute);
  }
  return values;
}

export function TimePicker({
  value,
  onChange,
  disabled = false,
  minuteStep = 1,
  className,
}: TimePickerProps) {
  const current = value && /^\d{2}:\d{2}$/.test(value) ? value : "";
  const initialParts = parseToParts(current || "08:00");
  const [hour12, setHour12] = useState<number>(initialParts.hour12);
  const [minute, setMinute] = useState<number>(initialParts.minute);
  const [meridiem, setMeridiem] = useState<"AM" | "PM">(initialParts.meridiem);
  const minuteValues = useMemo(() => generateMinuteValues(minuteStep), [minuteStep]);

  useEffect(() => {
    if (!current) return;
    const parsed = parseToParts(current);
    setHour12(parsed.hour12);
    setMinute(parsed.minute);
    setMeridiem(parsed.meridiem);
  }, [current]);

  useEffect(() => {
    onChange(to24HourString(hour12, minute, meridiem));
  }, [hour12, minute, meridiem, onChange]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !current && "text-muted-foreground",
            className
          )}
          aria-label="Select time"
        >
          <span className="inline-flex items-center gap-2">
            <Clock3 className="h-4 w-4" />
            {current ? to12Hour(current) : "Select time"}
          </span>
          <ChevronDown className="h-4 w-4 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2">
          <select
            value={hour12}
            onChange={(e) => setHour12(Number(e.target.value))}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            disabled={disabled}
            aria-label="Hour"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((hour) => (
              <option key={hour} value={hour}>
                {String(hour).padStart(2, "0")}
              </option>
            ))}
          </select>
          <span className="text-sm text-muted-foreground">:</span>
          <select
            value={minute}
            onChange={(e) => setMinute(Number(e.target.value))}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            disabled={disabled}
            aria-label="Minute"
          >
            {minuteValues.map((valueMinute) => (
              <option key={valueMinute} value={valueMinute}>
                {String(valueMinute).padStart(2, "0")}
              </option>
            ))}
            {!minuteValues.includes(minute) ? (
              <option value={minute}>{String(minute).padStart(2, "0")}</option>
            ) : null}
          </select>
          <span className="text-sm text-muted-foreground">:</span>
          <div className="grid grid-cols-2 gap-1 rounded-md border border-input bg-background p-1">
            <button
              type="button"
              onClick={() => setMeridiem("AM")}
              className={cn(
                "rounded px-2 py-1 text-xs font-medium",
                meridiem === "AM"
                  ? "bg-emerald-700 text-white"
                  : "text-foreground hover:bg-muted"
              )}
              disabled={disabled}
            >
              AM
            </button>
            <button
              type="button"
              onClick={() => setMeridiem("PM")}
              className={cn(
                "rounded px-2 py-1 text-xs font-medium",
                meridiem === "PM"
                  ? "bg-emerald-700 text-white"
                  : "text-foreground hover:bg-muted"
              )}
              disabled={disabled}
            >
              PM
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
