import { Popover as PopoverPrimitive } from "radix-ui";
import { Keyboard } from "lucide-react";
import { usePortalContainer } from "@/components/ui/PortalContainerContext";
import type { Keybind } from "./keybinds";

/** Keyboard icon that opens the list of timeline shortcuts. */
export function KeybindsButton({ keybinds }: { keybinds: readonly Keybind[] }) {
  const container = usePortalContainer();
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label="Keyboard and mouse shortcuts"
          title="Shortcuts"
          className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Keyboard className="size-4" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal container={container}>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={6}
          className="z-50 w-80 rounded-md border border-border bg-popover p-3 text-xs text-popover-foreground shadow-md outline-none"
        >
          <div className="mb-2 text-sm font-semibold">Shortcuts</div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5">
            {keybinds.map((k) => (
              <div key={`${k.keys}-${k.action}`} className="contents">
                <dt>
                  <kbd className="whitespace-nowrap rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                    {k.keys}
                  </kbd>
                </dt>
                <dd className="text-muted-foreground">{k.action}</dd>
              </div>
            ))}
          </dl>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
