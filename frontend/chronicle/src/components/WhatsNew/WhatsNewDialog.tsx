import { ArrowRight, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { iconUrl } from "@/config/iconUrl";
import { whatsNewLink } from "./trackedLinks";

interface WhatsNewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const VIEWER_MODES = [
  { label: "Enabled", description: "All active cosmetics" },
  { label: "Limited", description: "Static styles only" },
  { label: "Disabled", description: "Standard player rows" },
] as const;

// Styled as an epic item tooltip for a supporter appearance feature.
export function WhatsNewDialog({ open, onOpenChange }: WhatsNewDialogProps) {
  const close = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-[520px] gap-0 overflow-hidden rounded-md border border-quality-epic/80 bg-[radial-gradient(circle_at_top_right,rgba(163,53,238,0.18),transparent_42%),linear-gradient(180deg,rgba(15,10,27,0.99),rgba(6,8,16,0.99))] p-0 shadow-[0_24px_70px_rgba(52,16,83,0.72)] sm:max-w-[520px]">
        <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-4 border-b border-quality-epic/20 px-6 py-5">
          <div className="relative">
            <div aria-hidden className="absolute -inset-2 rounded-full bg-quality-epic/20 blur-md" />
            <img
              src={iconUrl("inv_misc_gem_amethyst_02")}
              alt=""
              width={64}
              height={64}
              className="relative h-16 w-16 rounded border-2 border-quality-epic bg-[#100719] shadow-[0_0_18px_rgba(163,53,238,0.35)]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-quality-epic">
              Epic feature
            </span>
            <DialogTitle className="font-wow text-[30px] font-normal leading-tight text-quality-epic">
              Character cosmetics
            </DialogTitle>
          </div>
        </div>

        <div className="flex flex-col px-6 pb-6 pt-5 text-sm leading-relaxed">
          <p className="text-foreground">Use: Personalizes linked characters across raid analysis</p>

          <div className="mt-4 rounded-lg border border-quality-epic/35 bg-black/40 p-3 shadow-inner">
            <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <span>Player metric preview</span>
              <Sparkles className="h-3.5 w-3.5 text-quality-epic" />
            </div>
            <div className="relative flex h-10 items-center overflow-hidden rounded-md border border-fuchsia-400/70 bg-[linear-gradient(90deg,rgba(91,33,182,0.9),rgba(168,85,247,0.38),rgba(15,23,42,0.8))] px-3 shadow-[inset_0_0_18px_rgba(216,180,254,0.15),0_0_14px_rgba(163,53,238,0.2)]">
              <span className="relative font-semibold text-fuchsia-100 [text-shadow:0_0_8px_rgba(232,121,249,0.8)]">
                Your Character
              </span>
              <span className="relative ml-auto hidden text-xs text-fuchsia-200/80 sm:inline">Name · Background · Border</span>
            </div>
          </div>

          <DialogDescription asChild className="mt-4 max-w-[460px] text-[15px] leading-relaxed text-foreground [text-wrap:pretty]">
            <div className="space-y-3">
              <p>
                Supporters can mix separate name, background, and border treatments under <strong>Account → Characters</strong>.
                Active selections now appear on player rows throughout raid analysis, not only in account previews.
              </p>
              <p>Every viewer chooses how those cosmetics appear under Account → Settings:</p>
            </div>
          </DialogDescription>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {VIEWER_MODES.map((mode) => (
              <div key={mode.label} className="rounded border border-quality-epic/25 bg-quality-epic/5 px-3 py-2">
                <div className="text-xs font-semibold text-quality-epic">{mode.label}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{mode.description}</div>
              </div>
            ))}
          </div>

          <p className="mt-4 italic text-[#ffd100]">&ldquo;Make the meters remember your name.&rdquo;</p>

          <div className="mt-5 flex flex-wrap items-center gap-5">
            {/* Blog routes mount a separate app entry, so these links must reload the document. */}
            <a
              href={whatsNewLink("/blog/character-cosmetics", "whats_new_primary", "character-cosmetics")}
              onClick={close}
              className="inline-flex items-center gap-2 rounded border border-quality-epic/90 bg-[linear-gradient(180deg,#8b3fc7,#5b218d)] px-[18px] py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(163,53,238,0.2)] transition-[filter] hover:brightness-110"
            >
              See character cosmetics
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href={whatsNewLink("/blog", "whats_new_archive", "character-cosmetics")}
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
