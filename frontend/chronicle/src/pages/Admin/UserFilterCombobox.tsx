import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import type { User } from "@/api/typesGenerated";
import { cn } from "@/lib/utils";

interface UserFilterComboboxProps {
  users: readonly User[];
  /** Selected user ID, or "" for all users. */
  value: string;
  onChange: (userId: string) => void;
}

/** Type-to-search user picker for admin filters. Users are sorted by username. */
export function UserFilterCombobox({ users, value, onChange }: UserFilterComboboxProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(
    () => [...users].sort((a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: "base" })),
    [users],
  );
  const selected = sorted.find((user) => user.id === value);
  const search = query.trim().toLowerCase();
  const matches = useMemo(
    () => search
      ? sorted.filter((user) =>
        user.username.toLowerCase().includes(search)
        || user.email.toLowerCase().includes(search)
        || user.id.toLowerCase().startsWith(search))
      : sorted,
    [sorted, search],
  );

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const choose = (userId: string) => {
    onChange(userId);
    setOpen(false);
    setQuery("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlightedIndex((current) => Math.min(current + 1, Math.max(matches.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && open && matches[highlightedIndex]) {
      event.preventDefault();
      choose(matches[highlightedIndex].id);
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
      event.currentTarget.blur();
    }
  };

  return (
    <div ref={rootRef} className="relative w-56">
      <div className={cn(
        "border-input bg-background flex h-8 items-center gap-1.5 rounded-md border px-2",
        "focus-within:ring-2 focus-within:ring-ring",
      )}>
        <Search className="text-muted-foreground size-3.5 shrink-0" />
        <input
          type="text"
          role="combobox"
          aria-label="Filter by user"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && matches[highlightedIndex] ? `${listId}-user-${highlightedIndex}` : undefined}
          autoComplete="off"
          placeholder={selected ? selected.username : "All users"}
          value={open ? query : selected?.username ?? ""}
          onFocus={() => {
            setOpen(true);
            setQuery("");
            setHighlightedIndex(0);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setHighlightedIndex(0);
          }}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {selected ? (
          <button
            type="button"
            aria-label="Clear user filter"
            onClick={() => choose("")}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="size-3.5" />
          </button>
        ) : (
          <ChevronsUpDown className="text-muted-foreground size-3.5 shrink-0" />
        )}
      </div>

      {open && (
        <div className="bg-popover absolute left-0 top-full z-[100] mt-1 w-72 overflow-hidden rounded-md border shadow-xl">
          <div id={listId} role="listbox" className="styled-scrollbar max-h-72 overflow-y-auto p-1">
            {matches.length > 0 ? matches.map((user, index) => (
              <button
                id={`${listId}-user-${index}`}
                key={user.id}
                type="button"
                role="option"
                aria-selected={user.id === value}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => choose(user.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors",
                  index === highlightedIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                )}
              >
                <span className="flex size-4 shrink-0 items-center justify-center">
                  {user.id === value && <Check className="text-primary size-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{user.username}</span>
                  {user.email && (
                    <span className="text-muted-foreground block truncate text-[10px]">{user.email}</span>
                  )}
                </span>
              </button>
            )) : (
              <div className="text-muted-foreground px-3 py-6 text-center text-xs">
                No users match “{query}”
              </div>
            )}
          </div>
          <div className="text-muted-foreground border-t px-2.5 py-1.5 text-[10px]">
            {matches.length === sorted.length ? `${sorted.length} users` : `${matches.length} of ${sorted.length} users`}
          </div>
        </div>
      )}
    </div>
  );
}
