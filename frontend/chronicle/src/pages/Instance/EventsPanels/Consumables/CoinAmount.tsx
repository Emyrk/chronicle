import { cn } from "@/lib/utils";
import { formatGold } from "./consumablesLedgerLogic";

const GOLD_IN_COPPER = 10_000;
const SILVER_IN_COPPER = 100;

/** Render a compact WoW money amount using the color of its highest denomination. */
export function CoinAmount({ copper, className }: { copper: number; className?: string }) {
  const denominationClass = copper >= GOLD_IN_COPPER
    ? "text-amber-300/90"
    : copper >= SILVER_IN_COPPER
      ? "text-[#c0c0c0]"
      : "text-[#cd7f32]";

  return (
    <span className={cn("font-mono", denominationClass, className)}>
      {formatGold(copper)}
    </span>
  );
}
