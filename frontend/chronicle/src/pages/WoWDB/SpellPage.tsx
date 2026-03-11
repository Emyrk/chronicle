import { useParams, Link, useSearchParams } from "react-router-dom";
import { Loader2, ArrowLeft, Search } from "lucide-react";
import { useState } from "react";
import { useSpell } from "@/api/queries";
import { SpellTooltip } from "./SpellTooltip";
import { LocaleSelector } from "./LocaleSelector";
import type { LocaleIndex } from "@/api/wowdb";
import { getDamageTypeLabels, getAttackOutcomeLabels, AttackOutcome, SpellDamageType } from "@/api/wowdb";
import { DamageTypeBadge } from "@/components/SpellSchoolBadge";

export function SpellPage() {
  const { spellId } = useParams<{ spellId: string }>();
  const [searchId, setSearchId] = useState(spellId || "");
  const [searchParams, setSearchParams] = useSearchParams();
  const locale = (searchParams.get("locale") || "0") as LocaleIndex;

  const setLocale = (newLocale: LocaleIndex) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newLocale === "0") {
        next.delete("locale");
      } else {
        next.set("locale", newLocale);
      }
      return next;
    });
  };
  
  const { data: spell, isLoading, error } = useSpell(spellId || "", {
    enabled: !!spellId,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchId && searchId !== spellId) {
      window.location.href = `/wowdb/spell/${searchId}`;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground text-sm mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Spell Database</h1>
            <p className="text-muted-foreground text-sm mt-1">
              View spell data from World of Warcraft
            </p>
          </div>
          <LocaleSelector value={locale} onChange={setLocale} />
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex gap-2">
          <input
            type="number"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            placeholder="Enter spell ID..."
            className="flex-1 px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 flex items-center gap-2"
          >
            <Search className="h-4 w-4" />
            View
          </button>
        </div>
      </form>

      {/* Content */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <p className="text-destructive text-sm">
            {error instanceof Error ? error.message : "Failed to load spell"}
          </p>
        </div>
      )}

      {!isLoading && !error && !spell && spellId && (
        <div className="bg-muted/50 border border-border rounded-lg p-4">
          <p className="text-muted-foreground text-sm">
            No spell found with ID {spellId}
          </p>
        </div>
      )}

      {!spellId && (
        <div className="bg-muted/50 border border-border rounded-lg p-6 text-center">
          <p className="text-muted-foreground">
            Enter a spell ID above to view its details
          </p>
          <p className="text-muted-foreground text-sm mt-2">
            Try: <Link to="/wowdb/spell/133" className="text-primary hover:underline">133 (Fireball)</Link>,{" "}
            <Link to="/wowdb/spell/585" className="text-primary hover:underline">585 (Smite)</Link>,{" "}
            <Link to="/wowdb/spell/100" className="text-primary hover:underline">100 (Charge)</Link>,{" "}
            <Link to="/wowdb/spell/6078" className="text-primary hover:underline">6078 (Renew)</Link>
          </p>
        </div>
      )}

      {spell && (
        <div className="space-y-6">
          {/* Damage Type Badges */}
          {spell.damage_type !== SpellDamageType.Unknown && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Damage Type:</span>
              {getDamageTypeLabels(spell.damage_type).map((label) => (
                <DamageTypeBadge key={label} label={label} />
              ))}
            </div>
          )}

          {/* Attack Outcome Badges */}
          {spell.attack_outcome !== AttackOutcome.None && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Attack Outcome:</span>
              {getAttackOutcomeLabels(spell.attack_outcome).map((label) => (
                <span
                  key={label}
                  className={`text-xs px-2 py-0.5 rounded font-medium ${
                    label === "Miss" || label === "Dodge" || label === "Parry" || label === "Block" || label === "Resist"
                      ? "bg-red-500/20 text-red-400"
                      : label === "Crit" || label === "Crushing"
                      ? "bg-orange-500/20 text-orange-400"
                      : label === "Glancing"
                      ? "bg-slate-500/20 text-slate-400"
                      : "bg-green-500/20 text-green-400"
                  }`}
                >
                  {label}
                </span>
              ))}
            </div>
          )}

          {/* Tooltip Preview */}
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-2">
              Tooltip Preview
            </h2>
            <SpellTooltip spell={spell} locale={locale} />
          </div>

          {/* Raw Data */}
          <details className="bg-muted/30 border border-border rounded-lg">
            <summary className="px-4 py-3 cursor-pointer text-sm font-medium hover:bg-muted/50">
              Raw API Response
            </summary>
            <pre className="p-4 text-xs overflow-auto max-h-96 border-t border-border">
              {JSON.stringify(spell, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
