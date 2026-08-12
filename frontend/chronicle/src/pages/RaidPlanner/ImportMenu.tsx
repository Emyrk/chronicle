import { useEffect, useRef, useState } from "react";
import { ChevronDown, Clock } from "lucide-react";

interface ImportSource {
  key: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}

const SOURCES: ImportSource[] = [
  {
    key: "raid",
    title: "From a raid",
    subtitle: "guild calendar · logs",
    icon: <Clock className="h-4 w-4" />,
  },
  {
    key: "raid-helper",
    title: "raid-helper.xyz",
    subtitle: "paste an event link",
    icon: <span className="text-[11px] font-semibold leading-none">rh</span>,
  },
];

/**
 * "Import ▾" dropdown in the header (design 2a). The sources are stubs —
 * selecting one is a no-op until the importers are wired up.
 */
export function ImportMenu({ onPick }: { onPick?: (source: string) => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-xs text-foreground hover:bg-muted/40 transition-colors"
      >
        Import <ChevronDown className="h-3 w-3 text-primary" />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 z-30 w-60 border border-border rounded-lg bg-popover shadow-lg overflow-hidden p-1">
          {SOURCES.map((source) => (
            <button
              key={source.key}
              onClick={() => {
                onPick?.(source.key);
                setOpen(false);
              }}
              className="w-full flex items-center gap-3 px-2.5 py-2 rounded-md text-left hover:bg-muted/40 transition-colors"
            >
              <span className="flex items-center justify-center h-8 w-8 rounded-md bg-muted/60 text-muted-foreground shrink-0">
                {source.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium text-foreground">{source.title}</span>
                <span className="block text-[10px] text-muted-foreground">{source.subtitle}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
