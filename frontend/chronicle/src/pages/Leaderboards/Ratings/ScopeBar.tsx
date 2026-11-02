import { Fragment, type ReactNode } from "react"
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu/DropdownMenu"
import { ClassIcon } from "@/pages/RaidPlanner/ClassIcon"
import { CLASS_CSS_VAR, CLASS_DISPLAY } from "@/pages/Rankings/classDisplay"
import { CLASS_ORDER, MOLTEN_CORE_BOSSES, scopeKind, type RatingScope } from "./ratingBoards.fixtures"
import { BossPortrait, SpecIcon } from "./RatingParts"

/** Boss, class, and spec pickers: where you are, and the way to go anywhere else. */
export function ScopeBar({
  scope,
  specs,
  subSpecs = [],
  onChange,
  bosses = MOLTEN_CORE_BOSSES,
  optionalBosses,
  showBoss = true,
  classDisabled,
  extra,
}: {
  scope: RatingScope
  specs: string[]
  /** Subspecs of the chosen spec, shown after it when there are any. */
  subSpecs?: string[]
  onChange: (scope: RatingScope) => void
  bosses?: readonly string[]
  /** Bosses a clear can skip; listed last in the boss picker, under an "Optional" heading. */
  optionalBosses?: ReadonlySet<string>
  /** Hide the boss picker when bosses are chosen elsewhere (e.g. the encounter sidebar). */
  showBoss?: boolean
  /** Why the class picker is unavailable (e.g. guild boards); dims it when set. */
  classDisabled?: string
  /** Extra controls (role, characters/guilds) placed at the end of the bar. */
  extra?: ReactNode
}) {
  const ALL = "all"
  return (
    <div
      className="relative flex flex-wrap items-center gap-2 border-t border-white/5 bg-black/20 px-3 py-2.5 sm:px-5"
      role="group"
      aria-label="Leaderboard scope"
    >
      {showBoss && (
        <>
          <Picker
            label="Boss"
            value={scope.boss ?? ALL}
            options={[
              { value: ALL, label: "All bosses" },
              ...[...bosses.filter((b) => !optionalBosses?.has(b)), ...bosses.filter((b) => optionalBosses?.has(b))].map((b) => ({
                value: b,
                label: b,
                icon: <BossPortrait boss={b} size="sm" />,
                group: optionalBosses?.has(b) ? "Optional" : undefined,
              })),
            ]}
            onChange={(v) => onChange({ ...scope, boss: v === ALL ? undefined : v })}
          />
          <ChevronRight className="size-3.5 text-muted-foreground/50" aria-hidden />
        </>
      )}
      {classDisabled ? (
        <div title={classDisabled} aria-disabled className="pointer-events-auto cursor-not-allowed opacity-30 grayscale">
          <div className="pointer-events-none flex flex-wrap items-center gap-2">
            <ClassSpecPicker scope={scope} specs={specs} subSpecs={subSpecs} onChange={onChange} />
          </div>
        </div>
      ) : (
        <ClassSpecPicker scope={scope} specs={specs} subSpecs={subSpecs} onChange={onChange} />
      )}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {extra}
        {scopeKind(scope) !== "raid" && (
          <button
            type="button"
            onClick={() => onChange({})}
            className="cursor-pointer inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <RotateCcw className="size-3.5" />
            Whole raid
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Every class as an icon; picking one reveals its specs alongside. Clicking
 * the chosen class or spec again widens back out.
 */
function ClassSpecPicker({
  scope,
  specs,
  subSpecs,
  onChange,
}: {
  scope: RatingScope
  specs: string[]
  subSpecs: string[]
  onChange: (scope: RatingScope) => void
}) {
  const color = scope.cls ? CLASS_CSS_VAR[scope.cls] : undefined
  return (
    <>
      <div role="group" aria-label="Class" className="flex flex-wrap items-center gap-1">
        {CLASS_ORDER.map((c) => {
          const on = scope.cls === c
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              aria-label={CLASS_DISPLAY[c]}
              title={on ? `${CLASS_DISPLAY[c]}: click again for all classes` : CLASS_DISPLAY[c]}
              onClick={() => onChange({ boss: scope.boss, cls: on ? undefined : c })}
              className={cn(
                "cursor-pointer rounded-md p-0.5 transition-all hover:opacity-100 hover:grayscale-0",
                scope.cls && !on && "opacity-40 grayscale",
              )}
              style={on ? { boxShadow: `0 0 0 2px ${CLASS_CSS_VAR[c]}` } : undefined}
            >
              <ClassIcon cls={c} className="size-7 rounded-sm" />
            </button>
          )
        })}
      </div>
      {scope.cls && specs.length > 0 && (
        <>
          <ChevronRight className="size-3.5 text-muted-foreground/50" aria-hidden />
          <div role="group" aria-label={`${CLASS_DISPLAY[scope.cls]} spec`} className="flex flex-wrap items-center gap-1">
            {specs.map((sp) => {
              const on = scope.spec === sp
              return (
                <button
                  key={sp}
                  type="button"
                  aria-pressed={on}
                  aria-label={sp}
                  title={on ? `${sp}: click again for all specs` : sp}
                  onClick={() => onChange({ boss: scope.boss, cls: scope.cls, spec: on ? undefined : sp })}
                  className={cn(
                    "flex h-8 cursor-pointer items-center gap-1.5 rounded-md border pr-2.5 pl-1 text-xs transition-colors",
                    on ? "bg-white/5" : "border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground",
                  )}
                  style={on ? { borderColor: color, color } : undefined}
                >
                  <SpecIcon cls={scope.cls!} spec={sp} className={cn("size-6 rounded-sm", scope.spec && !on && "opacity-50")} />
                  {sp}
                </button>
              )
            })}
          </div>
        </>
      )}
      {scope.cls && scope.spec && subSpecs.length > 0 && (
        <>
          <ChevronRight className="size-3.5 text-muted-foreground/50" aria-hidden />
          <div
            role="group"
            aria-label={`${scope.spec} subspec`}
            title="Subspecs split a spec into ranking cohorts by detected talent build"
            className="flex flex-wrap items-center gap-1"
          >
            {subSpecs.map((sub) => {
              const on = scope.subSpec === sub
              return (
                <button
                  key={sub}
                  type="button"
                  aria-pressed={on}
                  title={on ? `${scope.spec} (${sub}): click again for every ${scope.spec}` : `${scope.spec} (${sub})`}
                  onClick={() => onChange({ ...scope, subSpec: on ? undefined : sub })}
                  className={cn(
                    "flex h-8 cursor-pointer items-center rounded-md border px-2.5 text-xs transition-colors",
                    on ? "bg-white/5" : "border-white/10 text-muted-foreground hover:bg-white/5 hover:text-foreground",
                  )}
                  style={on ? { borderColor: color, color } : undefined}
                >
                  {sub}
                </button>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}

interface PickerOption {
  value: string
  label: string
  icon?: ReactNode
  color?: string
  /** Options sharing a group are listed under a heading, e.g. "Optional". */
  group?: string
}

function Picker({
  label,
  value,
  options,
  onChange,
  disabled,
  placeholder,
}: {
  label: string
  value: string
  options: PickerOption[]
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
}) {
  const current = options.find((o) => o.value === value) ?? options[0]
  const narrowed = current !== options[0]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label={`${label}: ${disabled && placeholder ? placeholder : current.label}`}
        className={cn(
          "cursor-pointer flex h-9 min-w-36 items-center gap-2 rounded-md border bg-background/60 pr-2 pl-2.5 text-left text-sm transition-colors outline-none hover:bg-white/5 focus-visible:border-ring disabled:pointer-events-none disabled:opacity-50",
          narrowed && "border-[color:var(--metric)]/60",
        )}
      >
        {current.icon}
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="text-[10px] tracking-wider text-muted-foreground uppercase">{label}</span>
          <span className={cn("truncate", !narrowed && "text-muted-foreground")} style={{ color: narrowed ? current.color : undefined }}>
            {disabled && placeholder ? placeholder : current.label}
          </span>
        </span>
        <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="styled-scrollbar min-w-48">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((o, i) => (
            <Fragment key={o.value}>
              {o.group && o.group !== options[i - 1]?.group && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">{o.group}</DropdownMenuLabel>
                </>
              )}
              <DropdownMenuRadioItem value={o.value} className="gap-2">
                {o.icon}
                <span style={{ color: o.color }}>{o.label}</span>
              </DropdownMenuRadioItem>
            </Fragment>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
