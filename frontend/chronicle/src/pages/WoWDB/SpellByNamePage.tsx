import { useParams, Link, useSearchParams, useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft, Search } from "lucide-react";
import { useState } from "react";
import { useSpellsByName } from "@/api/queries";
import { SpellTooltip } from "./SpellTooltip";
import { LocaleSelector } from "./LocaleSelector";
import type { WoWSpell, LocaleIndex } from "@/api/wowdb";
import { getLocalizedText } from "@/api/wowdb";
import { SpellSchoolText } from "@/components/SpellSchoolBadge";
import { SpellIconWithTooltip } from "@/components/ui/SpellIconWithTooltip";

export function SpellByNamePage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const [searchName, setSearchName] = useState(name || "");
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

  const {
    data: spells,
    isLoading,
    error,
  } = useSpellsByName(name || "", {
    enabled: !!name,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchName && searchName !== name) {
      navigate(`/wowdb/spell-by-name/${encodeURIComponent(searchName)}`);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
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
            <h1 className="text-2xl font-bold">Spell Search by Name</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Search spells by name and compare different ranks
            </p>
          </div>
          <LocaleSelector value={locale} onChange={setLocale} />
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            placeholder="Enter spell name... (e.g., Fireball, Renew, Frostbolt)"
            className="flex-1 px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 flex items-center gap-2"
          >
            <Search className="h-4 w-4" />
            Search
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
            {error instanceof Error ? error.message : "Failed to load spells"}
          </p>
        </div>
      )}

      {!isLoading && !error && spells && spells.length === 0 && name && (
        <div className="bg-muted/50 border border-border rounded-lg p-4">
          <p className="text-muted-foreground text-sm">
            No spells found with name "{name}"
          </p>
        </div>
      )}

      {!name && (
        <div className="bg-muted/50 border border-border rounded-lg p-6 text-center">
          <p className="text-muted-foreground">
            Enter a spell name above to search
          </p>
          <p className="text-muted-foreground text-sm mt-2">
            Try:{" "}
            <Link
              to="/wowdb/spell-by-name/Fireball"
              className="text-primary hover:underline"
            >
              Fireball
            </Link>
            ,{" "}
            <Link
              to="/wowdb/spell-by-name/Renew"
              className="text-primary hover:underline"
            >
              Renew
            </Link>
            ,{" "}
            <Link
              to="/wowdb/spell-by-name/Frostbolt"
              className="text-primary hover:underline"
            >
              Frostbolt
            </Link>
            ,{" "}
            <Link
              to="/wowdb/spell-by-name/Mortal Strike"
              className="text-primary hover:underline"
            >
              Mortal Strike
            </Link>
          </p>
        </div>
      )}

      {spells && spells.length > 0 && (
        <div className="space-y-8">
          {/* Comparison Table */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Comparison Table</h2>
            <ComparisonTable spells={spells} locale={locale} />
          </div>

          {/* Tooltips Grid */}
          <div>
            <h2 className="text-lg font-semibold mb-3">
              Spell Tooltips ({spells.length} found)
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {spells.map((spell) => (
                <div key={spell.id}>
                  <SpellTooltip spell={spell} locale={locale} />
                  <Link
                    to={`/wowdb/spell/${spell.id}`}
                    className="block mt-2 text-xs text-muted-foreground hover:text-primary"
                  >
                    View details (ID: {spell.id}) →
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ComparisonTableProps {
  spells: WoWSpell[];
  locale: LocaleIndex;
}

function ComparisonTable({ spells, locale }: ComparisonTableProps) {
  return (
    <div className="overflow-x-auto border border-border rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="text-left p-3 font-medium">Spell</th>
            <th className="text-left p-3 font-medium">Defense Type</th>
            <th className="text-left p-3 font-medium">School</th>
            <th className="text-left p-3 font-medium">Aura Effects</th>
            <th className="text-left p-3 font-medium">Attributes</th>
          </tr>
        </thead>
        <tbody>
          {spells.map((spell) => {
            // school color handled by SpellSchoolText component

            return (
              <tr
                key={spell.id}
                className="border-b border-border/50 hover:bg-muted/20"
              >
                <td className="p-3">
                  <Link
                    to={`/wowdb/spell/${spell.id}`}
                    className="hover:text-primary"
                  >
                    <SpellIconWithTooltip spell={spell} locale={locale} size={24}>
                      <span>
                        {getLocalizedText(spell.name, locale)}
                        {getLocalizedText(spell.subtext, locale) && (
                          <span className="text-muted-foreground ml-1">
                            ({getLocalizedText(spell.subtext, locale)})
                          </span>
                        )}
                      </span>
                    </SpellIconWithTooltip>
                  </Link>
                </td>
                <td className="p-3">{spell.defense_type.string}</td>
                <td className="p-3">
                  <SpellSchoolText school={spell.school.string} />
                </td>
                <td className="p-3">
                  <AuraEffectsList effects={spell.effect_aura} />
                </td>
                <td className="p-3">
                  <AttributesSummary attributes={spell.attributes} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface EnumValue {
  value: number;
  string: string;
}

function AuraEffectsList({ effects }: { effects: EnumValue[] }) {
  const activeEffects = effects.filter((e) => e.string !== "None");

  if (activeEffects.length === 0) {
    return <span className="text-muted-foreground">None</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {activeEffects.map((effect, i) => (
        <span
          key={i}
          className="inline-block px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded text-xs"
        >
          {effect.string}
        </span>
      ))}
    </div>
  );
}

function AttributesSummary({ attributes }: { attributes: { blocks: number[]; string: string } | number[] }) {
  // Handle both old format (number[]) and new format ({ blocks, string })
  if (Array.isArray(attributes)) {
    const setBits = attributes.filter((a) => a !== 0);
    if (setBits.length === 0) {
      return <span className="text-muted-foreground">None</span>;
    }
    return <span className="text-muted-foreground">{setBits.length} block(s) set</span>;
  }

  if (!attributes.string || attributes.string === "none") {
    return <span className="text-muted-foreground">None</span>;
  }

  // Split the pipe-separated string into individual attributes
  const attrList = attributes.string.split(" | ");

  return (
    <details className="cursor-pointer">
      <summary className="text-blue-400 hover:text-blue-300">
        {attrList.length} attribute(s)
      </summary>
      <div className="mt-1 text-xs space-y-0.5">
        {attrList.map((attr, i) => (
          <div key={i} className="text-muted-foreground">
            {attr}
          </div>
        ))}
      </div>
    </details>
  );
}
