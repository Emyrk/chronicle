import React from "react";
import { createPortal } from "react-dom";
import {
  Armchair,
  HelpCircle,
  Keyboard,
  MousePointer,
  MousePointerClick,
  Pencil,
  RotateCcw,
  RotateCw,
  Search,
  X,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card/Card";

interface KeybindItem {
  keys: string[];
  action: string;
  icon: React.ReactNode;
}

const KEYBINDS: KeybindItem[] = [
  {
    keys: ["Mid", "Click"],
    action: "Quick-move: roster → first empty slot, slot → bench, bench → board",
    icon: <MousePointerClick className="h-4 w-4" />,
  },
  {
    keys: ["Shift", "Mid", "Click"],
    action: "Send a roster player straight to the bench",
    icon: <Armchair className="h-4 w-4" />,
  },
  {
    keys: ["Shift", "Click"],
    action: "Select a range of roster players",
    icon: <MousePointer className="h-4 w-4" />,
  },
  {
    keys: ["Ctrl", "Click"],
    action: "Add or remove a roster player from the selection",
    icon: <MousePointer className="h-4 w-4" />,
  },
  {
    keys: ["B"],
    action: "Bench the hovered player",
    icon: <Armchair className="h-4 w-4" />,
  },
  {
    keys: ["Del"],
    action: "Remove the hovered player",
    icon: <X className="h-4 w-4" />,
  },
  {
    keys: ["E"],
    action: "Edit the hovered player",
    icon: <Pencil className="h-4 w-4" />,
  },
  {
    keys: ["1", "-", "8"],
    action: "Send the hovered player to that group",
    icon: <Keyboard className="h-4 w-4" />,
  },
  {
    keys: ["Ctrl", "Z"],
    action: "Undo",
    icon: <RotateCcw className="h-4 w-4" />,
  },
  {
    keys: ["Ctrl", "Shift", "Z"],
    action: "Redo",
    icon: <RotateCw className="h-4 w-4" />,
  },
  {
    keys: ["/"],
    action: "Search the roster",
    icon: <Search className="h-4 w-4" />,
  },
  {
    keys: ["?"],
    action: "Toggle this overlay",
    icon: <HelpCircle className="h-4 w-4" />,
  },
];

/** Centered keyboard-shortcuts card, matching the instance page's keybinds card. */
export function KeybindsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99] flex items-center justify-center bg-black/30" onClick={onClose}>
      <Card
        onClick={(e) => e.stopPropagation()}
        className="w-[440px] max-w-[calc(100vw-2rem)] shadow-2xl bg-card/95 backdrop-blur-sm border-border/50"
      >
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Keyboard className="h-5 w-5 text-primary" />
            Keyboard Shortcuts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {KEYBINDS.map((keybind, index) => (
            <div key={index} className="flex items-center py-1.5 border-b border-border/30 last:border-0">
              <div className="w-[56px] shrink-0 flex items-center justify-center text-muted-foreground">
                {keybind.icon}
              </div>
              <div className="flex-1 min-w-0 text-sm text-muted-foreground">{keybind.action}</div>
              <div className="w-[130px] shrink-0 flex items-center justify-end gap-1">
                {keybind.keys.map((key, keyIndex) => (
                  <kbd
                    key={keyIndex}
                    className="px-2 py-1 text-xs font-medium bg-muted rounded border border-border/50 text-foreground"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground pt-2 text-center">
            Hover a player anywhere on the board, then press a key.
          </p>
        </CardContent>
      </Card>
    </div>,
    document.body,
  );
}
