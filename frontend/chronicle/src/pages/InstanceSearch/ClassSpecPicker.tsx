import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { iconUrl } from "@/config/iconUrl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu/DropdownMenu";
import { cn } from "@/lib/utils";
import { ClassIcon } from "@/pages/RaidPlanner/ClassIcon";
import { CLASS_CSS_VAR, SPEC_BY_CLASS } from "@/pages/Rankings/classDisplay";
import { specIconUrl } from "@/pages/Leaderboards/Ratings/ratingThemes";
import { ANY_CLASS_SPEC, type ClassSpec, classLabel, classSpecLabel, displayKey, pickerClasses, useSubSpecs } from "./classSpec";

/** Icons for sub-specs that have a clear one; others fall back to the spec icon. */
const SUBSPEC_ICONS: Record<string, string> = {
  "DRUID/Feral/Bear": iconUrl("ability_racial_bearform"),
  "DRUID/Feral/Cat": iconUrl("ability_druid_catform"),
  "WARRIOR/Fury/Fury Prot": iconUrl("ability_warrior_defensivestance"),
};

function SpecIcon({ cls, spec, subSpec, className }: { cls: string; spec: string; subSpec?: string; className?: string }) {
  const key = displayKey(cls);
  const src = (subSpec && SUBSPEC_ICONS[`${key}/${spec}/${subSpec}`]) || specIconUrl(key, spec);
  return (
    <img
      src={src}
      alt=""
      className={cn("rounded-sm", className)}
      onError={(e) => {
        (e.target as HTMLImageElement).src = `/c/icons/class_${key.toLowerCase()}.png`;
      }}
    />
  );
}

/** Class icon + name, coloured by class. */
export function ClassLabel({ cls, className }: { cls: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <ClassIcon cls={displayKey(cls)} className="h-4 w-4 rounded-sm" />
      <span style={{ color: CLASS_CSS_VAR[displayKey(cls)] }}>{classLabel(cls)}</span>
    </span>
  );
}

/**
 * The current choice. iconClass is the class to draw icons for when the
 * value itself has no class (a spec-only condition), i.e. the class the user
 * picked through. Without it the spec is shown as plain text, never guessed
 * ("Holy" could be Priest or Paladin).
 */
function SelectionLabel({ value, iconClass, placeholder }: { value: ClassSpec; iconClass: string; placeholder: string }) {
  if (!value.class && !value.spec && !value.subSpec) return <span className="text-muted-foreground">{placeholder}</span>;
  if (value.class && !value.spec) return <ClassLabel cls={value.class} />;
  const cls = value.class || iconClass;
  const specs = cls ? SPEC_BY_CLASS[displayKey(cls)] ?? [] : [];
  const showIcon = cls && value.spec && specs.includes(value.spec);
  return (
    <span className="inline-flex items-center gap-1.5">
      {showIcon && <SpecIcon cls={cls} spec={value.spec} subSpec={value.subSpec} className="h-4 w-4" />}
      <span style={showIcon ? { color: CLASS_CSS_VAR[displayKey(cls)] } : undefined}>{classSpecLabel(value)}</span>
    </span>
  );
}

/**
 * Cascading Class > Spec > Sub-spec menu with icons. `depth` limits how far
 * down a choice can go; every level also offers "Any …".
 */
export function ClassSpecPicker({
  value,
  onChange,
  depth = "subspec",
  allowedClasses,
  allowAny = true,
  placeholder = "Any class",
  disabled,
  className,
}: {
  value: ClassSpec;
  onChange: (v: ClassSpec) => void;
  depth?: "class" | "spec" | "subspec";
  allowedClasses?: readonly string[];
  allowAny?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const subSpecs = useSubSpecs();
  const classes = pickerClasses(allowedClasses);
  // Remember the class picked through, for icons on spec-only values.
  const [iconClass, setIconClass] = useState(value.class);
  const pick = (v: ClassSpec) => {
    setIconClass(v.class);
    onChange(v);
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            "h-7 inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-50 max-w-full",
            className,
          )}
        >
          <SelectionLabel value={value} iconClass={iconClass} placeholder={placeholder} />
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {allowAny && (
          <>
            <DropdownMenuItem onSelect={() => pick(ANY_CLASS_SPEC)}>
              <span className="text-muted-foreground">{placeholder}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {classes.map((cls) =>
          depth === "class" ? (
            <DropdownMenuItem key={cls} onSelect={() => pick({ class: cls, spec: "", subSpec: "" })}>
              <ClassLabel cls={cls} />
            </DropdownMenuItem>
          ) : (
            <DropdownMenuSub key={cls}>
              <DropdownMenuSubTrigger>
                <ClassLabel cls={cls} />
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52">
                <DropdownMenuItem onSelect={() => pick({ class: cls, spec: "", subSpec: "" })}>
                  <ClassIcon cls={displayKey(cls)} className="h-4 w-4 rounded-sm" />
                  Any {classLabel(cls)}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {(SPEC_BY_CLASS[displayKey(cls)] ?? []).map((spec) => {
                  const subs = depth === "subspec" ? subSpecs.get(`${displayKey(cls)}/${spec}`) : undefined;
                  if (!subs?.length) {
                    return (
                      <DropdownMenuItem key={spec} onSelect={() => pick({ class: cls, spec, subSpec: "" })}>
                        <SpecIcon cls={cls} spec={spec} className="h-4 w-4" />
                        {spec}
                      </DropdownMenuItem>
                    );
                  }
                  return (
                    <DropdownMenuSub key={spec}>
                      <DropdownMenuSubTrigger>
                        <SpecIcon cls={cls} spec={spec} className="h-4 w-4" />
                        {spec}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-48">
                        <DropdownMenuItem onSelect={() => pick({ class: cls, spec, subSpec: "" })}>
                          <SpecIcon cls={cls} spec={spec} className="h-4 w-4" />
                          Any {spec}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {subs.map((sub) => (
                          <DropdownMenuItem key={sub} onSelect={() => pick({ class: cls, spec, subSpec: sub })}>
                            <SpecIcon cls={cls} spec={spec} subSpec={sub} className="h-4 w-4" />
                            {sub}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
