import { Link, useLocation } from "react-router-dom";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Prominent sign-in call-to-action for logged-out visitors. */
export function LoginBanner({ title, subtitle }: { title: string; subtitle: string }) {
  const location = useLocation();
  const loginUrl = `/login?from=${encodeURIComponent(location.pathname + location.search)}`;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-blue-500/40 bg-blue-500/10 px-4 py-3">
      <LogIn className="h-5 w-5 shrink-0 text-blue-400" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-zinc-100">{title}</div>
        <div className="text-xs text-zinc-400">{subtitle}</div>
      </div>
      <Link to={loginUrl}>
        <Button size="sm">Sign In</Button>
      </Link>
    </div>
  );
}
