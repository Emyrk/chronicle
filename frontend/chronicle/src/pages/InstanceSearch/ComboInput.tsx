import { Fragment, useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { filterOptions, type ComboOption } from "./comboOptions";

/**
 * A text input with a filterable dropdown of options (the Guild History
 * boss picker's look). Free text is always allowed: Enter with nothing
 * highlighted, or leaving the box, keeps what was typed. Typing highlights the
 * first match so Enter picks it; arrows move, Escape closes.
 *
 * children render inside the box before the input (chips, icons).
 */
export function ComboInput({
  text,
  onTextChange,
  options,
  exclude,
  onPick,
  onEnterText,
  onKeyDown,
  onBlurText,
  placeholder,
  disabled,
  className,
  inputClassName,
  children,
}: {
  text: string;
  onTextChange: (text: string) => void;
  options: readonly ComboOption[];
  /** Values to leave out (already chosen). */
  exclude?: readonly string[];
  onPick: (option: ComboOption) => void;
  /** Enter with no option highlighted. */
  onEnterText?: (text: string) => void;
  /** Runs first; call preventDefault to take over the key. */
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  onBlurText?: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const listId = useId();
  const shown = open ? filterOptions(options, text, exclude) : [];
  const active = highlight >= 0 && highlight < shown.length ? highlight : -1;

  const pick = (o: ComboOption) => {
    onPick(o);
    setOpen(false);
    setHighlight(-1);
  };

  const keyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && active >= 0) pick(shown[active]);
      else {
        onEnterText?.(text);
        setOpen(false);
      }
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className={cn("relative", className)}>
      {children}
      <input
        role="combobox"
        aria-expanded={open && shown.length > 0}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        disabled={disabled}
        value={text}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          onBlurText?.(text);
        }}
        onChange={(e) => {
          onTextChange(e.target.value);
          setOpen(true);
          setHighlight(e.target.value.trim() ? 0 : -1);
        }}
        onKeyDown={keyDown}
        className={inputClassName}
      />
      {open && shown.length > 0 && (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 min-w-full w-max max-w-[min(24rem,calc(100vw-2rem))] max-h-72 overflow-y-auto styled-scrollbar rounded-md border bg-popover p-1 shadow-xl"
        >
          {shown.map((o, i) => (
            <Fragment key={o.value}>
              {o.group && o.group !== shown[i - 1]?.group && (
                <div className={cn("px-2 pb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground", i > 0 ? "mt-1 border-t border-border/60 pt-1.5" : "pt-1")}>
                  {o.group}
                </div>
              )}
              <div
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // Keep focus in the input so blur doesn't fire before the click.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(o)}
                className={cn("flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs", i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60")}
              >
                {o.icon}
                <span className="truncate">{o.label ?? o.value}</span>
                {o.hint && <span className="ml-auto pl-3 shrink-0 text-2xs text-muted-foreground">{o.hint}</span>}
              </div>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
