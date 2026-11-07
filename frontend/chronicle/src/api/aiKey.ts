import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AIKeySecretResponse, AIKeyUsage, CreateAIKeyRequest, Response } from "@/api/typesGenerated";
import { saveStoredAIKey } from "@/features/aiKey/aiKeyStore";

export const AI_KEY_QUERY_KEY = ["ai-key", "me"] as const;

async function errorMessage(res: globalThis.Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as Partial<Response>;
    if (body.message) return [body.message, body.detail].filter(Boolean).join(" ");
  } catch {
    // Not JSON.
  }
  return fallback;
}

export async function fetchAIKeyUsage(): Promise<AIKeyUsage> {
  const res = await fetch("/api/v1/me/ai-key");
  if (!res.ok) throw new Error(await errorMessage(res, "Couldn't load your AI key."));
  return res.json() as Promise<AIKeyUsage>;
}

/**
 * issueAIKey is get-or-create (or rotate). Only a response that created a key
 * carries its secret, and it's saved in this browser right away: the server
 * keeps a hash and can't show it again.
 */
export async function issueAIKey(req: CreateAIKeyRequest, rotate: boolean): Promise<AIKeySecretResponse> {
  const res = await fetch(rotate ? "/api/v1/me/ai-key/rotate" : "/api/v1/me/ai-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Couldn't make an AI key."));
  const body = (await res.json()) as AIKeySecretResponse;
  if (body.secret) saveStoredAIKey({ id: body.key.id, secret: body.secret });
  return body;
}

export async function revokeAIKey(): Promise<string> {
  const res = await fetch("/api/v1/me/ai-key", { method: "DELETE" });
  if (!res.ok) throw new Error(await errorMessage(res, "Couldn't revoke your AI key."));
  saveStoredAIKey(null);
  return ((await res.json()) as Response).message;
}

export function useMyAIKey(enabled = true) {
  return useQuery({ queryKey: AI_KEY_QUERY_KEY, queryFn: fetchAIKeyUsage, enabled });
}

export function useIssueAIKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ req, rotate }: { req: CreateAIKeyRequest; rotate: boolean }) => issueAIKey(req, rotate),
    onSettled: () => queryClient.invalidateQueries({ queryKey: AI_KEY_QUERY_KEY }),
  });
}

export function useRevokeAIKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeAIKey,
    onSettled: () => queryClient.invalidateQueries({ queryKey: AI_KEY_QUERY_KEY }),
  });
}
