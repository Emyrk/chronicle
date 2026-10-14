import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { UploadDevice } from "@/api/typesGenerated";
import { Button } from "@/components/ui/button";

export function DeviceSettings() {
  const queryClient = useQueryClient();
  const devices = useQuery({
    queryKey: ["my-devices"],
    queryFn: async () => {
      const res = await fetch("/api/v1/me/devices");
      if (!res.ok) throw new Error("Failed to load devices");
      return (await res.json()) as UploadDevice[];
    },
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/v1/me/devices/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to revoke device");
    },
    onSuccess: () => {
      toast.success("Device revoked");
      queryClient.invalidateQueries({ queryKey: ["my-devices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Upload devices</h2>
        <p className="text-sm text-muted-foreground">
          Devices paired with your account can upload combat logs. Revoke a device to cut off its access.
        </p>
      </div>
      {devices.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {devices.isError && <p className="text-sm text-destructive">Failed to load devices.</p>}
      {devices.data?.length === 0 && <p className="text-sm text-muted-foreground">No paired devices.</p>}
      <ul className="space-y-2">
        {devices.data?.map((d) => (
          <li key={d.id} className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="font-medium">{d.name}</div>
              <div className="text-xs text-muted-foreground">
                Paired {new Date(d.created_at).toLocaleString()} · Last upload{" "}
                {d.last_used_at ? new Date(d.last_used_at).toLocaleString() : "never"}
              </div>
            </div>
            <Button variant="outline" size="sm" disabled={revoke.isPending} onClick={() => revoke.mutate(d.id)}>
              Revoke
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
