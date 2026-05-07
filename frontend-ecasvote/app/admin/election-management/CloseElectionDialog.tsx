"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle } from "lucide-react";

/**
 * Two-step destructive confirmation (AlertDialog-style UX).
 * Radix AlertDialog is not in bundle deps — matches overlay pattern used by DeleteElectionDialog.
 */
type Props = {
  open: boolean;
  electionName: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirmClose: () => void | Promise<void>;
};

export function CloseElectionDialog({
  open,
  electionName,
  submitting,
  onCancel,
  onConfirmClose,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [typedName, setTypedName] = useState("");
  const nameConfirmRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setTypedName("");
    }
  }, [open]);

  useEffect(() => {
    if (!open || step !== 2 || submitting) return;
    const id = requestAnimationFrame(() => {
      nameConfirmRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open, step, submitting]);

  if (!open) return null;

  const nameMatches =
    typedName.trim().length > 0 && typedName.trim() === electionName.trim();

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 z-0 bg-black/60"
        aria-hidden
        onClick={() => !submitting && onCancel()}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="close-election-title"
        className="relative z-10 w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 text-gray-900 shadow-2xl"
      >
        <div className="flex gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700"
            aria-hidden
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h3
                id="close-election-title"
                className="text-lg font-semibold text-gray-900"
              >
                Close this election?
              </h3>
              {step === 1 ? (
                <p className="mt-2 text-sm text-gray-600">
                  Are you sure you want to close{" "}
                  <span className="font-medium text-gray-900">{electionName}</span>? This
                  action cannot be undone. No further votes will be accepted once the election
                  is closed.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  <p className="text-sm text-gray-600">
                    Type the election name exactly to confirm closure:
                  </p>
                  <label htmlFor="close-election-name-confirm" className="sr-only">
                    Election name confirmation
                  </label>
                  <Input
                    ref={nameConfirmRef}
                    id="close-election-name-confirm"
                    type="text"
                    autoComplete="off"
                    autoFocus
                    placeholder={electionName}
                    value={typedName}
                    disabled={submitting}
                    onChange={(e) => setTypedName(e.target.value)}
                    className="font-medium"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
          <Button type="button" variant="outline" disabled={submitting} onClick={onCancel}>
            Cancel
          </Button>
          {step === 1 ? (
            <Button
              type="button"
              variant="destructive"
              disabled={submitting}
              onClick={() => setStep(2)}
            >
              Yes, Close Election
            </Button>
          ) : (
            <Button
              type="button"
              variant="destructive"
              disabled={submitting || !nameMatches}
              onClick={() => void onConfirmClose()}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Closing…
                </span>
              ) : (
                "Confirm Close"
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
