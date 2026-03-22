"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle, Trash2 } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

export function DeleteElectionDialog({
  open,
  title,
  submitting,
  onCancel,
  onConfirm,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 z-0 bg-black/60"
        aria-hidden
        onClick={() => !submitting && onCancel()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-election-title"
        className="relative z-10 w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 text-gray-900 shadow-2xl"
      >
        <div className="flex gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700"
            aria-hidden
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3
              id="delete-election-title"
              className="text-lg font-semibold text-gray-900"
            >
              Delete this election?
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              This will permanently remove{" "}
              <span className="font-medium text-gray-900">{title}</span> from the
              database, including roster links, positions, candidates, and related
              votes for this election. This cannot be undone.
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
          <Button
            type="button"
            variant="outline"
            className="bg-white"
            disabled={submitting}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="gap-1.5"
            disabled={submitting}
            onClick={() => void onConfirm()}
          >
            <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
            {submitting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>
    </div>
  );
}
