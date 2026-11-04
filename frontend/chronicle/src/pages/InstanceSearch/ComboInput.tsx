import { Fragment, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
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
  onFocus,
  selected,
  blurOnPick,
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
  onFocus?: () => void;
  /** Value to mark with a check in the list. */
  selected?: string;
  /** Leave the box after picking (for pick-one selects). */
  blurOnPick?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const shown = open ? filterOptions(options, text, exclude) : [];
  const active = highlight >= 0 && highlight < shown.length ? highlight : -1;

  const pick = (o: ComboOption) => {
    if (o.disabled) return;
    onPick(o);
    setOpen(false);
    setHighlight(-1);
    if (blurOnPick) inputRef.current?.blur();
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
        ref={inputRef}
        role="combobox"
        aria-expanded={open && shown.length > 0}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        disabled={disabled}
        value={text}
        placeholder={placeholder}
        onFocus={() => {
          onFocus?.();
          setOpen(true);
        }}
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
                aria-disabled={o.disabled || undefined}
                // Keep focus in the input so blur doesn't fire before the click.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(o)}
                className={cn(
                  "flex items-center gap-2 rounded px-2 py-1 text-xs",
                  o.disabled ? "cursor-not-allowed" : cn("cursor-pointer", i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"),
                )}
              >
                {selected !== undefined && (
                  <span className="flex size-3.5 shrink-0 items-center justify-center">{o.value === selected && <Check className="h-3.5 w-3.5 text-sky-400" />}</span>
                )}
                {o.icon}
                {/* Dim only the label on locked options so a coloured hint (the tier) stays readable. */}
                <span className={cn("truncate", o.disabled && "opacity-50")}>{o.label ?? o.value}</span>
                {o.hint && (
                  <span className={cn("ml-auto pl-3 shrink-0 text-2xs", o.hintColor ? "font-semibold" : "text-muted-foreground", o.disabled && !o.hintColor && "opacity-50")} style={o.hintColor ? { color: o.hintColor } : undefined}>
                    {o.hint}
                  </span>
                )}
              </div>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Pick one of a fixed set of options by typing to search. The box shows the
 * current choice; focusing it clears the text so typing filters the list,
 * and leaving it without picking keeps the old choice.
 */
export function SelectCombo({
  value,
  options,
  onChange,
  disabled,
  placeholder = "Search…",
  className,
  title,
}: {
  value: string;
  options: readonly ComboOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  title?: string;
}) {
  const [query, setQuery] = useState<string | null>(null);
  const current = options.find((o) => o.value === value);
  return (
    <div className={cn("relative", className)} title={title}>
      <ComboInput
        text={query ?? current?.label ?? value}
        onTextChange={setQuery}
        options={options}
        selected={value}
        blurOnPick
        onFocus={() => setQuery("")}
        onBlurText={() => setQuery(null)}
        onPick={(o) => {
          onChange(o.value);
          setQuery(null);
        }}
        placeholder={placeholder}
        disabled={disabled}
        inputClassName="h-7 w-full rounded-md border border-input bg-background pl-2 pr-6 text-xs outline-none focus-visible:border-ring disabled:opacity-50"
      />
      <ChevronsUpDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
