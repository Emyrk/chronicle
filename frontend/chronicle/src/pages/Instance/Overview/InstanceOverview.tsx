import { BarChart3 } from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import type { Instance } from "../InstancePage";

export function InstanceOverview({ instance }: { instance: Instance }) {
  return (
    <section className="min-w-0 flex-1" aria-labelledby="instance-overview-title">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 id="instance-overview-title" className="text-xl font-semibold">
            Overview
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Whole-raid reporting for {instance.name}, without encounter or entity selection.
          </p>
        </div>
      </div>

      <Card className="flex min-h-72 items-center justify-center border-dashed p-8 text-center">
        <div className="max-w-md">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full border bg-muted/40">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="font-semibold">Overview panels</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Population comparisons and the first whole-raid panels will be added here next.
          </p>
        </div>
      </Card>
    </section>
  );
}
