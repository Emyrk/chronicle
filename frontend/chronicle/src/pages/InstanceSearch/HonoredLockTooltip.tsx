import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Code2, ListFilter, Lock, Trophy } from "lucide-react";
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { TIER_COLOR } from "@/pages/Settings/billingPricing";
import { cn } from "@/lib/utils";

const PERKS = [
  { key: "code", icon: Code2, title: "Code", text: "Write and edit searches as text." },
  { key: "conditions", icon: Trophy, title: "Costly conditions", text: "Player parses and stats, and boss, trash and idle time." },
] as const;

/**
 * Wraps a locked advanced-search control with a tooltip explaining it is an
 * Honored perk, in the style of the guild claim locked button. `highlight`
 * marks the perk the user is pointing at.
 */
export function HonoredLockTooltip({ highlight, children }: { highlight: (typeof PERKS)[number]["key"]; children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const honored = TIER_COLOR.honored;
  return (
    <HintTooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <span className="inline-flex">{children}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6} className="w-80 max-w-[calc(100vw-2rem)] p-4 text-left text-sm text-pretty">
        <p className="flex items-center gap-2 font-semibold" style={{ color: honored }}>
          <Lock className="h-4 w-4" /> Honored supporter perk
        </p>
        <ul className="mt-3 space-y-2.5">
          {PERKS.map(({ key, icon: Icon, title, text }) => (
            <li key={key} className={cn("flex gap-2", key !== highlight && "opacity-70")}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: honored }} />
              <span>
                <span className="font-medium text-white">{title}.</span> {text}
              </span>
            </li>
          ))}
          <li className="flex gap-2">
            <ListFilter className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
            <span>
              <span className="font-medium text-white">Form and Blocks.</span> Free for everyone.
            </span>
          </li>
        </ul>
        <p className="mt-3 border-t border-white/10 pt-3">
          {isAuthenticated ? null : (
            <>
              <Link to="/login" className="text-sky-400 underline underline-offset-2 hover:text-sky-300">Log in</Link> or{" "}
            </>
          )}
          <Link to="/supporter" className="underline underline-offset-2 hover:brightness-125" style={{ color: honored }}>
            {isAuthenticated ? "Become an Honored supporter" : "become an Honored supporter"}
          </Link>{" "}
          to unlock them.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">Click to preview an example, read-only.</p>
      </TooltipContent>
    </HintTooltip>
  );
}
