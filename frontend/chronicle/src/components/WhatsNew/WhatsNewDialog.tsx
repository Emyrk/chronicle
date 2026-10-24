import type { ReactNode } from "react";
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
  "Move, resize, add, and remove panels right on the raid you are viewing.",
  "Save as… keeps the layout in your Layout Book, or overwrites one of your own.",
  "Put it on your action bar and cast it on any raid with a number key.",
];

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["Shift", "E"], label: "Edit layout / Done" },
  { keys: ["Esc"], label: "Discard changes" },
];

// Styled as a rare item tooltip: a meaningful feature, short of a legendary launch.
export function WhatsNewDialog({ open, onOpenChange }: WhatsNewDialogProps) {
  const close = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-[480px] gap-0 overflow-hidden rounded-md border border-[#5c6670] bg-[linear-gradient(180deg,rgba(10,16,28,0.98),rgba(6,8,16,0.98))] p-0 shadow-[0_24px_60px_rgba(0,0,0,0.7)] sm:max-w-[480px]">
        <div className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-4 px-6 pt-[22px]">
          <img
            src={iconUrl("inv_misc_book_09")}
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 rounded border-2 border-quality-rare bg-[#08101c]"
          />
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-quality-rare">
              Rare feature
            </span>
            <DialogTitle className="font-wow text-[28px] font-normal leading-tight text-quality-rare">
              Layout editing
            </DialogTitle>
          </div>
        </div>

        <div className="flex flex-col gap-1 px-6 pb-6 pt-4 text-sm leading-relaxed">
          <p className="text-foreground">Use: Rearranges the raid page around your panels</p>

          <div aria-hidden className="mt-3 flex flex-col gap-2 rounded border border-quality-rare/30 bg-black/35 p-3 shadow-inner">
            {SHORTCUTS.map(({ keys, label }) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1">
                  {keys.map((key, index) => (
                    <span key={key} className="flex items-center gap-1">
                      {index > 0 && <span className="text-xs text-muted-foreground">+</span>}
                      <Key>{key}</Key>
                    </span>
                  ))}
                </span>
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>

          <DialogDescription asChild className="mt-3 flex max-w-[420px] flex-col gap-2.5 text-[15px] leading-relaxed text-foreground [text-wrap:pretty]">
            <ul>
              {HIGHLIGHTS.map((text) => (
                <li key={text} className="grid grid-cols-[14px_minmax(0,1fr)] gap-2.5">
                  <span aria-hidden className="text-[10px] leading-6 text-quality-rare">◆</span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </DialogDescription>

          <p className="mt-2 italic text-[#ffd100]">&ldquo;Measure twice, cast once.&rdquo;</p>

          <div className="mt-5 flex flex-wrap items-center gap-5">
            {/* Blog routes mount a separate app entry, so these links must reload the document. */}
            <a
              href={whatsNewLink("/blog/layout-editing", "whats_new_primary", "layout-editing")}
              onClick={close}
              className="inline-flex items-center gap-2 rounded border border-quality-rare/80 bg-[linear-gradient(180deg,#1f6fc4,#0f4a8a)] px-[18px] py-2.5 text-sm font-semibold text-white transition-[filter] hover:brightness-110"
            >
              Watch layout editing
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href={whatsNewLink("/blog", "whats_new_archive", "layout-editing")}
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

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-7 items-center justify-center rounded border border-zinc-500 border-b-[3px] bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-zinc-100">
      {children}
    </kbd>
  );
}
