import { BookOpen, ChevronRight, Lightbulb, PanelsTopLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ItemIcon } from "@/components/ui/ItemIcon/ItemIcon";
import { cn } from "@/lib/utils";
import type { TechnicalHint } from "./types";

function fallbackIcon(kind: TechnicalHint["kind"], className: string): ReactNode {
  switch (kind) {
    case "blog": return <BookOpen className={className} />;
    case "panel": return <PanelsTopLeft className={className} />;
    default: return <Lightbulb className={className} />;
  }
}

function kindLabel(kind: TechnicalHint["kind"]): string {
  switch (kind) {
    case "blog": return "Chronicle article";
    case "panel": return "Panel insight";
    default: return "Chronicle tip";
  }
}

function isBlogHref(href: string): boolean {
  return href === "/blog" || href.startsWith("/blog/") || href.startsWith("/blog?");
}

function HintIcon({ hint, size }: { hint: TechnicalHint; size: number }) {
  if (hint.icon) return <ItemIcon icon={hint.icon} size={size} className="border-white/20" />;
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded border border-white/15 bg-black/40 text-amber-300/90"
      style={{ width: size, height: size }}
    >
      {fallbackIcon(hint.kind, "h-1/2 w-1/2")}
    </div>
  );
}

/** Styled to sit alongside Recent raid cards, which it replaces when an ad slot goes unfilled. */
export function TechnicalHintCard({
  hint,
  interactive = true,
  compact = false,
  className,
}: {
  hint: TechnicalHint;
  interactive?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const linked = interactive && Boolean(hint.href);
  const action = hint.action_label ?? "Learn more";

  const content = (
    <div
      className={cn(
        "group relative h-full overflow-hidden rounded-lg bg-gradient-to-br from-slate-800 to-slate-900",
        linked && "cursor-pointer transition-shadow hover:shadow-xl",
        className,
      )}
    >
      {/* Oversized faded icon stands in for the raid card's loading-screen art. */}
      <div
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 rotate-12 opacity-[0.12] transition-transform duration-300 group-hover:scale-105",
          compact ? "-right-3" : "-right-8",
        )}
        aria-hidden="true"
      >
        {hint.icon
          ? <ItemIcon icon={hint.icon} size={compact ? 96 : 176} className="rounded-2xl border-0" />
          : fallbackIcon(hint.kind, cn("text-white", compact ? "h-24 w-24" : "h-44 w-44"))}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />

      {compact ? (
        <div className="relative z-10 flex h-full items-center gap-3 p-3">
          <HintIcon hint={hint} size={36} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-amber-300/80">{kindLabel(hint.kind)}</p>
            <h3 className="truncate text-sm font-bold text-white drop-shadow-lg transition-colors group-hover:text-amber-300">
              {hint.title}
            </h3>
            <p className="line-clamp-2 text-xs text-white/70 drop-shadow">{hint.body}</p>
          </div>
          {linked && <ChevronRight className="h-4 w-4 shrink-0 text-white/50 transition-colors group-hover:text-amber-300" />}
        </div>
      ) : (
        <div className="relative z-10 flex h-full flex-col p-4">
          <div className="flex items-start gap-3">
            <HintIcon hint={hint} size={36} />
            <div className="min-w-0">
              <h3 className="font-bold text-base leading-tight text-white drop-shadow-lg transition-colors group-hover:text-amber-300">
                {hint.title}
              </h3>
              <p className="mt-0.5 text-xs text-amber-300/90 drop-shadow">{kindLabel(hint.kind)}</p>
            </div>
          </div>
          <p className="mt-3 line-clamp-4 text-sm text-white/80 drop-shadow">{hint.body}</p>
          <div className="flex-1" />
          {linked && (
            <div className="mt-2 flex items-center justify-between border-t border-white/20 pt-2 text-xs font-medium text-white/70 transition-colors group-hover:text-amber-300">
              <span className="truncate">{action}</span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (!linked || !hint.href) return content;
  // The blog is served outside the SPA, so it needs a full document navigation.
  if (isBlogHref(hint.href)) return <a href={hint.href} className="block h-full">{content}</a>;
  return <Link to={hint.href} className="block h-full">{content}</Link>;
}
