import { Globe2, Lock, LockKeyhole } from "lucide-react";

interface VisibilityPickerProps {
  privateLog: boolean;
  canMarkPrivate: boolean;
  onChange: (privateLog: boolean) => void;
}

/** Public/private selector shown to every uploader; private is locked without permission. */
export function VisibilityPicker({ privateLog, canMarkPrivate, onChange }: VisibilityPickerProps) {
  const optionClass = (selected: boolean) =>
    `relative flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
      selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
    }`;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Visibility</h3>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Log visibility">
        <button
          type="button"
          role="radio"
          aria-checked={!privateLog}
          onClick={() => onChange(false)}
          className={optionClass(!privateLog)}
        >
          <Globe2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <span>
            <span className="block text-sm font-medium">Public</span>
            <span className="block text-xs text-muted-foreground">
              Anyone can view. Eligible for rankings.
            </span>
          </span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={privateLog}
          onClick={() => onChange(true)}
          disabled={!canMarkPrivate}
          title={canMarkPrivate ? undefined : "You don't have permission to upload private logs"}
          className={`${optionClass(privateLog)} disabled:cursor-not-allowed disabled:hover:bg-transparent`}
        >
          <LockKeyhole className={`mt-0.5 h-5 w-5 shrink-0 ${canMarkPrivate ? "text-primary" : "text-muted-foreground"}`} />
          <span className={canMarkPrivate ? undefined : "opacity-60"}>
            <span className="block text-sm font-medium">Private</span>
            <span className="block text-xs text-muted-foreground">
              Viewers must request access. Excluded from rankings.
            </span>
          </span>
          {!canMarkPrivate && (
            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              <Lock className="h-3 w-3" />
              Locked
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
