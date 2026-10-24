import { toast } from "sonner";
import type { RequestError } from "@/api/queries";

/** Shows an API error toast, including the server's detail when present. */
export function showRequestErrorToast(fallbackMessage: string, error: unknown) {
  const requestError = error as RequestError;
  const message = requestError?.message || fallbackMessage;
  const detail = requestError?.detail;

  toast.error(message, {
    description: detail ? (
      <span className="mt-1 block font-mono text-xs whitespace-pre-wrap break-all">
        {detail}
      </span>
    ) : undefined,
  });
}
