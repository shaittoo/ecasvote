"use client";

import { toast } from "sonner";

type NotifyOptions = {
  title: string;
  description?: string;
  duration?: number;
};

const BLOCKCHAIN_ERROR_PATTERNS = [
  "UNAVAILABLE",
  "ECONNREFUSED",
  "14 ABORTED",
  "failed to connect",
  "connection refused",
  "service unavailable",
  "endorsement failure",
  "noEde]rsement",
];

const BLOCKCHAIN_USER_MESSAGE =
  "Blockchain network is currently unavailable. Please contact the system administrator.";

function sanitizeError(text: string | undefined): string | undefined {
  if (!text) return text;
  const upper = text.toUpperCase();
  if (BLOCKCHAIN_ERROR_PATTERNS.some((p) => upper.includes(p.toUpperCase()))) {
    console.error("Blockchain error (hidden from user):", text);
    return BLOCKCHAIN_USER_MESSAGE;
  }
  return text;
}

export const notify = {
  success({ title, description, duration }: NotifyOptions) {
    toast.success(title, {
      description,
      duration: duration ?? 5000,
    });
  },

  error({ title, description, duration }: NotifyOptions) {
    const cleanTitle = sanitizeError(title) ?? title;
    const cleanDesc = sanitizeError(description);
    toast.error(cleanTitle, {
      description: cleanDesc,
      duration: duration ?? 10000,
    });
  },

  info({ title, description, duration }: NotifyOptions) {
    toast.info(title, {
      description,
      duration: duration ?? 5000,
    });
  },

  warning({ title, description, duration }: NotifyOptions) {
    toast.warning(title, {
      description,
      duration: duration ?? 10000,
    });
  },
};