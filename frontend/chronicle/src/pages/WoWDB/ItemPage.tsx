import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useItemTooltip } from "@/api/gamedata";
import { DatasetProvider, useTenantDatasetScope } from "@/hooks/useDatasetId";
import { ItemTooltip } from "@/components/ui/ItemTooltip";

/**
 * Item tooltip browser page.
 * Look up any item by ID and optionally specify random_property or enchant.
 *
 * URL: /wowdb/item?id=12345&random_property=454&enchant=2566
 */
export function ItemPage() {
  const tenantDatasetScope = useTenantDatasetScope();
  const [searchParams, setSearchParams] = useSearchParams();
  const [itemIdInput, setItemIdInput] = useState(searchParams.get("id") ?? "");
  const [rpInput, setRpInput] = useState(searchParams.get("random_property") ?? "");
  const [enchInput, setEnchInput] = useState(searchParams.get("enchant") ?? "");

  const itemId = Number(searchParams.get("id")) || 0;
  const randomProperty = Number(searchParams.get("random_property")) || undefined;
  const enchant = Number(searchParams.get("enchant")) || undefined;

  const { data: item, isLoading, error } = useItemTooltip(
    itemId > 0 ? { itemId, randomProperty, enchant } : null,
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params: Record<string, string> = {};
    if (itemIdInput) params.id = itemIdInput;
    if (rpInput) params.random_property = rpInput;
    if (enchInput) params.enchant = enchInput;
    setSearchParams(params);
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Item Tooltip Browser</h1>
        <Link
          to="/wowdb/items"
          className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          ← Search by name
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
        <div>
          <label htmlFor="item-id" className="block text-sm text-gray-400 mb-1">
            Item ID
          </label>
          <input
            id="item-id"
            type="number"
            value={itemIdInput}
            onChange={(e) => setItemIdInput(e.target.value)}
            placeholder="e.g. 19019"
            className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white w-32 text-sm"
          />
        </div>
        <div>
          <label htmlFor="rp" className="block text-sm text-gray-400 mb-1">
            Random Property
          </label>
          <input
            id="rp"
            type="number"
            value={rpInput}
            onChange={(e) => setRpInput(e.target.value)}
            placeholder="optional"
            className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white w-32 text-sm"
          />
        </div>
        <div>
          <label htmlFor="ench" className="block text-sm text-gray-400 mb-1">
            Enchant
          </label>
          <input
            id="ench"
            type="number"
            value={enchInput}
            onChange={(e) => setEnchInput(e.target.value)}
            placeholder="optional"
            className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white w-32 text-sm"
          />
        </div>
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm"
        >
          Look Up
        </button>
      </form>

      {/* Quick links for testing */}
      <div className="text-xs text-gray-500 space-x-3">
        <span>Try:</span>
        <button type="button" className="text-blue-400 hover:underline" onClick={() => { setItemIdInput("19019"); setSearchParams({ id: "19019" }); }}>
          Thunderfury
        </button>
        <button type="button" className="text-blue-400 hover:underline" onClick={() => { setItemIdInput("16829"); setSearchParams({ id: "16829" }); }}>
          Cenarion Boots (set)
        </button>
        <button type="button" className="text-blue-400 hover:underline" onClick={() => { setItemIdInput("2169"); setSearchParams({ id: "2169" }); }}>
          Buzzer Blade (random ench)
        </button>
      </div>

      {/* Result */}
      <div className="flex justify-center pt-4">
        {isLoading && <div className="text-gray-400">Loading...</div>}
        {error && (
          <div className="text-red-400">
            {error instanceof Error ? error.message : "Failed to load item"}
          </div>
        )}
        {item && (
          <DatasetProvider
            datasetId={tenantDatasetScope.datasetId}
            iconBaseUrl={tenantDatasetScope.iconBaseUrl}
          >
            <ItemTooltip item={item} includeReferenceLinks showItemLevel />
          </DatasetProvider>
        )}
      </div>
    </div>
  );
}
