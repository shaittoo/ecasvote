import { notify } from "@/lib/notify";

export function handleApiError(
  err: any,
  title = "Something went wrong"
) {
  console.error(title, err);

  notify.error({
    title,
    description: err?.message || "Unexpected error occurred",
  });
}