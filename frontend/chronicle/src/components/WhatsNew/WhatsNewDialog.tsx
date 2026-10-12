import { ArrowRight } from "lucide-react";
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
  "Compare two players cast by cast, or inspect one rotation on its own.",
  "Zoom from the whole pull down to a few seconds of casts, swings, cooldowns, and idle time.",
  "Follow DPS or HPS alongside consumables, buffs, debuffs, and Chronicle replay.",
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
            src={iconUrl("inv_misc_pocketwatch_01")}
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 rounded border-2 border-quality-legendary bg-[#1a1206] shadow-[0_0_16px_rgba(255,128,0,0.5)]"
          />
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-quality-legendary">
              Legendary beta
            </span>
            <DialogTitle className="font-wow text-[28px] font-normal leading-tight text-quality-legendary [text-shadow:0_0_18px_rgba(255,128,0,0.45)]">
              Player Timeline is here
            </DialogTitle>
          </div>
        </div>

        <div className="flex flex-col gap-1 px-6 pb-6 pt-4 text-sm leading-relaxed">
          <p className="text-foreground">Requires one selected encounter</p>

          <div aria-hidden className="mt-3 overflow-hidden rounded border border-quality-legendary/40 bg-black/35 p-3 shadow-inner">
            <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <span>Player A vs Player B</span>
              <span>00:18.4</span>
            </div>
            <div className="relative space-y-2 overflow-hidden">
              <span className="absolute bottom-0 left-[58%] top-0 w-px bg-[#ffd100] shadow-[0_0_8px_rgba(255,209,0,0.75)]" />
              <div className="grid grid-cols-[38px_1fr] items-center gap-2">
                <span className="font-mono text-[10px] text-[#69ccf0]">A</span>
                <div className="flex h-3 gap-1">
                  <span className="w-[18%] rounded-sm bg-school-frost" />
                  <span className="w-[9%] rounded-sm bg-school-arcane" />
                  <span className="w-[28%] rounded-sm bg-school-fire" />
                  <span className="w-[12%] rounded-sm border border-white/15 bg-white/5" />
                  <span className="flex-1 rounded-sm bg-school-frost/75" />
                </div>
              </div>
              <div className="grid grid-cols-[38px_1fr] items-center gap-2">
                <span className="font-mono text-[10px] text-[#fff468]">B</span>
                <div className="flex h-3 gap-1">
                  <span className="w-[12%] rounded-sm bg-school-physical" />
                  <span className="w-[24%] rounded-sm bg-school-nature" />
                  <span className="w-[7%] rounded-sm border border-white/15 bg-white/5" />
                  <span className="w-[21%] rounded-sm bg-school-physical" />
                  <span className="flex-1 rounded-sm bg-school-shadow/75" />
                </div>
              </div>
            </div>
          </div>

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

          <p className="mt-2 italic text-[#ffd100]">&ldquo;Find the moment the fight changed.&rdquo;</p>

          <div className="mt-5 flex flex-wrap items-center gap-5">
            {/* Blog routes mount a separate app entry, so these links must reload the document. */}
            <a
              href={whatsNewLink("/blog/player-timeline", "whats_new_primary", "player-timeline")}
              onClick={close}
              className="inline-flex items-center gap-2 rounded border border-quality-legendary bg-[linear-gradient(180deg,#ff9a2e,#cc6600)] px-[18px] py-2.5 text-sm font-semibold text-[#1a0e00] transition-[filter] hover:brightness-110"
            >
              Explore Player Timeline
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href={whatsNewLink("/blog", "whats_new_archive", "player-timeline")}
              onClick={close}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              View all Chronicle updates
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
