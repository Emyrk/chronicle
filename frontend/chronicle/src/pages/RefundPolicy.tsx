export function RefundPolicy() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-2 text-3xl font-bold">Refund &amp; Cancellation Policy</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Last updated: October 25, 2026
      </p>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">Payments are non-refundable</h2>
        <p className="text-muted-foreground">
          Except where required by applicable law, all payments to Chronicle are
          final and non-refundable. We do not provide refunds or cash reimbursements
          for subscription payments, partially used billing periods, unused
          supporter benefits, or account inactivity.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">Changing subscription tiers</h2>
        <p className="mb-2 text-muted-foreground">
          You may change your Chronicle supporter tier through the billing portal.
          When a tier change produces a credit for the unused portion of your
          current subscription, that credit is calculated on a prorated basis and
          applied to your next subscription charge.
        </p>
        <p className="text-muted-foreground">
          Prorated credits remain account credits and are not paid out as cash
          refunds.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">Canceling a subscription</h2>
        <p className="text-muted-foreground">
          You may cancel through the billing portal at any time. Your supporter
          benefits remain active through the end of the billing period you already
          paid for, and your subscription will not renew. Canceling does not create
          a refund for the current billing period.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Billing questions</h2>
        <p className="text-muted-foreground">
          If you believe a charge was made in error or have a billing question,
          contact{" "}
          <a
            className="text-primary underline underline-offset-4 hover:text-primary/80"
            href="mailto:support@chronicleclassic.com"
          >
            support@chronicleclassic.com
          </a>
          .
        </p>
      </section>
    </div>
  )
}
