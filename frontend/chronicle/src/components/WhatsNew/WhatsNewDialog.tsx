import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { iconUrl } from "@/config/iconUrl";

interface WhatsNewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WhatsNewDialog({ open, onOpenChange }: WhatsNewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden border-yellow-500/30 bg-card p-0 shadow-2xl shadow-black/50 sm:max-w-2xl">
        <div className="relative overflow-hidden border-b border-yellow-500/20 bg-gradient-to-br from-yellow-500/14 via-card to-card px-6 py-5 sm:px-8">
          <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-yellow-400/10 blur-3xl" />
          <DialogHeader className="relative">
            <div className="mb-2 flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-yellow-400">
              <Sparkles className="h-4 w-4" />
              What&apos;s New
            </div>
            <DialogTitle className="font-wow text-3xl leading-none text-yellow-300 sm:text-4xl">
              Custom panels are now available
            </DialogTitle>
            <DialogDescription className="max-w-xl text-sm leading-6 text-foreground/75 sm:text-base">
              Community-built panels bring class, encounter, and guild-specific analysis to Chronicle.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-6 pb-6 sm:px-8 sm:pb-8">
          <article className="relative -mt-px rounded-xl border border-yellow-500/35 bg-background/65 p-5 shadow-[0_0_28px_rgba(234,179,8,0.08)] sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <img
                src={iconUrl("trade_engineering")}
                alt=""
                width={72}
                height={72}
                className="h-[72px] w-[72px] shrink-0 rounded-lg border-2 border-yellow-400 bg-black/30 shadow-lg shadow-yellow-500/10"
              />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-yellow-400">
                  Legendary · Feature
                </p>
                <h3 className="mt-1 text-lg font-semibold text-card-foreground">Build the view your raid needs</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Install verified panels directly from GitHub, manage them from your account, and use them alongside Chronicle&apos;s built-in analysis.
                </p>
              </div>
            </div>

            <Button asChild size="lg" className="mt-6 w-full justify-between text-base shadow-lg shadow-primary/15">
              <Link to="/blog/custom-panels" onClick={() => onOpenChange(false)}>
                Read the full announcement
                <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
          </article>

          <Button asChild variant="outline" className="w-full justify-between">
            <Link to="/blog" onClick={() => onOpenChange(false)}>
              View all Chronicle updates
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
