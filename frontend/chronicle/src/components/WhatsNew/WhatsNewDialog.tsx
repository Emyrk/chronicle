import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { whatsNewLink } from "./trackedLinks";
import { iconUrl } from "@/config/iconUrl";

interface WhatsNewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const HIGHLIGHTS = [
  "Extend Chronicle with your own panels for specialized classes, encounters, and guild workflows.",
  "Your code runs on the same log data as Chronicle's built-in analysis, right alongside it.",
  "Source code is on GitHub. Fork it and build any panel you want.",
];

// Styled as a legendary item tooltip. Reserved for big launches.
export function WhatsNewDialog({ open, onOpenChange }: WhatsNewDialogProps) {
  const close = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="legendary-tooltip w-[calc(100%-2rem)] max-w-[520px] gap-0 overflow-hidden rounded-md border-0 bg-[linear-gradient(180deg,rgba(20,14,8,0.98),rgba(10,10,14,0.98))] p-0 sm:max-w-[520px]">
        <span className="legendary-shine pointer-events-none absolute inset-y-0 left-0 w-[30%] bg-[linear-gradient(90deg,transparent,rgba(255,200,120,0.12),transparent)]" />

        <div className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-4 px-6 pt-[22px]">
          <img
            src={iconUrl("trade_engineering")}
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 rounded border-2 border-quality-legendary bg-[#1a1206] shadow-[0_0_16px_rgba(255,128,0,0.5)]"
          />
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-quality-legendary">
              Legendary update
            </span>
            <DialogTitle className="font-wow text-[28px] font-normal leading-tight text-quality-legendary [text-shadow:0_0_18px_rgba(255,128,0,0.45)]">
              Custom panels are here
            </DialogTitle>
          </div>
        </div>

        <div className="flex flex-col gap-1 px-6 pb-6 pt-4 text-sm leading-relaxed">
          <p className="text-foreground">Binds to account</p>

          <DialogDescription asChild className="mt-3 flex max-w-[440px] flex-col gap-2.5 text-[15px] leading-relaxed text-foreground [text-wrap:pretty]">
            <ul>
              {HIGHLIGHTS.map((text) => (
                <li key={text} className="grid grid-cols-[14px_minmax(0,1fr)] gap-2.5">
                  <span aria-hidden className="text-[10px] leading-6 text-quality-legendary">◆</span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </DialogDescription>

          <p className="mt-2 italic text-[#ffd100]">&ldquo;Build the view your raid needs.&rdquo;</p>

          <div className="mt-5 flex flex-wrap items-center gap-5">
            <Link
              to={whatsNewLink("/blog/custom-panels", "whats_new_primary", "custom-panels")}
              onClick={close}
              className="inline-flex items-center gap-2 rounded border border-quality-legendary bg-[linear-gradient(180deg,#ff9a2e,#cc6600)] px-[18px] py-2.5 text-sm font-semibold text-[#1a0e00] transition-[filter] hover:brightness-110"
            >
              Read about custom panels
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to={whatsNewLink("/blog", "whats_new_archive", "custom-panels")}
              onClick={close}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              View all Chronicle updates
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
