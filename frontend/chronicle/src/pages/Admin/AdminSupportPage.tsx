import { useState } from "react";
import { HeartHandshake, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useAdminSupport,
  useCreateSupportService,
  useDeleteSupportService,
  useUpdateSupportService,
  useUpdateSupportSettings,
} from "@/api/supportQueries";
import type { CreateSupportServiceRequest, SupportAdminResponse, SupportProvider, SupportService } from "@/api/typesGenerated";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card/Card";

const PROVIDERS: Array<{ value: SupportProvider; label: string }> = [
  { value: "manual", label: "Manual" },
  { value: "patreon", label: "Patreon" },
  { value: "github_sponsors", label: "GitHub Sponsors" },
  { value: "buy_me_a_coffee", label: "Buy Me a Coffee" },
];

const emptyService: CreateSupportServiceRequest = {
  provider: "manual",
  display_name: "",
  public_url: "",
  enabled: true,
  received_cents: 0,
  recurring_cents: 0,
};

function dollarsToCents(value: string): number {
  return Math.max(0, Math.round((Number.parseFloat(value) || 0) * 100));
}

function centsToDollars(value: number): string {
  return (value / 100).toFixed(2);
}

function ServiceEditor({ service }: { service?: SupportService }) {
  const createService = useCreateSupportService();
  const updateService = useUpdateSupportService();
  const deleteService = useDeleteSupportService();
  const [form, setForm] = useState<CreateSupportServiceRequest>(() => service ? {
    provider: service.provider,
    display_name: service.display_name,
    public_url: service.public_url ?? "",
    enabled: service.enabled,
    received_cents: service.received_cents,
    recurring_cents: service.recurring_cents,
  } : emptyService);

  const pending = createService.isPending || updateService.isPending || deleteService.isPending;
  const save = async () => {
    try {
      if (service) await updateService.mutateAsync({ id: service.id, request: form });
      else {
        await createService.mutateAsync(form);
        setForm(emptyService);
      }
      toast.success(service ? "Support service updated" : "Support service added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save support service");
    }
  };

  return (
    <Card className="space-y-4 p-5">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Provider</span>
          <select className="w-full rounded-md border bg-background px-3 py-2" value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value as SupportProvider })}>
            {PROVIDERS.map((provider) => <option key={provider.value} value={provider.value}>{provider.label}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Display name</span>
          <input className="w-full rounded-md border bg-background px-3 py-2" value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} placeholder="Patreon" />
        </label>
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="font-medium">Public contribution URL</span>
          <input className="w-full rounded-md border bg-background px-3 py-2" value={form.public_url ?? ""} onChange={(event) => setForm({ ...form, public_url: event.target.value })} placeholder="https://..." />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Received in {new Date().toLocaleString(undefined, { month: "long" })}</span>
          <div className="flex rounded-md border bg-background focus-within:ring-1 focus-within:ring-ring"><span className="px-3 py-2 text-muted-foreground">$</span><input className="min-w-0 flex-1 bg-transparent px-1 py-2 outline-none" inputMode="decimal" onFocus={(event) => event.currentTarget.select()} value={centsToDollars(form.received_cents)} onChange={(event) => setForm({ ...form, received_cents: dollarsToCents(event.target.value) })} /></div>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Current monthly recurring</span>
          <div className="flex rounded-md border bg-background focus-within:ring-1 focus-within:ring-ring"><span className="px-3 py-2 text-muted-foreground">$</span><input className="min-w-0 flex-1 bg-transparent px-1 py-2 outline-none" inputMode="decimal" onFocus={(event) => event.currentTarget.select()} value={centsToDollars(form.recurring_cents)} onChange={(event) => setForm({ ...form, recurring_cents: dollarsToCents(event.target.value) })} /></div>
        </label>
      </div>
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /> Include in public totals</label>
        <div className="flex gap-2">
          {service && <Button variant="destructive" size="sm" disabled={pending} onClick={async () => { if (!window.confirm(`Delete ${service.display_name}?`)) return; await deleteService.mutateAsync(service.id); toast.success("Support service deleted"); }}><Trash2 className="mr-1 h-4 w-4" />Delete</Button>}
          <Button size="sm" disabled={pending || !form.display_name.trim()} onClick={save}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : service ? <Save className="mr-1 h-4 w-4" /> : <Plus className="mr-1 h-4 w-4" />}{service ? "Save" : "Add service"}</Button>
        </div>
      </div>
    </Card>
  );
}

export function AdminSupportPage() {
  const { data, isLoading, error } = useAdminSupport();

  if (isLoading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading support settings...</div>;
  if (error || !data) return <Card className="p-6 text-destructive">{error instanceof Error ? error.message : "Support tracking is not enabled on this deployment."}</Card>;

  return <AdminSupportContent key={data.settings.updated_at} data={data} />;
}

function AdminSupportContent({ data }: { data: SupportAdminResponse }) {
  const updateSettings = useUpdateSupportSettings();
  const [publicEnabled, setPublicEnabled] = useState(data.settings.public_enabled);
  const [currency, setCurrency] = useState(data.settings.currency);
  const [goal, setGoal] = useState(centsToDollars(data.settings.monthly_goal_cents));
  const recurring = data.services.filter((service) => service.enabled).reduce((sum, service) => sum + service.recurring_cents, 0);
  const received = data.services.filter((service) => service.enabled).reduce((sum, service) => sum + service.received_cents, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div><h1 className="flex items-center gap-2 text-2xl font-bold"><HeartHandshake className="h-6 w-6 text-rose-500" />Support transparency</h1><p className="mt-1 text-sm text-muted-foreground">Manage the monthly goal and the totals shown on chronicleclassic.com/support.</p></div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Monthly goal</p><p className="mt-1 text-2xl font-bold">{currency} {goal}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Recurring support</p><p className="mt-1 text-2xl font-bold">{currency} {centsToDollars(recurring)}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Received this month</p><p className="mt-1 text-2xl font-bold">{currency} {centsToDollars(received)}</p></Card>
      </div>
      <Card className="space-y-4 p-6">
        <h2 className="text-lg font-semibold">Public summary</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm"><span className="font-medium">Monthly operating goal</span><div className="flex rounded-md border bg-background"><span className="px-3 py-2 text-muted-foreground">$</span><input className="min-w-0 flex-1 bg-transparent px-1 py-2 outline-none" inputMode="decimal" value={goal} onChange={(event) => setGoal(event.target.value)} /></div></label>
          <label className="space-y-1 text-sm"><span className="font-medium">Currency</span><input className="w-full rounded-md border bg-background px-3 py-2 uppercase" maxLength={3} value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} /></label>
        </div>
        <div className="flex items-center justify-between"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={publicEnabled} onChange={(event) => setPublicEnabled(event.target.checked)} /> Make summary public</label><Button disabled={updateSettings.isPending} onClick={async () => { try { await updateSettings.mutateAsync({ public_enabled: publicEnabled, currency, monthly_goal_cents: dollarsToCents(goal) }); toast.success("Support settings updated"); } catch (saveError) { toast.error(saveError instanceof Error ? saveError.message : "Unable to update settings"); } }}>{updateSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}Save settings</Button></div>
      </Card>
      <div className="space-y-3"><div><h2 className="text-lg font-semibold">Support services</h2><p className="text-sm text-muted-foreground">Enter gross amounts reported by each service. Provider API synchronization can replace these manual totals later.</p></div>{data.services.map((service) => <ServiceEditor key={service.id} service={service} />)}<ServiceEditor /></div>
    </div>
  );
}
