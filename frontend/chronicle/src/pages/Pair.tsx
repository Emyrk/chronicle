import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import type { DevicePairInfo } from "@/api/typesGenerated";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

async function resolve(code: string, action: "approve" | "deny") {
  const res = await fetch(`/api/v1/devices/pair/${encodeURIComponent(code)}/${action}`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: "Request failed." }));
    throw new Error(body.message || "Request failed.");
  }
}

export function PairPage() {
  const location = useLocation();
  const [params] = useSearchParams();
  const code = params.get("code") ?? "";
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [outcome, setOutcome] = useState<"approved" | "denied" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const info = useQuery({
    queryKey: ["device-pair", code],
    enabled: isAuthenticated && code !== "",
    retry: false,
    queryFn: async () => {
      const res = await fetch(`/api/v1/devices/pair/${encodeURIComponent(code)}`);
      if (!res.ok) throw new Error("This pairing code is invalid or has expired.");
      return (await res.json()) as DevicePairInfo;
    },
  });

  if (authLoading) return <p className="p-6 text-sm text-muted-foreground">Checking your session...</p>;
  if (!isAuthenticated) {
    return <Navigate to={`/login?from=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }

  const act = async (action: "approve" | "deny") => {
    setBusy(true);
    setError(null);
    try {
      await resolve(code, action);
      setOutcome(action === "approve" ? "approved" : "denied");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-xl font-semibold">Pair a device</h1>
      {code === "" && <p className="text-sm text-muted-foreground">No pairing code provided.</p>}
      {code !== "" && info.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {code !== "" && info.isError && <p className="text-sm text-destructive">{(info.error as Error).message}</p>}
      {outcome === "approved" && <p className="text-sm">Device approved. You can return to the uploader.</p>}
      {outcome === "denied" && <p className="text-sm">Device denied.</p>}
      {info.data && outcome === null && (
        <div className="space-y-4">
          <p className="text-sm">
            Allow <strong>{info.data.device_name}</strong> to upload combat logs to your account?
          </p>
          <p className="text-sm text-muted-foreground">
            Code: <span className="font-mono">{info.data.code}</span>. Only approve if you started this on your own
            computer.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => act("approve")}>
              Approve
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => act("deny")}>
              Deny
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
