import { CircleAlert, ExternalLink, Info, TriangleAlert } from "lucide-react";
import type { TelemetryNotice, TelemetryNoticeSeverity } from "@/api/typesGenerated";
import { cn } from "@/lib/utils";

const severityStyles: Record<
  TelemetryNoticeSeverity,
  { container: string; icon: string; link: string; Icon: typeof Info }
> = {
  info: {
    container: "border-sky-500/30 bg-sky-500/10",
    icon: "text-sky-500",
    link: "text-sky-700 hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200",
    Icon: Info,
  },
  warning: {
    container: "border-amber-500/35 bg-amber-500/10",
    icon: "text-amber-500",
    link: "text-amber-700 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200",
    Icon: TriangleAlert,
  },
  critical: {
    container: "border-red-500/35 bg-red-500/10",
    icon: "text-red-500",
    link: "text-red-700 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200",
    Icon: CircleAlert,
  },
};

function httpsActionURL(value?: string): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function NoticeBanner({
  notices,
  className,
}: {
  notices: readonly TelemetryNotice[];
  className?: string;
}) {
  if (notices.length === 0) return null;

  return (
    <section aria-label="Notices" className={cn("w-full", className)}>
      {notices.map((notice) => {
        const style = severityStyles[notice.severity];
        const actionURL = httpsActionURL(notice.action_url);
        const showAction = actionURL && notice.action_label;

        return (
          <div
            key={notice.id}
            data-severity={notice.severity}
            role={notice.severity === "critical" ? "alert" : "status"}
            className={cn("border-b px-4 py-3", style.container)}
          >
            <div className="mx-auto flex w-full max-w-7xl items-start gap-3">
              <style.Icon aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", style.icon)} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">{notice.title}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground/80">{notice.message}</p>
              </div>
              {showAction ? (
                <a
                  href={actionURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    style.link,
                  )}
                >
                  {notice.action_label}
                  <ExternalLink aria-hidden="true" className="size-3.5" />
                </a>
              ) : null}
            </div>
          </div>
        );
      })}
    </section>
  );
}
