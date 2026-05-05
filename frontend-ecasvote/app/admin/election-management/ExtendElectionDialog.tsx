"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarClock } from "lucide-react";
import { format } from "date-fns";

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Dialog-style panel (non-destructive). No Radix Dialog in bundle — overlay matches DeleteElectionDialog. */
type Props = {
  open: boolean;
  currentEndIso: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (endTimeIso: string) => void | Promise<void>;
};

export function ExtendElectionDialog({
  open,
  currentEndIso,
  submitting,
  onCancel,
  onConfirm,
}: Props) {
  const [localValue, setLocalValue] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);

  const currentEnd = useMemo(() => new Date(currentEndIso), [currentEndIso]);

  useEffect(() => {
    if (!open || !currentEndIso) return;
    const d = new Date(currentEndIso);
    if (Number.isNaN(d.getTime())) return;
    setLocalValue(toDatetimeLocalValue(d));
    setClientError(null);
  }, [open, currentEndIso]);

  if (!open) return null;

  const parsedChoice = new Date(localValue);
  const now = new Date();

  const validate = (): string | null => {
    if (Number.isNaN(parsedChoice.getTime())) {
      return "Enter a valid date and time.";
    }
    if (parsedChoice.getTime() <= currentEnd.getTime()) {
      return "End time must be after the current end time";
    }
    if (parsedChoice.getTime() <= now.getTime()) {
      return "End time must be in the future";
    }
    return null;
  };

  const handleSubmit = () => {
    const err = validate();
    if (err) {
      setClientError(err);
      return;
    }
    setClientError(null);
    void onConfirm(parsedChoice.toISOString());
  };

  const currentEndLabel = Number.isNaN(currentEnd.getTime())
    ? currentEndIso
    : format(currentEnd, "MMM d, yyyy h:mm a");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 z-0 bg-black/50"
        aria-hidden
        onClick={() => !submitting && onCancel()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="extend-election-title"
        className="relative z-10 w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 text-gray-900 shadow-2xl"
      >
        <div className="flex gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#7A0019]/10 text-[#7A0019]"
            aria-hidden
          >
            <CalendarClock className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <h3 id="extend-election-title" className="text-lg font-semibold text-gray-900">
              Extend election
            </h3>
            <p className="text-sm text-gray-600">
              Current scheduled end:{" "}
              <span className="font-medium text-gray-900">{currentEndLabel}</span>
            </p>
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              Note: Extending the end date updates the display schedule only. The election remains
              open on the blockchain until manually closed.
            </p>
            <div className="space-y-1">
              <label htmlFor="extend-election-datetime" className="text-sm font-medium">
                New end date &amp; time
              </label>
              <Input
                id="extend-election-datetime"
                type="datetime-local"
                value={localValue}
                disabled={submitting}
                onChange={(e) => {
                  setLocalValue(e.target.value);
                  setClientError(null);
                }}
              />
              {clientError ? (
                <p className="text-xs font-medium text-red-600">{clientError}</p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
          <Button type="button" variant="outline" disabled={submitting} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-[#7A0019] text-white hover:bg-[#5c0013]"
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Saving…
              </span>
            ) : (
              "Save new end time"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
