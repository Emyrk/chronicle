import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useCurrentItemPrices, useItemPricingRealms, useItemTooltip } from "@/api/gamedata";
import type { AuctionHouseFaction } from "@/api/typesGenerated";
import { ItemTooltip } from "@/components/ui/ItemTooltip";

function formatPrice(copper: number): string {
  const gold = Math.floor(copper / 10000);
  const silver = Math.floor((copper % 10000) / 100);
  const remainingCopper = copper % 100;
  if (gold > 0) return `${gold}g ${silver}s ${remainingCopper}c`;
  if (silver > 0) return `${silver}s ${remainingCopper}c`;
  return `${remainingCopper}c`;
}

/**
 * Item tooltip browser page.
 * Look up any item by ID and optionally specify random_property or enchant.
 *
 * URL: /wowdb/item?id=12345&random_property=454&enchant=2566
 */
export function ItemPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [itemIdInput, setItemIdInput] = useState(searchParams.get("id") ?? "");
  const [rpInput, setRpInput] = useState(searchParams.get("random_property") ?? "");
  const [enchInput, setEnchInput] = useState(searchParams.get("enchant") ?? "");

  const itemId = Number(searchParams.get("id")) || 0;
  const randomProperty = Number(searchParams.get("random_property")) || undefined;
  const enchant = Number(searchParams.get("enchant")) || undefined;

  const pricingRealmParam = searchParams.get("pricing_realm") ?? "";
  const pricingFactionParam = searchParams.get("pricing_faction") ?? "";
  const { data: pricingRealms } = useItemPricingRealms();
  const selectedPricingRealm = pricingRealms?.find((realm) => realm.id === pricingRealmParam)
    ?? (pricingRealmParam === "" && pricingRealms?.length === 1 ? pricingRealms[0] : undefined);
  const pricingFaction: AuctionHouseFaction | "" = selectedPricingRealm?.auction_house === "merged"
    ? "merged"
    : pricingFactionParam === "alliance" || pricingFactionParam === "horde"
      ? pricingFactionParam
      : selectedPricingRealm?.auction_house === "split"
        ? "alliance"
        : "";
  const { data: item, isLoading, error } = useItemTooltip(
    itemId > 0 ? { itemId, randomProperty, enchant } : null,
  );
  const { data: itemPrices, isFetching: priceFetching } = useCurrentItemPrices(
    selectedPricingRealm?.id ?? "",
    pricingFaction,
    item ? [itemId] : [],
  );
  const itemPrice = itemPrices?.find((price) => price.item_id === itemId)?.price_copper;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams(searchParams);
    if (itemIdInput) params.set("id", itemIdInput);
    else params.delete("id");
    if (rpInput) params.set("random_property", rpInput);
    else params.delete("random_property");
    if (enchInput) params.set("enchant", enchInput);
    else params.delete("enchant");
    setSearchParams(params);
  }

  function lookUpItem(id: string) {
    setItemIdInput(id);
    const params = new URLSearchParams(searchParams);
    params.set("id", id);
    params.delete("random_property");
    params.delete("enchant");
    setSearchParams(params);
  }

  function updatePricing(realmId: string, faction?: AuctionHouseFaction) {
    const params = new URLSearchParams(searchParams);
    if (realmId) params.set("pricing_realm", realmId);
    else params.delete("pricing_realm");
    if (faction) params.set("pricing_faction", faction);
    else params.delete("pricing_faction");
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
        <button type="button" className="text-blue-400 hover:underline" onClick={() => lookUpItem("19019")}>
          Thunderfury
        </button>
        <button type="button" className="text-blue-400 hover:underline" onClick={() => lookUpItem("16829")}>
          Cenarion Boots (set)
        </button>
        <button type="button" className="text-blue-400 hover:underline" onClick={() => lookUpItem("2169")}>
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
        {item && <ItemTooltip item={item} includeReferenceLinks showItemLevel />}
      </div>

      {item && (pricingRealms?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-700 bg-gray-900/50 px-3 py-2">
          <span className="text-sm text-gray-400">Market price</span>
          <select
            aria-label="Pricing realm"
            value={selectedPricingRealm?.id ?? ""}
            onChange={(event) => {
              const realm = pricingRealms?.find((candidate) => candidate.id === event.target.value);
              updatePricing(realm?.id ?? "", realm?.auction_house === "split" ? "alliance" : undefined);
            }}
            className="bg-gray-800 border border-gray-600 rounded px-2.5 py-1.5 text-sm text-white hover:border-gray-500 transition-colors"
          >
            {(pricingRealms?.length ?? 0) > 1 && <option value="">Select realm</option>}
            {pricingRealms?.map((realm) => (
              <option key={realm.id} value={realm.id}>
                {realm.server_name} · {realm.realm_name}
              </option>
            ))}
          </select>
          {selectedPricingRealm?.auction_house === "split" && (
            <select
              aria-label="Auction house faction"
              value={pricingFaction}
              onChange={(event) => updatePricing(selectedPricingRealm.id, event.target.value as AuctionHouseFaction)}
              className="bg-gray-800 border border-gray-600 rounded px-2.5 py-1.5 text-sm text-white hover:border-gray-500 transition-colors"
            >
              <option value="alliance">Alliance</option>
              <option value="horde">Horde</option>
            </select>
          )}
          {priceFetching && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          {!priceFetching && itemPrice !== undefined && (
            <span className="ml-auto text-amber-300 font-medium tabular-nums">
              {formatPrice(itemPrice)}
            </span>
          )}
          {!priceFetching && selectedPricingRealm && itemPrice === undefined && (
            <span className="ml-auto text-sm text-gray-500">No price available</span>
          )}
          <div className="w-full border-t border-gray-700/70 pt-2 text-xs text-gray-500">
            Item data provided by{" "}
            <a
              href="https://www.wowauctions.net/"
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 hover:text-blue-300 hover:underline transition-colors"
            >
              wowauctions.net
            </a>
            <span className="block mt-0.5">24-hour average auction price</span>
          </div>
        </div>
      )}
    </div>
  );
}
