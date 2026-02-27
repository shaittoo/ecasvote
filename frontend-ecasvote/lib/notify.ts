"use client";

import { toast } from "sonner";

type NotifyOptions = {
  title: string;
  description?: string;
  duration?: number;
};

export const notify = {
  success({ title, description, duration }: NotifyOptions) {
    toast.success(title, {
      description,
      duration: duration ?? 2500,
    });
  },

  error({ title, description, duration }: NotifyOptions) {
    toast.error(title, {
      description,
      duration: duration ?? 4500,
    });
  },

  info({ title, description, duration }: NotifyOptions) {
    toast.info(title, {
      description,
      duration: duration ?? 2500,
    });
  },

  warning({ title, description, duration }: NotifyOptions) {
    toast.warning(title, {
      description,
      duration: duration ?? 3500,
    });
  },
};