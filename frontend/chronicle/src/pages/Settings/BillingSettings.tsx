import { useCreateBillingCheckout, useCreateBillingPortal, useBillingSummary } from "@/api/queries"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export function BillingSettings() {
  const { data: billing, isLoading } = useBillingSummary()
  const checkout = useCreateBillingCheckout()
  const portal = useCreateBillingPortal()

  const openBilling = async (action: () => Promise<string>) => {
    try {
      window.location.assign(await action())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to open billing")
    }
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading billing status…</p>
  }

  if (!billing?.enabled) {
    return (
      <section className="max-w-2xl space-y-2">
        <h2 className="text-2xl font-semibold">Billing</h2>
        <p className="text-muted-foreground">Paid subscriptions are not available yet.</p>
      </section>
    )
  }

  return (
    <section className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-2xl font-semibold">Billing</h2>
        <p className="mt-1 text-muted-foreground">
          Support Chronicle and browse without advertisements.
        </p>
      </div>

      <div className="rounded-lg border p-5">
        <p className="text-sm font-medium">Current tier</p>
        <p className="mt-1 text-xl capitalize">{billing.tier}</p>
        {billing.current_period_end ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {billing.cancel_at_period_end ? "Access ends" : "Renews"}{" "}
            {new Date(billing.current_period_end).toLocaleDateString()}.
          </p>
        ) : null}
      </div>

      {billing.ads_free ? (
        <Button
          disabled={portal.isPending}
          onClick={() => void openBilling(() => portal.mutateAsync())}
        >
          Manage subscription
        </Button>
      ) : (
        <Button
          disabled={checkout.isPending}
          onClick={() => void openBilling(() => checkout.mutateAsync())}
        >
          Become a supporter
        </Button>
      )}
    </section>
  )
}
