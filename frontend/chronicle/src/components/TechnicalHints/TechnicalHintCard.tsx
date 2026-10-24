import { BookOpen, Lightbulb, PanelsTopLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card/Card";
import { ItemIcon } from "@/components/ui/ItemIcon/ItemIcon";
import { cn } from "@/lib/utils";
import type { TechnicalHint } from "./types";

function fallbackIcon(kind: TechnicalHint["kind"]): ReactNode {
  const className = "h-6 w-6";
  switch (kind) {
    case "blog": return <BookOpen className={className} />;
    case "panel": return <PanelsTopLeft className={className} />;
    default: return <Lightbulb className={className} />;
  }
}

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
  const content = (
    <Card
      className={cn(
        "h-full overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card to-primary/5",
        compact ? "p-3" : "p-4",
        interactive && hint.href && "transition-colors hover:border-primary/40 hover:bg-muted/50",
        className,
      )}
    >
      <div className={cn("flex h-full", compact ? "items-center gap-3" : "flex-col justify-center gap-3")}>
        <div className={cn("flex h-10 w-10 shrink-0 items-center text-primary", compact ? "justify-center" : "justify-start")}>
          {hint.icon ? <ItemIcon icon={hint.icon} size={40} /> : fallbackIcon(hint.kind)}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-primary/75">
            {hint.kind === "blog" ? "Chronicle article" : hint.kind === "panel" ? "Panel insight" : "Chronicle tip"}
          </p>
          <h3 className={cn("font-semibold leading-tight", compact ? "text-sm" : "text-base")}>{hint.title}</h3>
          <p className={cn("mt-1 text-muted-foreground", compact ? "line-clamp-2 text-xs" : "text-sm")}>{hint.body}</p>
          {!compact && interactive && hint.href && (
            <p className="mt-3 text-xs font-medium text-primary">{hint.action_label ?? "Learn more"} →</p>
          )}
        </div>
      </div>
    </Card>
  );

  if (!interactive || !hint.href) return content;
  return <Link to={hint.href} className="block h-full">{content}</Link>;
}
