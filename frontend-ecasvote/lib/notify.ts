import { toast } from "@/hooks/use-toast";

type NotifyOptions = {
  title: string;
  description?: string;
};

export const notify = {
  success({ title, description }: NotifyOptions) {
    toast({
      title,
      description,
    });
  },

  error({ title, description }: NotifyOptions) {
    toast({
      variant: "destructive",
      title,
      description,
    });
  },

  info({ title, description }: NotifyOptions) {
    toast({
      title,
      description,
    });
  },

  warning({ title, description }: NotifyOptions) {
    toast({
      title,
      description,
    });
  },
};